"""
Device Commands REST router.
Manages the downlink command lifecycle:
- POST /api/v1/commands/send     — queue a new command (requires operator permissions)
- GET  /api/v1/commands/pending  — poll pending commands
- POST /api/v1/commands/ack      — acknowledge command delivery
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.database import get_db_session
from apps.api.models import DeviceCommand, CommandAcknowledgement, SensorNode, AuditLog
from apps.api.auth import get_current_user, require_operator, CurrentUser

router = APIRouter(prefix="/commands", tags=["Device Commands"])
log = structlog.get_logger(__name__)


class CommandSendRequest(BaseModel):
    sensor_id: str
    command_type: str  # e.g., 'sampling_rate', 'reboot', 'calibrate'
    payload: dict[str, Any] | None = None
    expiry_seconds: int = 3600


class CommandResponse(BaseModel):
    command_id: str
    sensor_id: str
    command_type: str
    payload: dict[str, Any] | None
    status: str
    created_at: datetime
    expires_at: datetime | None


class CommandAckRequest(BaseModel):
    command_id: str
    sensor_id: str
    status: str  # success | error
    details: str | None = None


@router.post("/send", response_model=CommandResponse)
async def send_command(
    body: CommandSendRequest,
    db: AsyncSession = Depends(get_db_session),
    user: CurrentUser = Depends(require_operator),
) -> CommandResponse:
    """Queue a new downlink command to a sensor node."""
    # Verify sensor exists
    sensor = await db.get(SensorNode, body.sensor_id)
    if sensor is None:
        raise HTTPException(status_code=404, detail=f"Sensor '{body.sensor_id}' not found")

    expires_at = datetime.now(timezone.utc) + timedelta(seconds=body.expiry_seconds)

    cmd = DeviceCommand(
        id=f"cmd_{uuid.uuid4().hex[:12]}",
        sensor_id=body.sensor_id,
        command_type=body.command_type,
        payload=body.payload,
        status="pending",
        expires_at=expires_at,
    )
    db.add(cmd)

    # Log action
    audit = AuditLog(
        user_id=user.user_id,
        action="command.sent",
        resource_type="device_command",
        resource_id=cmd.id,
        details={"sensor_id": body.sensor_id, "command_type": body.command_type},
    )
    db.add(audit)

    await db.commit()
    log.info("command.sent", command_id=cmd.id, sensor_id=body.sensor_id)

    return CommandResponse(
        command_id=cmd.id,
        sensor_id=cmd.sensor_id,
        command_type=cmd.command_type,
        payload=cmd.payload,
        status=cmd.status,
        created_at=cmd.created_at,
        expires_at=cmd.expires_at,
    )


@router.get("/pending", response_model=list[CommandResponse])
async def get_pending_commands(
    sensor_id: str | None = None,
    db: AsyncSession = Depends(get_db_session),
) -> list[CommandResponse]:
    """Get active pending commands. Gateways call this to pull downlinks."""
    stmt = select(DeviceCommand).where(DeviceCommand.status == "pending")
    if sensor_id:
        stmt = stmt.where(DeviceCommand.sensor_id == sensor_id)
    
    result = await db.execute(stmt)
    cmds = result.scalars().all()
    
    # Filter expired commands on the fly
    now = datetime.now(timezone.utc)
    active_cmds = []
    for cmd in cmds:
        if cmd.expires_at and cmd.expires_at.replace(tzinfo=timezone.utc) < now:
            cmd.status = "expired"
            db.add(cmd)
        else:
            active_cmds.append(cmd)
            
    if len(active_cmds) < len(cmds):
        await db.commit()
        
    return [
        CommandResponse(
            command_id=c.id,
            sensor_id=c.sensor_id,
            command_type=c.command_type,
            payload=c.payload,
            status=c.status,
            created_at=c.created_at,
            expires_at=c.expires_at,
        )
        for c in active_cmds
    ]


@router.post("/ack")
async def acknowledge_command(
    body: CommandAckRequest,
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, str]:
    """Acknowledge receipt and execution of command by the sensor node."""
    cmd = await db.get(DeviceCommand, body.command_id)
    if cmd is None:
        raise HTTPException(status_code=404, detail=f"Command '{body.command_id}' not found")

    cmd.status = "acknowledged"
    cmd.sent_at = datetime.now(timezone.utc)
    db.add(cmd)

    ack = CommandAcknowledgement(
        command_id=body.command_id,
        sensor_id=body.sensor_id,
        status=body.status,
        details=body.details,
    )
    db.add(ack)

    # Log action
    audit = AuditLog(
        action="command.acknowledged",
        resource_type="device_command",
        resource_id=body.command_id,
        details={"sensor_id": body.sensor_id, "status": body.status},
    )
    db.add(audit)

    await db.commit()
    log.info("command.acknowledged", command_id=body.command_id, status=body.status)

    return {"status": "success", "message": "Acknowledgement recorded"}
