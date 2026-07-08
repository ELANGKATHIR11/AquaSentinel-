from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import asyncio
import logging
import uuid
from datetime import timedelta
from fastapi import FastAPI, APIRouter, WebSocket, WebSocketDisconnect, Request
from starlette.middleware.cors import CORSMiddleware

from core import db, client, ws_manager, utcnow, utcnow_iso
import ml_engine
from seed import seed_all, ensure_indexes
from simulator import simulator
import routes_auth
import routes_devices
import routes_telemetry
import routes_ops

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("aquasentinel")

app = FastAPI(title="AquaSentinel River Intelligence Platform", version="1.0.0")

api_router = APIRouter(prefix="/api")
api_router.include_router(routes_auth.router)
api_router.include_router(routes_devices.router)
api_router.include_router(routes_telemetry.router)
api_router.include_router(routes_ops.router)


@api_router.get("/")
async def root():
    return {"service": "AquaSentinel API", "status": "ok"}


app.include_router(api_router)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    rid = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    response = await call_next(request)
    response.headers["X-Request-ID"] = rid
    return response


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.websocket("/api/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws_manager.connect(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(ws)
    except Exception:
        ws_manager.disconnect(ws)


async def offline_monitor():
    while True:
        try:
            threshold = (utcnow() - timedelta(minutes=5)).isoformat()
            stale = await db.sensors.find({"device_status": "online", "last_seen": {"$lt": threshold}}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
            for s in stale:
                await db.sensors.update_one({"id": s["id"]}, {"$set": {"device_status": "offline"}})
                await ws_manager.broadcast("sensor.status_changed", {"sensor_id": s["id"], "device_status": "offline"})
            gw_threshold = (utcnow() - timedelta(minutes=10)).isoformat()
            res = await db.gateways.update_many({"gateway_status": "online", "last_seen": {"$lt": gw_threshold}}, {"$set": {"gateway_status": "offline"}})
            if res.modified_count:
                await ws_manager.broadcast("gateway.status_changed", {"offline_count": res.modified_count})
        except Exception as e:
            logger.exception("offline_monitor error: %s", e)
        await asyncio.sleep(60)


@app.on_event("startup")
async def startup():
    ml_engine.load_models()
    await ensure_indexes()
    await seed_all()
    asyncio.create_task(offline_monitor())
    if os.environ.get("SIM_ENABLED", "true").lower() == "true":
        await simulator.start()
    logger.info("AquaSentinel started")


@app.on_event("shutdown")
async def shutdown():
    await simulator.stop()
    client.close()
