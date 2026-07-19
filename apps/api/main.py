"""
AquaSentinel FastAPI Backend — Application Entry Point

Architecture:
  ESP32 Buoy → LoRa → Gateway → MQTT/HTTP → FastAPI → PostgreSQL + PostGIS
  → validation → feature engineering → ML/rules → alerts
  → WebSockets → React GIS dashboard

All data has a source tag: iot | manual | simulation | import | cached | offline
ML outputs are clearly labelled as prototype models — NOT validated for operational use.
"""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from apps.api.config import get_settings
from apps.api.database import close_engine, get_engine
from apps.api.logging_config import configure_logging
from apps.api.mqtt_client import get_mqtt_client
from apps.api.routers import aquasentinel_router
from apps.api.websocket_manager import get_ws_manager

settings = get_settings()
configure_logging(log_level=settings.log_level, log_format=settings.log_format)
log = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Lifespan — startup & shutdown
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    log.info("aquasentinel.startup", version=settings.app_version, env=settings.app_env)

    # Verify DB connectivity and create tables on startup
    try:
        from apps.api.database import Base, get_engine
        engine = get_engine()
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        log.info("database.connected_and_migrated")
    except Exception as exc:
        log.warning("database.connection_failed", error=str(exc))
        # Don't crash — allow health checks to report DB down

    # Start WebSocket heartbeat
    ws_manager = get_ws_manager()
    ws_manager.start_heartbeat()

    # Start MQTT client (non-fatal if broker is unavailable)
    mqtt = get_mqtt_client()
    await mqtt.start()

    # Start ThingSpeak live sync background task
    from apps.api.thingspeak_sync import start_thingspeak_sync, stop_thingspeak_sync
    start_thingspeak_sync()

    yield

    log.info("aquasentinel.shutdown")
    stop_thingspeak_sync()
    await mqtt.stop()
    await close_engine()


# ---------------------------------------------------------------------------
# Application factory
# ---------------------------------------------------------------------------

app = FastAPI(
    title="AquaSentinel API",
    description=(
        "River intelligence platform API for Tamil Nadu IoT buoy network. "
        "Provides telemetry ingestion, GIS data, alerts, and ML-derived water quality insights. "
        "\n\n**Note:** ML scores (flood risk, pollution anomaly, water health) are prototype models "
        "and are NOT validated for official water quality decisions."
    ),
    version=settings.app_version,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------

# CORS — only allow configured origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next: any) -> Response:
    """Attach a unique request ID to every request for tracing."""
    request_id = request.headers.get("X-Request-Id", str(uuid.uuid4()))
    structlog.contextvars.bind_contextvars(request_id=request_id)
    response = await call_next(request)
    response.headers["X-Request-Id"] = request_id
    structlog.contextvars.clear_contextvars()
    return response


@app.middleware("http")
async def log_requests(request: Request, call_next: any) -> Response:
    """Structured request logging."""
    log.info(
        "http.request",
        method=request.method,
        path=request.url.path,
        client=request.client.host if request.client else "unknown",
    )
    response = await call_next(request)
    log.info("http.response", status=response.status_code, path=request.url.path)
    return response


# ---------------------------------------------------------------------------
# Exception handlers
# ---------------------------------------------------------------------------

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    log.error("unhandled_exception", error=str(exc), path=request.url.path, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "path": request.url.path},
    )


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    import datetime
    return {
        "status": "ok",
        "version": settings.app_version,
        "timestamp": datetime.datetime.now().isoformat()
    }


app.include_router(aquasentinel_router.router)


# ---------------------------------------------------------------------------
# WebSocket endpoints
# ---------------------------------------------------------------------------

from fastapi import WebSocket  # noqa: E402

ws_manager = get_ws_manager()


@app.websocket("/ws/telemetry")
async def ws_telemetry(websocket: WebSocket) -> None:
    token = websocket.query_params.get("token")
    if token:
        try:
            from apps.api.auth import decode_token
            decode_token(token)
        except Exception:
            await websocket.close(code=4003)
            return
    await ws_manager.handle_telemetry_ws(websocket)


@app.websocket("/ws/alerts")
async def ws_alerts(websocket: WebSocket) -> None:
    token = websocket.query_params.get("token")
    if token:
        try:
            from apps.api.auth import decode_token
            decode_token(token)
        except Exception:
            await websocket.close(code=4003)
            return
    await ws_manager.handle_alerts_ws(websocket)


@app.websocket("/ws/dashboard")
async def ws_dashboard(websocket: WebSocket) -> None:
    token = websocket.query_params.get("token")
    if token:
        try:
            from apps.api.auth import decode_token
            decode_token(token)
        except Exception:
            await websocket.close(code=4003)
            return
    await ws_manager.handle_dashboard_ws(websocket)


@app.websocket("/ws")
async def ws_catch_all(websocket: WebSocket) -> None:
    await ws_manager.handle_dashboard_ws(websocket)


@app.websocket("/ws/device-health")
async def ws_device_health(websocket: WebSocket) -> None:
    token = websocket.query_params.get("token")
    if token:
        try:
            from apps.api.auth import decode_token
            decode_token(token)
        except Exception:
            await websocket.close(code=4003)
            return
    await ws_manager.handle_device_health_ws(websocket)
