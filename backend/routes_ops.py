import os
from fastapi import APIRouter, Request, HTTPException, Depends, Query
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import timedelta
from core import db, get_current_user, require_min_role, audit, new_id, utcnow, utcnow_iso, ws_manager, hash_password, ROLE_LEVELS
from ml_engine import MODEL_REGISTRY
from simulator import simulator

router = APIRouter(tags=["operations"])


class AlertAction(BaseModel):
    notes: Optional[str] = None
    assigned_to: Optional[str] = None


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str


class RoleUpdate(BaseModel):
    role: str


class SimStart(BaseModel):
    node_count: Optional[int] = None


@router.get("/dashboard/overview")
async def dashboard_overview(user: dict = Depends(get_current_user)):
    total_sensors = await db.sensors.count_documents({"device_status": {"$ne": "retired"}})
    online = await db.sensors.count_documents({"device_status": "online"})
    offline = await db.sensors.count_documents({"device_status": "offline"})
    gateways_online = await db.gateways.count_documents({"gateway_status": "online"})
    gateways_total = await db.gateways.count_documents({})
    open_alerts = await db.alerts.count_documents({"status": "open"})
    critical_alerts = await db.alerts.count_documents({"status": "open", "severity": "critical"})
    since15 = (utcnow() - timedelta(minutes=15)).isoformat()
    telemetry_15m = await db.telemetry.count_documents({"ingested_at": {"$gte": since15}})
    sensors = await db.sensors.find({"latest.water_health_score": {"$ne": None}}, {"_id": 0, "latest": 1, "site_name": 1, "name": 1, "id": 1}).to_list(500)
    healths = [s["latest"].get("water_health_score") for s in sensors if s.get("latest", {}).get("water_health_score") is not None]
    risks = [s["latest"].get("flood_risk_score") for s in sensors if s.get("latest", {}).get("flood_risk_score") is not None]
    site_risk = {}
    for s in sensors:
        sn = s.get("site_name")
        r = s.get("latest", {}).get("flood_risk_score")
        if sn and r is not None:
            site_risk.setdefault(sn, []).append(r)
    return {
        "sensors": {"total": total_sensors, "online": online, "offline": offline, "provisioned": total_sensors - online - offline},
        "gateways": {"online": gateways_online, "total": gateways_total},
        "alerts": {"open": open_alerts, "critical": critical_alerts},
        "telemetry_rate_15m": telemetry_15m,
        "avg_water_health": round(sum(healths) / len(healths), 1) if healths else None,
        "max_flood_risk": round(max(risks), 3) if risks else None,
        "site_risk": [{"site": k, "max_risk": round(max(v), 3), "sensors": len(v)} for k, v in site_risk.items()],
        "simulation": simulator.status(),
    }


@router.get("/alerts")
async def list_alerts(user: dict = Depends(get_current_user), status: Optional[str] = None, severity: Optional[str] = None, limit: int = Query(100, le=500)):
    q = {}
    if status:
        q["status"] = status
    if severity:
        q["severity"] = severity
    return await db.alerts.find(q, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)


@router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str, body: AlertAction, request: Request, user: dict = Depends(require_min_role("field_engineer"))):
    alert = await db.alerts.find_one({"id": alert_id}, {"_id": 0})
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    if alert["status"] != "open":
        raise HTTPException(status_code=400, detail=f"Alert already {alert['status']}")
    event = {"event": "acknowledged", "timestamp": utcnow_iso(), "by": user["email"], "detail": body.notes}
    await db.alerts.update_one({"id": alert_id}, {"$set": {"status": "acknowledged", "acknowledged_by": user["email"],
                                                           "assigned_to": body.assigned_to, "updated_at": utcnow_iso()},
                                                  "$push": {"incident_timeline": event}})
    await audit("alert.acknowledged", user, "alert", alert_id, {"notes": body.notes}, request)
    updated = await db.alerts.find_one({"id": alert_id}, {"_id": 0})
    await ws_manager.broadcast("alert.updated", updated)
    return updated


@router.post("/alerts/{alert_id}/resolve")
async def resolve_alert(alert_id: str, body: AlertAction, request: Request, user: dict = Depends(require_min_role("field_engineer"))):
    alert = await db.alerts.find_one({"id": alert_id}, {"_id": 0})
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    if alert["status"] == "resolved":
        raise HTTPException(status_code=400, detail="Alert already resolved")
    event = {"event": "resolved", "timestamp": utcnow_iso(), "by": user["email"], "detail": body.notes}
    await db.alerts.update_one({"id": alert_id}, {"$set": {"status": "resolved", "resolution_notes": body.notes, "updated_at": utcnow_iso()},
                                                  "$push": {"incident_timeline": event}})
    await audit("alert.resolved", user, "alert", alert_id, {"notes": body.notes}, request)
    updated = await db.alerts.find_one({"id": alert_id}, {"_id": 0})
    await ws_manager.broadcast("alert.updated", updated)
    return updated


@router.get("/notifications")
async def list_notifications(user: dict = Depends(get_current_user), limit: int = Query(30, le=100)):
    return await db.notifications.find({}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)


@router.post("/notifications/mark-read")
async def mark_notifications_read(user: dict = Depends(get_current_user)):
    await db.notifications.update_many({"read": False}, {"$set": {"read": True}})
    return {"status": "ok"}


@router.get("/ml/models")
async def ml_models(user: dict = Depends(get_current_user)):
    return await db.model_registry.find({}, {"_id": 0}).to_list(50)


@router.get("/ml/performance")
async def ml_performance(user: dict = Depends(get_current_user)):
    since = (utcnow() - timedelta(hours=24)).isoformat()
    total = await db.predictions.count_documents({"prediction_timestamp": {"$gte": since}})
    pipeline_agg = [
        {"$match": {"prediction_timestamp": {"$gte": since}}},
        {"$group": {"_id": "$flood_risk_level", "count": {"$sum": 1}, "avg_score": {"$avg": "$flood_risk_score"}}},
    ]
    dist = await db.predictions.aggregate(pipeline_agg).to_list(10)
    anomalies = await db.predictions.count_documents({"prediction_timestamp": {"$gte": since}, "pollution_anomaly_level": {"$in": ["moderate", "high"]}})
    qc_flagged = await db.telemetry.count_documents({"ingested_at": {"$gte": since}, "quality_flags.0": {"$exists": True}})
    tel_total = await db.telemetry.count_documents({"ingested_at": {"$gte": since}})
    return {"predictions_24h": total, "risk_distribution": [{"level": d["_id"], "count": d["count"], "avg_score": round(d["avg_score"], 3)} for d in dist],
            "pollution_anomalies_24h": anomalies, "telemetry_24h": tel_total, "qc_flagged_24h": qc_flagged,
            "data_quality_rate": round(1 - qc_flagged / tel_total, 4) if tel_total else None}


@router.get("/audit-logs")
async def audit_logs(user: dict = Depends(require_min_role("operations_manager")), action: Optional[str] = None, limit: int = Query(100, le=500)):
    q = {"action": {"$regex": action, "$options": "i"}} if action else {}
    return await db.audit_logs.find(q, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)


@router.get("/users")
async def list_users(user: dict = Depends(require_min_role("organization_admin"))):
    return await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(200)


@router.post("/users")
async def create_user(body: UserCreate, request: Request, user: dict = Depends(require_min_role("organization_admin"))):
    if body.role not in ROLE_LEVELS:
        raise HTTPException(status_code=400, detail=f"Invalid role. Valid: {list(ROLE_LEVELS)}")
    if ROLE_LEVELS[body.role] > ROLE_LEVELS[user["role"]]:
        raise HTTPException(status_code=403, detail="Cannot create user with higher role than your own")
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = {"id": new_id(), "email": email, "name": body.name, "role": body.role,
           "organization_id": user.get("organization_id"), "password_hash": hash_password(body.password), "created_at": utcnow_iso()}
    await db.users.insert_one(dict(doc))
    await audit("user.created", user, "user", doc["id"], {"email": email, "role": body.role}, request)
    return {k: doc[k] for k in ("id", "email", "name", "role", "organization_id", "created_at")}


@router.patch("/users/{user_id}/role")
async def update_role(user_id: str, body: RoleUpdate, request: Request, user: dict = Depends(require_min_role("organization_admin"))):
    if body.role not in ROLE_LEVELS:
        raise HTTPException(status_code=400, detail="Invalid role")
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target["email"] == os.environ.get("ADMIN_EMAIL"):
        raise HTTPException(status_code=403, detail="Cannot change the seeded super admin role")
    await db.users.update_one({"id": user_id}, {"$set": {"role": body.role}})
    await audit("user.role_changed", user, "user", user_id, {"from": target["role"], "to": body.role}, request)
    return {**target, "role": body.role}


@router.post("/simulation/start")
async def sim_start(body: SimStart, request: Request, user: dict = Depends(require_min_role("operations_manager"))):
    if body.node_count is not None and not (1 <= body.node_count <= 120):
        raise HTTPException(status_code=400, detail="node_count must be between 1 and 120")
    result = await simulator.start(body.node_count, started_by=user["email"])
    await audit("simulation.started", user, "simulation", result.get("run_id"), {"node_count": body.node_count}, request)
    return result


@router.post("/simulation/stop")
async def sim_stop(request: Request, user: dict = Depends(require_min_role("operations_manager"))):
    result = await simulator.stop()
    await audit("simulation.stopped", user, "simulation", result.get("run_id"), request=request)
    return result


@router.get("/simulation/status")
async def sim_status(user: dict = Depends(get_current_user)):
    return simulator.status()


@router.get("/health")
async def health():
    return {"status": "ok", "service": "aquasentinel-api", "timestamp": utcnow_iso()}


@router.get("/health/ready")
async def health_ready():
    try:
        await db.command("ping")
        return {"status": "ready"}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Database not ready: {e}")


@router.get("/health/system")
async def health_system(user: dict = Depends(get_current_user)):
    db_ok = True
    try:
        await db.command("ping")
    except Exception:
        db_ok = False
    since = (utcnow() - timedelta(minutes=5)).isoformat()
    recent_tel = await db.telemetry.count_documents({"ingested_at": {"$gte": since}})
    gws = await db.gateways.find({}, {"_id": 0, "gateway_id": 1, "gateway_status": 1, "name": 1, "queue_depth": 1}).to_list(50)
    return {
        "api": {"status": "ok"},
        "database": {"status": "ok" if db_ok else "down"},
        "mqtt_broker": {"status": "mock_mode", "note": "MQTT broker adapter runs in mock mode; HTTP ingestion active"},
        "ingestion": {"status": "ok" if recent_tel > 0 else "idle", "telemetry_5m": recent_tel},
        "ml_inference": {"status": "ok", "models_loaded": len(MODEL_REGISTRY)},
        "websocket": {"status": "ok", "clients": len(ws_manager.connections)},
        "gateways": gws,
        "simulation": simulator.status(),
        "timestamp": utcnow_iso(),
    }
