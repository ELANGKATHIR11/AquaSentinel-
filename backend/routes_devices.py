from fastapi import APIRouter, Request, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import timedelta
from core import db, get_current_user, require_min_role, audit, new_id, utcnow, utcnow_iso, ws_manager

router = APIRouter(tags=["devices"])

VALID_COMMANDS = ["change_sampling_interval", "change_transmission_interval", "request_immediate_reading",
                  "restart_device", "enable_debug_mode", "disable_debug_mode", "update_calibration_profile",
                  "enable_camera_activity", "disable_camera_activity", "request_device_diagnostics"]


class SensorCreate(BaseModel):
    name: str
    river_site_id: str
    gateway_id: str
    latitude: float
    longitude: float
    firmware_version: str = "1.4.2"
    hardware_revision: str = "rev-C"
    sampling_interval_seconds: int = 60
    transmission_interval_seconds: int = 60
    data_source: str = "iot"


class SensorUpdate(BaseModel):
    name: Optional[str] = None
    river_site_id: Optional[str] = None
    gateway_id: Optional[str] = None
    sampling_interval_seconds: Optional[int] = None
    transmission_interval_seconds: Optional[int] = None
    device_status: Optional[str] = None


class CommandBody(BaseModel):
    sensor_id: str
    command_type: str
    params: dict = {}


@router.get("/sites")
async def list_sites(user: dict = Depends(get_current_user)):
    return await db.river_sites.find({}, {"_id": 0}).to_list(100)


@router.get("/sensors")
async def list_sensors(user: dict = Depends(get_current_user), status: Optional[str] = None, site_id: Optional[str] = None):
    q = {}
    if status:
        q["device_status"] = status
    if site_id:
        q["river_site_id"] = site_id
    return await db.sensors.find(q, {"_id": 0}).sort("name", 1).to_list(500)


@router.get("/sensors/geojson")
async def sensors_geojson(user: dict = Depends(get_current_user)):
    sensors = await db.sensors.find({}, {"_id": 0}).to_list(500)
    features = [{"type": "Feature", "geometry": s.get("location"),
                 "properties": {k: s.get(k) for k in ("id", "name", "device_status", "site_name", "battery_percent", "latest", "data_source")}}
                for s in sensors if s.get("location")]
    return {"type": "FeatureCollection", "features": features}


@router.get("/sensors/{sensor_id}")
async def get_sensor(sensor_id: str, user: dict = Depends(get_current_user)):
    s = await db.sensors.find_one({"id": sensor_id}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Sensor not found")
    return s


@router.post("/sensors")
async def create_sensor(body: SensorCreate, request: Request, user: dict = Depends(require_min_role("operations_manager"))):
    site = await db.river_sites.find_one({"id": body.river_site_id}, {"_id": 0})
    if not site:
        raise HTTPException(status_code=400, detail="Unknown river site")
    count = await db.sensors.count_documents({})
    doc = {"id": new_id(), "name": body.name, "sensor_id": f"AQS-{count + 1:04d}", "gateway_id": body.gateway_id,
           "organization_id": user.get("organization_id"), "river_site_id": body.river_site_id, "site_name": site["name"],
           "firmware_version": body.firmware_version, "hardware_revision": body.hardware_revision,
           "device_status": "provisioned", "last_seen": None, "sampling_interval_seconds": body.sampling_interval_seconds,
           "transmission_interval_seconds": body.transmission_interval_seconds,
           "location": {"type": "Point", "coordinates": [body.longitude, body.latitude]},
           "data_source": body.data_source, "battery_percent": None, "device_health_score": None,
           "calibration_profile_version": "cal-1.0", "configuration_version": "cfg-1.0",
           "created_at": utcnow_iso(), "latest": {}}
    await db.sensors.insert_one(dict(doc))
    await audit("sensor.created", user, "sensor", doc["id"], {"name": body.name}, request)
    doc.pop("_id", None)
    return doc


@router.patch("/sensors/{sensor_id}")
async def update_sensor(sensor_id: str, body: SensorUpdate, request: Request, user: dict = Depends(require_min_role("field_engineer"))):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")
    res = await db.sensors.update_one({"id": sensor_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Sensor not found")
    await audit("sensor.updated", user, "sensor", sensor_id, updates, request)
    if "device_status" in updates:
        await ws_manager.broadcast("sensor.status_changed", {"sensor_id": sensor_id, "device_status": updates["device_status"]})
    return await db.sensors.find_one({"id": sensor_id}, {"_id": 0})


@router.post("/sensors/{sensor_id}/retire")
async def retire_sensor(sensor_id: str, request: Request, user: dict = Depends(require_min_role("operations_manager"))):
    res = await db.sensors.update_one({"id": sensor_id}, {"$set": {"device_status": "retired", "retired_at": utcnow_iso()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Sensor not found")
    await audit("sensor.retired", user, "sensor", sensor_id, request=request)
    await ws_manager.broadcast("sensor.status_changed", {"sensor_id": sensor_id, "device_status": "retired"})
    return {"status": "retired"}


@router.get("/gateways")
async def list_gateways(user: dict = Depends(get_current_user)):
    gws = await db.gateways.find({}, {"_id": 0}).to_list(100)
    for g in gws:
        g["sensor_count"] = await db.sensors.count_documents({"gateway_id": g["id"], "device_status": {"$ne": "retired"}})
    return gws


@router.get("/commands")
async def list_commands(user: dict = Depends(get_current_user), sensor_id: Optional[str] = None):
    q = {"sensor_id": sensor_id} if sensor_id else {}
    return await db.device_commands.find(q, {"_id": 0}).sort("issued_at", -1).to_list(200)


@router.post("/commands")
async def issue_command(body: CommandBody, request: Request, user: dict = Depends(require_min_role("field_engineer"))):
    if body.command_type not in VALID_COMMANDS:
        raise HTTPException(status_code=400, detail=f"Invalid command. Valid: {VALID_COMMANDS}")
    sensor = await db.sensors.find_one({"id": body.sensor_id}, {"_id": 0})
    if not sensor:
        raise HTTPException(status_code=404, detail="Sensor not found")
    cmd = {"id": new_id(), "command_id": f"CMD-{new_id()[:8].upper()}", "sensor_id": body.sensor_id,
           "sensor_name": sensor.get("name"), "command_type": body.command_type, "params": body.params,
           "issued_by": user["email"], "issued_at": utcnow_iso(),
           "expires_at": (utcnow() + timedelta(minutes=30)).isoformat(),
           "status": "sent", "acknowledged_at": None, "response_payload": None}
    await db.device_commands.insert_one(dict(cmd))
    await audit("command.issued", user, "device_command", cmd["id"], {"command_type": body.command_type, "sensor_id": body.sensor_id, "params": body.params}, request)
    cmd.pop("_id", None)
    await ws_manager.broadcast("command.sent", cmd)
    return cmd
