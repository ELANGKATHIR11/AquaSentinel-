"""
Telemetry ingestion endpoint.
POST /api/v1/telemetry/ingest  — accepts canonical IoT payload
POST /api/v1/telemetry/manual  — manual data entry (never overwrites IoT data)

Key features:
- Gateway authentication via API key header
- Packet deduplication by (sensor_id + sequence_no + timestamp + payload_hash)
- Quality flag assignment
- Raw JSONB payload preservation
- Sensor node last_seen & status update
- Audit log entry on every ingestion
"""
from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.database import get_db_session
from apps.api.models import (
    AuditLog,
    DataSourceEnum,
    Gateway,
    QualityFlagEnum,
    SensorNode,
    SensorStatusEnum,
    TelemetryReading,
)
from apps.api.schemas import TelemetryIngestPayload, TelemetryIngestResponse

router = APIRouter(prefix="/telemetry", tags=["Telemetry"])
log = structlog.get_logger(__name__)


def _compute_payload_hash(payload: dict) -> str:
    """SHA-256 of sorted JSON payload for deduplication."""
    canonical = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()


def _assign_quality_flag(payload: TelemetryIngestPayload) -> QualityFlagEnum:
    """
    Assign a quality flag based on physical plausibility checks.
    This is deterministic rule-based — no ML required.
    """
    if payload.ph < 4.0 or payload.ph > 10.0:
        return QualityFlagEnum.suspect
    if payload.turbidity_ntu > 500:
        return QualityFlagEnum.suspect
    if payload.water_level_cm <= 0:
        return QualityFlagEnum.suspect
    if payload.tilt_deg > 45:
        return QualityFlagEnum.bad  # buoy likely capsized
    if payload.battery_voltage < 3.0:
        return QualityFlagEnum.suspect
    return QualityFlagEnum.good


async def _verify_gateway(gateway_id: str | None, api_key: str | None, db: AsyncSession) -> bool:
    """
    Verify gateway API key. In development mode (app_env=development),
    gateway auth is not enforced.
    Returns True if authorized.
    """
    from apps.api.config import get_settings
    settings = get_settings()

    if settings.app_env == "development":
        return True  # Skip auth in dev mode

    if not gateway_id or not api_key:
        return False

    result = await db.execute(select(Gateway).where(Gateway.id == gateway_id, Gateway.is_active == True))  # noqa
    gateway = result.scalar_one_or_none()
    if gateway is None:
        return False

    # Hash-compare the incoming API key
    import hashlib
    incoming_hash = hashlib.sha256(api_key.encode()).hexdigest()
    return incoming_hash == gateway.api_key_hash


@router.post("/ingest", response_model=TelemetryIngestResponse, summary="Ingest IoT telemetry")
async def ingest_telemetry(
    payload: TelemetryIngestPayload,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    x_gateway_id: str | None = Header(None, alias="X-Gateway-Id"),
    x_api_key: str | None = Header(None, alias="X-Api-Key"),
    x_request_id: str | None = Header(None, alias="X-Request-Id"),
) -> TelemetryIngestResponse:
    request_id = x_request_id or str(uuid.uuid4())
    log.info("telemetry.ingest.received", sensor_id=payload.sensor_id, request_id=request_id)

    # --- Gateway authentication ---
    authorized = await _verify_gateway(x_gateway_id or payload.gateway_id, x_api_key, db)
    if not authorized:
        raise HTTPException(status_code=401, detail="Gateway authentication failed")

    # --- Verify sensor exists ---
    sensor = await db.get(SensorNode, payload.sensor_id)
    if sensor is None:
        raise HTTPException(status_code=404, detail=f"Sensor '{payload.sensor_id}' not registered")

    # --- Payload hash for dedup ---
    raw_dict = payload.model_dump(mode="python")
    payload_hash = _compute_payload_hash(raw_dict)

    # --- Quality flag ---
    quality_flag = _assign_quality_flag(payload)

    # --- Build ORM object ---
    reading = TelemetryReading(
        sensor_id=payload.sensor_id,
        gateway_id=x_gateway_id or payload.gateway_id,
        sequence_no=payload.sequence_no,
        timestamp=payload.timestamp.replace(tzinfo=timezone.utc) if payload.timestamp.tzinfo is None else payload.timestamp,
        latitude=payload.latitude,
        longitude=payload.longitude,
        water_level_cm=payload.water_level_cm,
        ph=payload.ph,
        turbidity_ntu=payload.turbidity_ntu,
        temperature_c=payload.temperature_c,
        tilt_deg=payload.tilt_deg,
        turbulence_index=payload.turbulence_index,
        battery_voltage=payload.battery_voltage,
        solar_voltage=payload.solar_voltage,
        rssi=payload.rssi,
        snr=payload.snr,
        fish_activity_index=payload.fish_activity_index,
        quality_flag=quality_flag,
        source=DataSourceEnum(payload.source),
        payload_hash=payload_hash,
        raw_payload=raw_dict,
        notes=payload.notes,
    )
    db.add(reading)

    try:
        await db.flush()  # get reading.id before commit
    except IntegrityError:
        await db.rollback()
        log.info("telemetry.ingest.duplicate", sensor_id=payload.sensor_id)
        return TelemetryIngestResponse(
            status="duplicate",
            message="Packet already received (duplicate suppressed)",
        )

    # --- ML Pipeline Triggers ---
    # Fetch historical readings for feature engineering context
    stmt_history = (
        select(TelemetryReading)
        .where(TelemetryReading.sensor_id == payload.sensor_id, TelemetryReading.id < reading.id)
        .order_by(TelemetryReading.timestamp.desc())
        .limit(24)
    )
    result_history = await db.execute(stmt_history)
    history_objs = result_history.scalars().all()
    history = [
        {
            "timestamp": r.timestamp.isoformat(),
            "water_level_cm": r.water_level_cm,
            "ph": r.ph,
            "turbidity_ntu": r.turbidity_ntu,
            "temperature_c": r.temperature_c,
            "tilt_deg": r.tilt_deg,
            "turbulence_index": r.turbulence_index,
            "battery_voltage": r.battery_voltage,
            "rssi": r.rssi,
            "snr": r.snr,
        }
        for r in reversed(history_objs)
    ]

    current_dict = {
        "sensor_id": payload.sensor_id,
        "water_level_cm": payload.water_level_cm,
        "ph": payload.ph,
        "turbidity_ntu": payload.turbidity_ntu,
        "temperature_c": payload.temperature_c,
        "tilt_deg": payload.tilt_deg,
        "turbulence_index": payload.turbulence_index,
        "battery_voltage": payload.battery_voltage,
        "rssi": payload.rssi,
        "snr": payload.snr,
    }

    try:
        from apps.api.ml.features import get_feature_vector, build_model_input
        from apps.api.ml.water_health_score import compute_from_payload
        from apps.api.ml.flood_model import predict_flood_risk
        from apps.api.ml.pollution_model import predict_pollution_anomaly

        features = get_feature_vector(current_dict, history)
        feature_vector = build_model_input(current_dict, features)

        whs_result = compute_from_payload(current_dict)
        flood_score, _ = predict_flood_risk(feature_vector)
        pollution_score, _ = predict_pollution_anomaly(
            ph=payload.ph,
            turbidity_ntu=payload.turbidity_ntu,
            temperature_c=payload.temperature_c,
            turbulence_index=payload.turbulence_index,
            turbidity_baseline_deviation=features.get("turbidity_baseline_deviation", 0.0),
            ph_rate_of_change_1h=features.get("ph_rate_of_change_1h", 0.0),
        )

        # Store on the reading
        reading.water_health_score = whs_result.score
        reading.flood_risk_score = flood_score
        reading.pollution_anomaly_score = pollution_score
        reading.model_version = "v1.0-prototype"

        # Update sensor snapshot scores
        sensor.water_health_score = whs_result.score
        sensor.flood_risk_score = flood_score
        sensor.pollution_anomaly_score = pollution_score
    except Exception as ml_exc:
        log.error("ml.inference.failed", sensor_id=payload.sensor_id, error=str(ml_exc))

    # --- Update sensor node snapshot ---
    sensor.last_seen = reading.timestamp
    sensor.battery_voltage = payload.battery_voltage
    sensor.rssi = payload.rssi
    sensor.snr = payload.snr
    if payload.latitude and payload.longitude:
        sensor.location = from_shape(
            Point(payload.longitude, payload.latitude), srid=4326
        )

    # Derive simple status from readings
    if quality_flag == QualityFlagEnum.bad:
        sensor.status = SensorStatusEnum.critical
    elif quality_flag == QualityFlagEnum.suspect:
        sensor.status = SensorStatusEnum.warning
    else:
        sensor.status = SensorStatusEnum.normal

    # --- Audit log ---
    audit = AuditLog(
        action="telemetry.ingest",
        resource_type="telemetry_reading",
        resource_id=str(reading.id),
        details={"sensor_id": payload.sensor_id, "source": payload.source, "quality_flag": quality_flag.value},
        ip_address=request.client.host if request.client else None,
        request_id=request_id,
    )
    db.add(audit)

    await db.commit()

    # --- Broadcast via WebSocket (best-effort) ---
    try:
        from apps.api.websocket_manager import broadcast_telemetry
        await broadcast_telemetry(reading)
    except Exception as exc:
        log.warning("ws.broadcast.failed", error=str(exc))

    log.info("telemetry.ingest.accepted", reading_id=reading.id, sensor_id=payload.sensor_id)
    return TelemetryIngestResponse(
        status="accepted",
        reading_id=reading.id,
        message="Telemetry accepted",
        ack_token=request_id,
    )


@router.post("/manual", response_model=TelemetryIngestResponse, summary="Submit manual reading")
async def submit_manual_telemetry(
    payload: TelemetryIngestPayload,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> TelemetryIngestResponse:
    """
    Accept manually entered sensor readings.
    These are always tagged source='manual' and NEVER overwrite IoT readings.
    """
    # Force source to manual regardless of what caller sends
    payload = payload.model_copy(update={"source": "manual"})

    # Manual readings always get a 'suspect' flag until validated
    quality_flag = QualityFlagEnum.suspect

    sensor = await db.get(SensorNode, payload.sensor_id)
    if sensor is None:
        raise HTTPException(status_code=404, detail=f"Sensor '{payload.sensor_id}' not registered")

    raw_dict = payload.model_dump(mode="python")
    payload_hash = _compute_payload_hash(raw_dict)

    reading = TelemetryReading(
        sensor_id=payload.sensor_id,
        timestamp=payload.timestamp,
        latitude=payload.latitude,
        longitude=payload.longitude,
        water_level_cm=payload.water_level_cm,
        ph=payload.ph,
        turbidity_ntu=payload.turbidity_ntu,
        temperature_c=payload.temperature_c,
        tilt_deg=payload.tilt_deg,
        turbulence_index=payload.turbulence_index,
        battery_voltage=payload.battery_voltage,
        solar_voltage=payload.solar_voltage,
        rssi=payload.rssi,
        snr=payload.snr,
        fish_activity_index=payload.fish_activity_index,
        quality_flag=quality_flag,
        source=DataSourceEnum.manual,
        payload_hash=payload_hash,
        raw_payload=raw_dict,
        notes=payload.notes,
    )
    db.add(reading)

    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        return TelemetryIngestResponse(status="duplicate", message="Manual reading already submitted")

    await db.commit()
    log.info("telemetry.manual.accepted", reading_id=reading.id, sensor_id=payload.sensor_id)
    return TelemetryIngestResponse(status="accepted", reading_id=reading.id, message="Manual reading accepted")
