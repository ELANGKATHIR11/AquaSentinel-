"""
GIS endpoints — returns valid GeoJSON for sensors, river sites, and zones.
GET /api/v1/gis/sensors          — FeatureCollection of all sensor nodes
GET /api/v1/gis/sites            — FeatureCollection of all river sites
GET /api/v1/gis/sensors/{id}     — single sensor Feature
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta

import structlog
from fastapi import APIRouter, Depends, HTTPException
from geoalchemy2.shape import to_shape
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.database import get_db_session
from apps.api.models import RiverSite, SensorNode
from apps.api.schemas import GeoJSONFeature, GeoJSONFeatureCollection

router = APIRouter(prefix="/gis", tags=["GIS"])
log = structlog.get_logger(__name__)

STALE_THRESHOLD_MINUTES = 15


def _sensor_feature(sensor: SensorNode) -> GeoJSONFeature | None:
    if sensor.location is None:
        return None
    pt = to_shape(sensor.location)

    now = datetime.now(timezone.utc)
    last_seen = sensor.last_seen
    if last_seen and last_seen.tzinfo is None:
        last_seen = last_seen.replace(tzinfo=timezone.utc)
    is_stale = last_seen is None or (now - last_seen) > timedelta(minutes=STALE_THRESHOLD_MINUTES)

    return GeoJSONFeature(
        geometry={"type": "Point", "coordinates": [pt.x, pt.y]},
        properties={
            "sensor_id": sensor.sensor_id,
            "name": sensor.name,
            "status": sensor.status.value,
            "last_seen": last_seen.isoformat() if last_seen else None,
            "is_stale": is_stale,
            "battery_voltage": sensor.battery_voltage,
            "rssi": sensor.rssi,
            "water_health_score": sensor.water_health_score,
            "flood_risk_score": sensor.flood_risk_score,
            "pollution_anomaly_score": sensor.pollution_anomaly_score,
            "source": "iot" if not is_stale else "offline",
            "is_active": sensor.is_active,
        },
    )


def _site_feature(site: RiverSite) -> GeoJSONFeature | None:
    if site.location is None:
        return None
    pt = to_shape(site.location)
    return GeoJSONFeature(
        geometry={"type": "Point", "coordinates": [pt.x, pt.y]},
        properties={
            "id": site.id,
            "name": site.name,
            "river_name": site.river_name,
            "description": site.description,
            "flood_threshold_cm": site.flood_threshold_cm,
        },
    )


@router.get("/sensors", response_model=GeoJSONFeatureCollection)
async def gis_sensors(db: AsyncSession = Depends(get_db_session)) -> GeoJSONFeatureCollection:
    result = await db.execute(select(SensorNode).where(SensorNode.is_active == True))  # noqa
    features = [_sensor_feature(s) for s in result.scalars().all()]
    return GeoJSONFeatureCollection(features=[f for f in features if f is not None])


@router.get("/sensors/{sensor_id}", response_model=GeoJSONFeature)
async def gis_sensor(sensor_id: str, db: AsyncSession = Depends(get_db_session)) -> GeoJSONFeature:
    sensor = await db.get(SensorNode, sensor_id)
    if sensor is None:
        raise HTTPException(status_code=404, detail=f"Sensor '{sensor_id}' not found")
    feature = _sensor_feature(sensor)
    if feature is None:
        raise HTTPException(status_code=404, detail="Sensor has no location data")
    return feature


@router.get("/sites", response_model=GeoJSONFeatureCollection)
async def gis_sites(db: AsyncSession = Depends(get_db_session)) -> GeoJSONFeatureCollection:
    result = await db.execute(select(RiverSite))
    features = [_site_feature(s) for s in result.scalars().all()]
    return GeoJSONFeatureCollection(features=[f for f in features if f is not None])
