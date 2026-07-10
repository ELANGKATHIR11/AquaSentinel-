"""
Sensor nodes REST endpoints.
GET  /api/v1/sensors           — list all sensor nodes
GET  /api/v1/sensors/{id}      — get single sensor node
GET  /api/v1/sensors/{id}/telemetry  — get telemetry history
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.database import get_db_session
from apps.api.models import SensorNode, TelemetryReading
from apps.api.schemas import SensorResponse, TelemetryResponse

router = APIRouter(prefix="/sensors", tags=["Sensors"])
log = structlog.get_logger(__name__)

STALE_THRESHOLD_MINUTES = 15


def _is_stale(last_seen: datetime | None) -> bool:
    if last_seen is None:
        return True
    now = datetime.now(timezone.utc)
    delta = now - last_seen.replace(tzinfo=timezone.utc) if last_seen.tzinfo is None else now - last_seen
    return delta > timedelta(minutes=STALE_THRESHOLD_MINUTES)


def _sensor_to_response(sensor: SensorNode) -> SensorResponse:
    """Convert ORM model to API schema, computing derived fields."""
    lat: float | None = None
    lng: float | None = None
    # GeoAlchemy2 returns WKB element; extract coords if present
    if sensor.location is not None:
        from geoalchemy2.shape import to_shape
        pt = to_shape(sensor.location)
        lat = pt.y
        lng = pt.x

    stale = _is_stale(sensor.last_seen)
    source = "iot" if not stale else "offline"

    return SensorResponse(
        sensor_id=sensor.sensor_id,
        name=sensor.name,
        site_id=sensor.site_id,
        gateway_id=sensor.gateway_id,
        status=sensor.status.value,
        last_seen=sensor.last_seen,
        latitude=lat,
        longitude=lng,
        battery_voltage=sensor.battery_voltage,
        rssi=sensor.rssi,
        snr=sensor.snr,
        water_health_score=sensor.water_health_score,
        flood_risk_score=sensor.flood_risk_score,
        pollution_anomaly_score=sensor.pollution_anomaly_score,
        source=source,
        is_stale=stale,
        is_active=sensor.is_active,
    )


@router.get("", response_model=list[SensorResponse])
async def list_sensors(
    db: AsyncSession = Depends(get_db_session),
    active_only: bool = Query(True, description="Return only active sensors"),
) -> list[SensorResponse]:
    stmt = select(SensorNode)
    if active_only:
        stmt = stmt.where(SensorNode.is_active == True)  # noqa: E712
    result = await db.execute(stmt)
    sensors = result.scalars().all()
    return [_sensor_to_response(s) for s in sensors]


@router.get("/{sensor_id}", response_model=SensorResponse)
async def get_sensor(
    sensor_id: str,
    db: AsyncSession = Depends(get_db_session),
) -> SensorResponse:
    sensor = await db.get(SensorNode, sensor_id)
    if sensor is None:
        raise HTTPException(status_code=404, detail=f"Sensor '{sensor_id}' not found")
    return _sensor_to_response(sensor)


@router.get("/{sensor_id}/telemetry", response_model=list[TelemetryResponse])
async def get_sensor_telemetry(
    sensor_id: str,
    db: AsyncSession = Depends(get_db_session),
    from_ts: Annotated[datetime | None, Query(alias="from")] = None,
    to_ts: Annotated[datetime | None, Query(alias="to")] = None,
    limit: int = Query(200, ge=1, le=1000),
) -> list[TelemetryResponse]:
    # Verify sensor exists
    sensor = await db.get(SensorNode, sensor_id)
    if sensor is None:
        raise HTTPException(status_code=404, detail=f"Sensor '{sensor_id}' not found")

    stmt = (
        select(TelemetryReading)
        .where(TelemetryReading.sensor_id == sensor_id)
        .order_by(TelemetryReading.timestamp.desc())
        .limit(limit)
    )
    if from_ts:
        stmt = stmt.where(TelemetryReading.timestamp >= from_ts)
    if to_ts:
        stmt = stmt.where(TelemetryReading.timestamp <= to_ts)

    result = await db.execute(stmt)
    readings = result.scalars().all()

    return [
        TelemetryResponse(
            id=r.id,
            sensor_id=r.sensor_id,
            gateway_id=r.gateway_id,
            sequence_no=r.sequence_no,
            timestamp=r.timestamp,
            received_at=r.received_at,
            latitude=float(r.latitude),
            longitude=float(r.longitude),
            water_level_cm=r.water_level_cm,
            ph=r.ph,
            turbidity_ntu=r.turbidity_ntu,
            temperature_c=r.temperature_c,
            tilt_deg=r.tilt_deg,
            turbulence_index=r.turbulence_index,
            battery_voltage=r.battery_voltage,
            solar_voltage=r.solar_voltage,
            rssi=r.rssi,
            snr=r.snr,
            fish_activity_index=r.fish_activity_index,
            quality_flag=r.quality_flag.value,
            source=r.source.value,
            notes=r.notes,
        )
        for r in readings
    ]
