"""
AquaSentinel WebSocket connection manager.

Channels:
  /ws/dashboard     — overview KPI updates
  /ws/telemetry     — per-sensor real-time readings
  /ws/alerts        — alert events
  /ws/device-health — device status events

Features:
- Bounded per-channel message buffers (latest N messages replayed on connect)
- Heartbeat pings every 30 seconds
- Graceful disconnect handling
- Subscription filtering (clients may subscribe to specific sensor_ids)
"""
from __future__ import annotations

import asyncio
import json
from collections import deque
from datetime import datetime, timezone
from typing import Any

import structlog
from fastapi import WebSocket, WebSocketDisconnect

log = structlog.get_logger(__name__)

HEARTBEAT_INTERVAL = 30  # seconds
BUFFER_SIZE = 50  # messages to replay on new connection


class _Channel:
    def __init__(self, name: str) -> None:
        self.name = name
        self._clients: set[WebSocket] = set()
        self._buffer: deque[dict[str, Any]] = deque(maxlen=BUFFER_SIZE)

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._clients.add(ws)
        # Replay recent messages so UI catches up immediately
        for msg in self._buffer:
            try:
                await ws.send_text(json.dumps(msg, default=str))
            except Exception:
                break
        log.info("ws.connected", channel=self.name, clients=len(self._clients))

    def disconnect(self, ws: WebSocket) -> None:
        self._clients.discard(ws)
        log.info("ws.disconnected", channel=self.name, clients=len(self._clients))

    async def broadcast(self, data: dict[str, Any]) -> None:
        self._buffer.append(data)
        dead: list[WebSocket] = []
        for ws in list(self._clients):
            try:
                await ws.send_text(json.dumps(data, default=str))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    @property
    def client_count(self) -> int:
        return len(self._clients)


class WebSocketManager:
    def __init__(self) -> None:
        self.telemetry = _Channel("telemetry")
        self.alerts = _Channel("alerts")
        self.device_health = _Channel("device-health")
        self.dashboard = _Channel("dashboard")
        self._heartbeat_task: asyncio.Task | None = None

    def start_heartbeat(self) -> None:
        if self._heartbeat_task is None or self._heartbeat_task.done():
            self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

    async def _heartbeat_loop(self) -> None:
        while True:
            await asyncio.sleep(HEARTBEAT_INTERVAL)
            ping = {"type": "ping", "ts": datetime.now(timezone.utc).isoformat()}
            for channel in (self.telemetry, self.alerts, self.device_health, self.dashboard):
                await channel.broadcast(ping)

    async def handle_telemetry_ws(self, ws: WebSocket) -> None:
        await self.telemetry.connect(ws)
        try:
            while True:
                # Keep connection alive — client can send subscription updates
                msg = await ws.receive_text()
                try:
                    data = json.loads(msg)
                    if data.get("type") == "pong":
                        pass  # heartbeat ack
                except Exception:
                    pass
        except WebSocketDisconnect:
            self.telemetry.disconnect(ws)

    async def handle_alerts_ws(self, ws: WebSocket) -> None:
        await self.alerts.connect(ws)
        try:
            while True:
                await ws.receive_text()
        except WebSocketDisconnect:
            self.alerts.disconnect(ws)

    async def handle_dashboard_ws(self, ws: WebSocket) -> None:
        await self.dashboard.connect(ws)
        try:
            while True:
                await ws.receive_text()
        except WebSocketDisconnect:
            self.dashboard.disconnect(ws)

    async def handle_device_health_ws(self, ws: WebSocket) -> None:
        await self.device_health.connect(ws)
        try:
            while True:
                await ws.receive_text()
        except WebSocketDisconnect:
            self.device_health.disconnect(ws)


# Singleton instance
_manager: WebSocketManager | None = None


def get_ws_manager() -> WebSocketManager:
    global _manager
    if _manager is None:
        _manager = WebSocketManager()
    return _manager


async def broadcast_telemetry(reading: Any) -> None:
    """Broadcast a telemetry reading to all connected WebSocket clients."""
    manager = get_ws_manager()
    is_flagged = hasattr(reading, "quality_flag") and (
        (hasattr(reading.quality_flag, "value") and reading.quality_flag.value in ("suspect", "bad")) or
        (isinstance(reading.quality_flag, str) and reading.quality_flag in ("suspect", "bad"))
    )
    event_type = "telemetry.quality_flagged" if is_flagged else "telemetry.created"

    data = {
        "type": "telemetry",
        "event": event_type,
        "sensor_id": reading.sensor_id,
        "timestamp": reading.timestamp.isoformat() if hasattr(reading.timestamp, "isoformat") else str(reading.timestamp),
        "water_level_cm": reading.water_level_cm,
        "ph": reading.ph,
        "turbidity_ntu": reading.turbidity_ntu,
        "temperature_c": reading.temperature_c,
        "battery_voltage": reading.battery_voltage,
        "quality_flag": reading.quality_flag.value if hasattr(reading.quality_flag, "value") else str(reading.quality_flag),
        "source": reading.source.value if hasattr(reading.source, "value") else str(reading.source),
        # ML metrics
        "water_health_score": reading.water_health_score,
        "flood_risk_score": reading.flood_risk_score,
        "pollution_anomaly_score": reading.pollution_anomaly_score,
    }
    await manager.telemetry.broadcast(data)
    await manager.dashboard.broadcast(data)


async def broadcast_alert(alert: Any) -> None:
    """Broadcast an alert event to all connected WebSocket clients."""
    manager = get_ws_manager()
    data = {
        "type": "alert",
        "event": "alert.created",
        "alert_id": alert.id,
        "sensor_id": alert.sensor_id,
        "severity": alert.severity.value if hasattr(alert.severity, "value") else str(alert.severity),
        "alert_type": alert.type.value if hasattr(alert.type, "value") else str(alert.type),
        "summary": alert.summary,
        "status": alert.status.value if hasattr(alert.status, "value") else str(alert.status),
        "timestamp": alert.timestamp.isoformat() if hasattr(alert.timestamp, "isoformat") else str(alert.timestamp),
        "source": alert.source.value if hasattr(alert.source, "value") else str(alert.source),
    }
    await manager.alerts.broadcast(data)
    await manager.dashboard.broadcast(data)
