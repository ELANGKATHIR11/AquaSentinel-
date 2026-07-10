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


async def _process_alerts_for_reading(reading: TelemetryReading, db: AsyncSession) -> None:
    from apps.api.models import Alert, AlertSeverityEnum, AlertStatusEnum, AlertTypeEnum
    
    alert_type = None
    severity = None
    summary = ""

    tilt_deg = getattr(reading, "tilt_deg", None)
    battery_voltage = getattr(reading, "battery_voltage", None)
    water_level_cm = getattr(reading, "water_level_cm", None)
    pollution_score = getattr(reading, "pollution_anomaly_score", None)

    if tilt_deg and tilt_deg > 45:
        alert_type = AlertTypeEnum.tamper
        severity = AlertSeverityEnum.critical
        summary = f"Buoy tilt warning: {tilt_deg}° tilt indicates unit may be capsized or displaced."
    elif battery_voltage and battery_voltage < 3.0:
        alert_type = AlertTypeEnum.device_health
        severity = AlertSeverityEnum.low
        summary = f"Low battery voltage: {battery_voltage}V (threshold 3.0V)."
    elif water_level_cm and water_level_cm > 250:
        alert_type = AlertTypeEnum.flood
        severity = AlertSeverityEnum.high
        summary = f"High water level detected: {water_level_cm} cm."
    elif pollution_score and pollution_score > 0.75:
        alert_type = AlertTypeEnum.pollution
        severity = AlertSeverityEnum.high
        summary = f"Water pollution anomaly detected (anomaly score: {pollution_score})."

    if alert_type and severity:
        # Cooldown check: search active alerts for this sensor and type
        from sqlalchemy import select
        stmt = select(Alert).where(
            Alert.sensor_id == reading.sensor_id,
            Alert.type == alert_type,
            Alert.status == AlertStatusEnum.active
        )
        res = await db.execute(stmt)
        active_alert = res.scalar_one_or_none()
        if not active_alert:
            import uuid
            alert = Alert(
                id=f"alt_{uuid.uuid4().hex[:12]}",
                sensor_id=reading.sensor_id,
                timestamp=reading.timestamp,
                severity=severity,
                type=alert_type,
                summary=summary,
                status=AlertStatusEnum.active,
                source=reading.source,
                telemetry_reading_id=reading.id
            )
            db.add(alert)
            await db.flush()
            log.info("telemetry.alert_triggered", alert_id=alert.id, type=alert_type)
            
            # Broadcast WebSocket alert
            try:
                from apps.api.websocket_manager import broadcast_alert
                await broadcast_alert(alert)
            except Exception as e:
                log.warning("ws.broadcast_alert.failed", error=str(e))


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
        from apps.api.config import get_settings
        settings = get_settings()
        if settings.app_env == "development" and payload.sensor_id != "UNKNOWN" and not payload.sensor_id.startswith("test"):
            sensor = SensorNode(
                sensor_id=payload.sensor_id,
                name=f"Auto Buoy {payload.sensor_id}",
                status=SensorStatusEnum.normal,
                battery_voltage=payload.battery_voltage,
                rssi=payload.rssi,
                snr=payload.snr,
                is_active=True,
            )
            db.add(sensor)
            await db.flush()
            log.info("telemetry.ingest.auto_register", sensor_id=payload.sensor_id)
        else:
            raise HTTPException(status_code=404, detail=f"Sensor '{payload.sensor_id}' not registered")

    # --- Payload hash for dedup ---
    raw_dict = payload.model_dump(mode="json")
    payload_hash = _compute_payload_hash(raw_dict)

    # --- Quality flag & Sequence validation ---
    quality_flag = _assign_quality_flag(payload)

    # 1. Clock skew / Stale timestamp detection
    server_now = datetime.now(timezone.utc)
    payload_ts = payload.timestamp.replace(tzinfo=timezone.utc) if payload.timestamp.tzinfo is None else payload.timestamp
    time_diff = abs((server_now - payload_ts).total_seconds())
    if time_diff > 86400:  # More than 24 hours skew
        quality_flag = QualityFlagEnum.suspect
        log.warning("telemetry.ingest.clock_skew", sensor_id=payload.sensor_id, ts=payload.timestamp, time_diff=time_diff)

    # 2. Out-of-order and packet loss detection
    stmt_seq = select(TelemetryReading.sequence_no).where(TelemetryReading.sensor_id == payload.sensor_id).order_by(TelemetryReading.timestamp.desc()).limit(1)
    res_seq = await db.execute(stmt_seq)
    last_seq = res_seq.scalar_one_or_none()
    if last_seq is not None:
        if payload.sequence_no < last_seq:
            quality_flag = QualityFlagEnum.suspect
            log.warning("telemetry.ingest.out_of_order", sensor_id=payload.sensor_id, seq=payload.sequence_no, last_seq=last_seq)
        elif payload.sequence_no > last_seq + 1:
            missing_count = payload.sequence_no - last_seq - 1
            log.warning("telemetry.ingest.packet_loss", sensor_id=payload.sensor_id, missing_count=missing_count, last_seq=last_seq, current_seq=payload.sequence_no)

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

    # --- Alert processing ---
    await _process_alerts_for_reading(reading, db)

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
