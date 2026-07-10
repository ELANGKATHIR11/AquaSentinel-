"""
Alerts REST endpoints.
GET  /api/v1/alerts                   — list alerts (filterable by status/severity)
GET  /api/v1/alerts/{id}              — get single alert
POST /api/v1/alerts/{id}/acknowledge  — acknowledge alert
POST /api/v1/alerts/{id}/resolve      — resolve alert
"""
from __future__ import annotations

from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.database import get_db_session
from apps.api.models import Alert, AlertStatusEnum
from apps.api.schemas import AlertAcknowledgeRequest, AlertResolveRequest, AlertResponse

router = APIRouter(prefix="/alerts", tags=["Alerts"])
log = structlog.get_logger(__name__)


def _alert_to_response(alert: Alert) -> AlertResponse:
    return AlertResponse(
        id=alert.id,
        sensor_id=alert.sensor_id,
        timestamp=alert.timestamp,
        severity=alert.severity.value,
        type=alert.type.value,
        summary=alert.summary,
        notes=alert.notes,
        status=alert.status.value,
        assigned_to=alert.assigned_to,
        source=alert.source.value,
        created_at=alert.created_at,
    )


@router.get("", response_model=list[AlertResponse])
async def list_alerts(
    db: AsyncSession = Depends(get_db_session),
    status: str | None = Query(None, description="Filter by status: active|acknowledged|resolved"),
    sensor_id: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
) -> list[AlertResponse]:
    stmt = select(Alert).order_by(Alert.created_at.desc()).limit(limit)
    if status:
        try:
            stmt = stmt.where(Alert.status == AlertStatusEnum(status))
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Invalid status '{status}'")
    if sensor_id:
        stmt = stmt.where(Alert.sensor_id == sensor_id)
    result = await db.execute(stmt)
    return [_alert_to_response(a) for a in result.scalars().all()]


@router.get("/{alert_id}", response_model=AlertResponse)
async def get_alert(alert_id: str, db: AsyncSession = Depends(get_db_session)) -> AlertResponse:
    alert = await db.get(Alert, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail=f"Alert '{alert_id}' not found")
    return _alert_to_response(alert)


@router.post("/{alert_id}/acknowledge", response_model=AlertResponse)
async def acknowledge_alert(
    alert_id: str,
    body: AlertAcknowledgeRequest,
    db: AsyncSession = Depends(get_db_session),
) -> AlertResponse:
    alert = await db.get(Alert, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail=f"Alert '{alert_id}' not found")
    alert.status = AlertStatusEnum.acknowledged
    if body.operator_note:
        alert.notes = f"{alert.notes or ''} | Acknowledged: {body.operator_note}".strip()
    await db.commit()
    return _alert_to_response(alert)


@router.post("/{alert_id}/resolve", response_model=AlertResponse)
async def resolve_alert(
    alert_id: str,
    body: AlertResolveRequest,
    db: AsyncSession = Depends(get_db_session),
) -> AlertResponse:
    alert = await db.get(Alert, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail=f"Alert '{alert_id}' not found")
    alert.status = AlertStatusEnum.resolved
    alert.resolved_at = datetime.now(timezone.utc)
    if body.notes:
        alert.notes = f"{alert.notes or ''} | Resolved: {body.notes}".strip()
    await db.commit()
    return _alert_to_response(alert)
