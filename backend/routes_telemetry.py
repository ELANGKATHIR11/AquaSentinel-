import os
import io
import csv
from fastapi import APIRouter, Request, HTTPException, Depends, Header, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from datetime import timedelta
from core import db, get_current_user, require_min_role, audit, new_id, utcnow, utcnow_iso
from pipeline import process_telemetry

router = APIRouter(tags=["telemetry"])


class TelemetryPacket(BaseModel):
    sensor_id: str
    sequence_number: int
    timestamp: Optional[str] = None
    payload_version: str = "1.0"
    water_level_cm: Optional[float] = None
    water_level_distance_cm: Optional[float] = None
    ph_raw: Optional[float] = None
    ph_calibrated: Optional[float] = None
    turbidity_raw: Optional[float] = None
    turbidity_ntu: Optional[float] = None
    temperature_c: Optional[float] = None
    dissolved_oxygen_mg_l: Optional[float] = None
    electrical_conductivity_us_cm: Optional[float] = None
    tds_ppm: Optional[float] = None
    orp_mv: Optional[float] = None
    rainfall_mm: Optional[float] = None
    rainfall_1hour: Optional[float] = None
    air_temperature_c: Optional[float] = None
    humidity_percent: Optional[float] = None
    barometric_pressure_hpa: Optional[float] = None
    flow_velocity_m_s: Optional[float] = None
    tilt_deg: Optional[float] = None
    acceleration_x: Optional[float] = None
    acceleration_y: Optional[float] = None
    acceleration_z: Optional[float] = None
    gps_latitude: Optional[float] = None
    gps_longitude: Optional[float] = None
    gps_accuracy_m: Optional[float] = None
    battery_voltage: Optional[float] = None
    battery_percent: Optional[float] = None
    solar_voltage: Optional[float] = None
    solar_current: Optional[float] = None
    device_temperature_c: Optional[float] = None
    rssi: Optional[float] = None
    snr: Optional[float] = None
    packet_loss_percent: Optional[float] = None
    gateway_id: Optional[str] = None


@router.post("/ingest/telemetry")
async def ingest_telemetry(packet: TelemetryPacket, x_device_key: str = Header(None), x_correlation_id: str = Header(None)):
    if x_device_key != os.environ.get("DEVICE_INGEST_KEY"):
        raise HTTPException(status_code=401, detail="Invalid device key")
    result = await process_telemetry(packet.model_dump(exclude_none=True), data_source="iot", correlation_id=x_correlation_id)
    if result["status"] == "rejected":
        raise HTTPException(status_code=422, detail=result["reason"])
    return result


@router.get("/telemetry")
async def query_telemetry(user: dict = Depends(get_current_user), sensor_id: Optional[str] = None,
                          hours: float = Query(6, le=168), limit: int = Query(500, le=2000),
                          data_source: Optional[str] = None):
    q = {"timestamp": {"$gte": (utcnow() - timedelta(hours=hours)).isoformat()}}
    if sensor_id:
        q["sensor_id"] = sensor_id
    if data_source:
        q["data_source"] = data_source
    rows = await db.telemetry.find(q, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    return list(reversed(rows))


@router.get("/telemetry/latest")
async def latest_telemetry(user: dict = Depends(get_current_user)):
    sensors = await db.sensors.find({}, {"_id": 0, "id": 1, "name": 1, "latest": 1, "device_status": 1, "site_name": 1}).to_list(500)
    return sensors


@router.get("/telemetry/raw/{correlation_id}")
async def raw_by_correlation(correlation_id: str, user: dict = Depends(require_min_role("analyst"))):
    raw = await db.telemetry_raw.find_one({"correlation_id": correlation_id}, {"_id": 0})
    validated = await db.telemetry.find_one({"correlation_id": correlation_id}, {"_id": 0})
    prediction = await db.predictions.find_one({"correlation_id": correlation_id}, {"_id": 0})
    if not raw:
        raise HTTPException(status_code=404, detail="Correlation ID not found")
    return {"lineage": {"raw": raw, "validated": validated, "prediction": prediction}}


@router.get("/predictions")
async def query_predictions(user: dict = Depends(get_current_user), sensor_id: Optional[str] = None, hours: float = Query(6, le=168), limit: int = Query(300, le=1000)):
    q = {"timestamp": {"$gte": (utcnow() - timedelta(hours=hours)).isoformat()}}
    if sensor_id:
        q["sensor_id"] = sensor_id
    rows = await db.predictions.find(q, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    return list(reversed(rows))


@router.get("/export/telemetry.csv")
async def export_telemetry_csv(request: Request, user: dict = Depends(get_current_user), sensor_id: Optional[str] = None, hours: float = Query(24, le=168)):
    q = {"timestamp": {"$gte": (utcnow() - timedelta(hours=hours)).isoformat()}}
    if sensor_id:
        q["sensor_id"] = sensor_id
    rows = await db.telemetry.find(q, {"_id": 0}).sort("timestamp", 1).limit(10000).to_list(10000)
    fields = ["timestamp", "sensor_id", "data_source", "water_level_cm", "ph_calibrated", "turbidity_ntu", "temperature_c",
              "dissolved_oxygen_mg_l", "tds_ppm", "rainfall_1hour", "flow_velocity_m_s", "battery_percent", "rssi",
              "water_level_slope", "rolling_mean", "data_confidence_score", "correlation_id"]
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    for r in rows:
        writer.writerow(r)
    await audit("export.telemetry_csv", user, "export", None, {"sensor_id": sensor_id, "hours": hours, "rows": len(rows)}, request)
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=aquasentinel_telemetry.csv"})


@router.get("/export/sensors.geojson")
async def export_sensors_geojson(request: Request, user: dict = Depends(get_current_user)):
    sensors = await db.sensors.find({}, {"_id": 0}).to_list(500)
    features = [{"type": "Feature", "geometry": s.get("location"),
                 "properties": {k: s.get(k) for k in ("id", "name", "device_status", "site_name", "battery_percent", "data_source")}}
                for s in sensors if s.get("location")]
    await audit("export.sensors_geojson", user, "export", None, {"count": len(features)}, request)
    return {"type": "FeatureCollection", "generated_by": user["email"], "generated_at": utcnow_iso(), "features": features}
