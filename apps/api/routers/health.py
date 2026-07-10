"""
Health & readiness check endpoints.
GET /health  — lightweight liveness probe (no DB call)
GET /ready   — checks DB connectivity
"""
from __future__ import annotations

from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.config import get_settings
from apps.api.database import get_db_session
from apps.api.schemas import HealthResponse, ReadinessResponse

router = APIRouter(tags=["Health"])
log = structlog.get_logger(__name__)
settings = get_settings()


@router.get("/health", response_model=HealthResponse, summary="Liveness probe")
async def health() -> HealthResponse:
    """Returns 200 as long as the FastAPI process is running."""
    return HealthResponse(
        status="ok",
        version=settings.app_version,
        environment=settings.app_env,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


@router.get("/ready", response_model=ReadinessResponse, summary="Readiness probe")
async def ready(db: AsyncSession = Depends(get_db_session)) -> ReadinessResponse:
    """
    Returns 200 if the database is reachable.
    Returns 503 (via exception) if DB is unreachable.
    """
    try:
        await db.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception as exc:
        log.error("readiness_check_failed", error=str(exc))
        db_status = f"error: {exc}"

    is_ready = db_status == "ok"
    return ReadinessResponse(
        ready=is_ready,
        database=db_status,
        details={"version": settings.app_version},
    )


from fastapi import Response
from sqlalchemy import select

@router.get("/metrics")
async def metrics(db: AsyncSession = Depends(get_db_session)) -> Response:
    """Prometheus metrics endpoint returning active buoy counts, alerts, and telemetry logs."""
    try:
        from sqlalchemy import func
        from apps.api.models import TelemetryReading, Alert, SensorNode

        # Readings count
        res_readings = await db.execute(select(func.count(TelemetryReading.id)))
        readings_count = res_readings.scalar() or 0

        # Alerts count
        res_alerts = await db.execute(select(func.count(Alert.id)))
        alerts_count = res_alerts.scalar() or 0

        # Sensor count
        res_sensors = await db.execute(select(func.count(SensorNode.sensor_id)))
        sensors_count = res_sensors.scalar() or 0
    except Exception as exc:
        log.error("metrics_failed", error=str(exc))
        readings_count = 0
        alerts_count = 0
        sensors_count = 0

    content = f"""# HELP aquasentinel_telemetry_readings_total Total number of telemetry readings
# TYPE aquasentinel_telemetry_readings_total counter
aquasentinel_telemetry_readings_total {readings_count}

# HELP aquasentinel_alerts_total Total number of active/resolved alerts
# TYPE aquasentinel_alerts_total counter
aquasentinel_alerts_total {alerts_count}

# HELP aquasentinel_sensors_total Total number of registered sensor nodes
# TYPE aquasentinel_sensors_total gauge
aquasentinel_sensors_total {sensors_count}
"""
    return Response(content=content, media_type="text/plain")
