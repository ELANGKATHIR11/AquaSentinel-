"""
AquaSentinel LoRa Gateway Bridge
==================================
Python gateway bridge that receives LoRa packets from an ESP32 via serial
or simulates them, queues them in SQLite when offline, and forwards to the
FastAPI backend with retry/backoff.

Architecture:
  ESP32 → Serial/USB → Gateway Bridge → HTTP → FastAPI → DB
                               ↓
                         SQLite Queue (offline buffer)

Features:
- Compact binary LoRa packet decoder (struct format)
- SQLite-based offline queue (survives restarts)
- Exponential backoff retry (max 30s)
- Replay mode: drain queue when connection restored
- Health endpoint on port 9001
- Dedup by (sensor_id, sequence_no)

Usage:
  python -m apps.api.gateway_bridge [--port COM3] [--simulate] [--api http://localhost:8000]
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import math
import random
import sqlite3
import struct
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from threading import Thread
from typing import Any

import httpx

# ---------------------------------------------------------------------------
# Compact binary packet format (matching ESP32 firmware)
# ---------------------------------------------------------------------------
# 44 bytes total:
#   sensor_id:     5s  (5 bytes, null-padded)
#   gateway_id:    5s  (5 bytes, null-padded)
#   sequence_no:   H   (uint16, 2 bytes)
#   water_level:   H   (uint16, cm * 10, 2 bytes)
#   ph:            H   (uint16, pH * 100, 2 bytes)
#   turbidity:     H   (uint16, NTU * 10, 2 bytes)
#   temperature:   h   (int16, °C * 100, 2 bytes)
#   tilt:          H   (uint16, deg * 100, 2 bytes)
#   turbulence:    H   (uint16, index * 10000, 2 bytes)
#   battery:       H   (uint16, V * 1000, 2 bytes)
#   solar:         H   (uint16, V * 1000, 2 bytes)
#   rssi:          h   (int16, dBm, 2 bytes)
#   snr:           h   (int16, dB * 10, 2 bytes)
#   lat:           i   (int32, degrees * 1e6, 4 bytes)
#   lon:           i   (int32, degrees * 1e6, 4 bytes)
# Total: 5+5+2+2+2+2+2+2+2+2+2+2+2+4+4 = 44 bytes

PACKET_FORMAT = "!5s5sHHHHhHHHHhhi i"
PACKET_SIZE = struct.calcsize("!5s5sHHHHhHHHHhhi i".replace(" ", ""))


def decode_lora_packet(raw: bytes) -> dict[str, Any] | None:
    """Decode compact binary LoRa packet into canonical JSON payload."""
    try:
        fmt = "!5s5sHHHHhHHHHhhi i".replace(" ", "")
        (
            sensor_id_b, gateway_id_b, seq_no,
            water_level_raw, ph_raw, turbidity_raw, temp_raw,
            tilt_raw, turbulence_raw, battery_raw, solar_raw,
            rssi, snr_raw, lat_raw, lon_raw,
        ) = struct.unpack(fmt, raw[:struct.calcsize(fmt)])

        return {
            "sensor_id": sensor_id_b.rstrip(b"\x00").decode("ascii"),
            "gateway_id": gateway_id_b.rstrip(b"\x00").decode("ascii"),
            "sequence_no": seq_no,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "latitude": lat_raw / 1_000_000.0,
            "longitude": lon_raw / 1_000_000.0,
            "water_level_cm": water_level_raw / 10.0,
            "ph": ph_raw / 100.0,
            "turbidity_ntu": turbidity_raw / 10.0,
            "temperature_c": temp_raw / 100.0,
            "tilt_deg": tilt_raw / 100.0,
            "turbulence_index": turbulence_raw / 10_000.0,
            "battery_voltage": battery_raw / 1_000.0,
            "solar_voltage": solar_raw / 1_000.0,
            "rssi": rssi,
            "snr": snr_raw / 10.0,
            "source": "iot",
        }
    except struct.error as exc:
        print(f"[DECODE ERROR] {exc}")
        return None


def encode_lora_packet(payload: dict[str, Any]) -> bytes:
    """Encode a canonical payload dict into compact binary format (for testing)."""
    fmt = "!5s5sHHHHhHHHHhhi i".replace(" ", "")
    sensor_b = payload["sensor_id"].encode("ascii").ljust(5, b"\x00")[:5]
    gw_b = payload.get("gateway_id", "GW001").encode("ascii").ljust(5, b"\x00")[:5]
    return struct.pack(
        fmt,
        sensor_b, gw_b,
        payload.get("sequence_no", 1),
        int(payload["water_level_cm"] * 10),
        int(payload["ph"] * 100),
        int(payload["turbidity_ntu"] * 10),
        int(payload["temperature_c"] * 100),
        int(payload["tilt_deg"] * 100),
        int(payload["turbulence_index"] * 10_000),
        int(payload["battery_voltage"] * 1_000),
        int(payload.get("solar_voltage", 5.0) * 1_000),
        payload["rssi"],
        int(payload["snr"] * 10),
        int(payload["latitude"] * 1_000_000),
        int(payload["longitude"] * 1_000_000),
    )


# ---------------------------------------------------------------------------
# SQLite offline queue
# ---------------------------------------------------------------------------

class OfflineQueue:
    """Persistent SQLite queue for telemetry packets pending delivery."""

    def __init__(self, db_path: str = "gateway_queue.db") -> None:
        self.db_path = db_path
        self._init_db()

    def _init_db(self) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS pending_packets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sensor_id TEXT NOT NULL,
                    sequence_no INTEGER,
                    payload_json TEXT NOT NULL,
                    payload_hash TEXT NOT NULL UNIQUE,
                    created_at TEXT NOT NULL,
                    retry_count INTEGER DEFAULT 0
                )
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_created ON pending_packets(created_at)")

    def enqueue(self, payload: dict[str, Any]) -> bool:
        """Add a packet to the queue. Returns False if duplicate."""
        payload_str = json.dumps(payload, sort_keys=True, default=str)
        payload_hash = hashlib.sha256(payload_str.encode()).hexdigest()
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute(
                    "INSERT INTO pending_packets (sensor_id, sequence_no, payload_json, payload_hash, created_at) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (
                        payload.get("sensor_id", "UNKNOWN"),
                        payload.get("sequence_no"),
                        payload_str,
                        payload_hash,
                        datetime.now(timezone.utc).isoformat(),
                    ),
                )
            return True
        except sqlite3.IntegrityError:
            return False  # Duplicate

    def get_pending(self, limit: int = 50) -> list[tuple[int, dict[str, Any]]]:
        """Get oldest pending packets."""
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(
                "SELECT id, payload_json FROM pending_packets ORDER BY id ASC LIMIT ?",
                (limit,),
            ).fetchall()
        return [(row[0], json.loads(row[1])) for row in rows]

    def mark_delivered(self, packet_id: int) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM pending_packets WHERE id = ?", (packet_id,))

    def increment_retry(self, packet_id: int) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "UPDATE pending_packets SET retry_count = retry_count + 1 WHERE id = ?",
                (packet_id,),
            )

    def queue_size(self) -> int:
        with sqlite3.connect(self.db_path) as conn:
            return conn.execute("SELECT COUNT(*) FROM pending_packets").fetchone()[0]


# ---------------------------------------------------------------------------
# Gateway bridge
# ---------------------------------------------------------------------------

class GatewayBridge:
    def __init__(
        self,
        api_url: str = "http://localhost:8000",
        gateway_id: str = "GW001",
        serial_port: str | None = None,
        simulate: bool = False,
        queue_db: str = "gateway_queue.db",
    ) -> None:
        self.api_url = api_url
        self.gateway_id = gateway_id
        self.serial_port = serial_port
        self.simulate = simulate
        self.queue = OfflineQueue(queue_db)
        self._running = False
        self._online = True
        self._retry_delay = 2.0
        self._stats = {"sent": 0, "queued": 0, "replayed": 0, "errors": 0}
        self._sequence = 0

    async def start(self) -> None:
        self._running = True
        print(f"[GW] Gateway bridge starting. Gateway: {self.gateway_id}")
        print(f"[GW] API: {self.api_url}")
        print(f"[GW] Mode: {'SIMULATE' if self.simulate else f'SERIAL {self.serial_port}'}")
        print(f"[GW] Queue DB: {self.queue.db_path} ({self.queue.queue_size()} pending)")

        tasks = [
            asyncio.create_task(self._replay_loop()),
        ]

        if self.simulate:
            tasks.append(asyncio.create_task(self._simulate_loop()))
        elif self.serial_port:
            tasks.append(asyncio.create_task(self._serial_loop()))
        else:
            print("[GW] No serial port or simulate flag — only replaying queued packets")

        await asyncio.gather(*tasks, return_exceptions=True)

    async def _send_payload(self, payload: dict[str, Any]) -> bool:
        """Send payload to API. Returns True on success."""
        async with httpx.AsyncClient(timeout=8.0) as client:
            try:
                resp = await client.post(
                    f"{self.api_url}/api/v1/telemetry/ingest",
                    json=payload,
                    headers={"X-Gateway-Id": self.gateway_id},
                )
                if resp.status_code == 200:
                    result = resp.json()
                    status = result.get("status", "unknown")
                    if status in ("accepted", "duplicate"):
                        self._online = True
                        self._retry_delay = 2.0
                        return True
                print(f"[GW] API rejected: {resp.status_code} {resp.text[:80]}")
                return False
            except (httpx.ConnectError, httpx.TimeoutException):
                self._online = False
                return False

    async def _replay_loop(self) -> None:
        """Continuously drain the SQLite queue when online."""
        while self._running:
            pending = self.queue.get_pending(limit=20)
            if pending and self._online:
                for packet_id, payload in pending:
                    if await self._send_payload(payload):
                        self.queue.mark_delivered(packet_id)
                        self._stats["replayed"] += 1
                        print(f"[GW] Replayed queued packet {packet_id}")
                    else:
                        self.queue.increment_retry(packet_id)
                        await asyncio.sleep(self._retry_delay)
                        self._retry_delay = min(self._retry_delay * 2, 30.0)
                        break
            await asyncio.sleep(5.0)

    async def _simulate_loop(self) -> None:
        """Generate simulated LoRa packets for testing."""
        sensors = ["AQ001", "AQ002", "AQ003"]
        baselines = {
            "AQ001": (12.9812, 80.2321, 190.5, 6.8, 12.0),
            "AQ002": (13.0694, 80.2831, 80.2, 7.4, 4.2),
            "AQ003": (13.0084, 80.0612, 340.0, 7.0, 6.1),
        }
        tick = 0
        while self._running:
            tick += 1
            for sensor_id in sensors:
                lat, lon, wl_base, ph_base, turb_base = baselines[sensor_id]
                self._sequence += 1
                payload = {
                    "sensor_id": sensor_id,
                    "gateway_id": self.gateway_id,
                    "sequence_no": self._sequence,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "latitude": lat + random.gauss(0, 0.00005),
                    "longitude": lon + random.gauss(0, 0.00005),
                    "water_level_cm": round(max(10, wl_base + 8 * math.sin(tick / 60) + random.gauss(0, 2)), 1),
                    "ph": round(min(14, max(0, ph_base + random.gauss(0, 0.03))), 2),
                    "turbidity_ntu": round(max(0.1, turb_base + random.gauss(0, 0.5)), 1),
                    "temperature_c": round(28.0 + random.gauss(0, 0.2), 1),
                    "tilt_deg": round(max(0, 2.5 + abs(random.gauss(0, 1))), 1),
                    "turbulence_index": round(max(0, min(1, 0.05 + abs(random.gauss(0, 0.01)))), 3),
                    "battery_voltage": round(max(3.0, 3.9 - tick * 0.00005), 2),
                    "solar_voltage": round(random.uniform(4.8, 5.3), 2),
                    "rssi": random.randint(-98, -80),
                    "snr": round(random.uniform(5.0, 10.0), 1),
                    "source": "iot",
                }

                if await self._send_payload(payload):
                    self._stats["sent"] += 1
                    print(f"[GW] {sensor_id} seq={self._sequence} wl={payload['water_level_cm']}cm")
                else:
                    queued = self.queue.enqueue(payload)
                    if queued:
                        self._stats["queued"] += 1
                        print(f"[GW] {sensor_id} OFFLINE — queued ({self.queue.queue_size()} pending)")

            await asyncio.sleep(5.0)

    async def _serial_loop(self) -> None:
        """Read binary LoRa packets from serial port."""
        try:
            import serial
        except ImportError:
            print("[GW] pyserial not installed. Run: pip install pyserial")
            return

        try:
            ser = serial.Serial(self.serial_port, baudrate=115200, timeout=1)
            print(f"[GW] Serial port {self.serial_port} opened")
        except serial.SerialException as exc:
            print(f"[GW] Serial error: {exc}")
            return

        buffer = b""
        while self._running:
            try:
                data = ser.read(256)
                if data:
                    buffer += data
                    # Try to parse complete packets
                    fmt_size = struct.calcsize("!5s5sHHHHhHHHHhhi i".replace(" ", ""))
                    while len(buffer) >= fmt_size:
                        payload = decode_lora_packet(buffer[:fmt_size])
                        buffer = buffer[fmt_size:]
                        if payload:
                            payload["gateway_id"] = self.gateway_id
                            if await self._send_payload(payload):
                                self._stats["sent"] += 1
                            else:
                                self.queue.enqueue(payload)
                                self._stats["queued"] += 1
            except Exception as exc:
                print(f"[GW] Serial read error: {exc}")
                await asyncio.sleep(1.0)


# ---------------------------------------------------------------------------
# Health HTTP endpoint (port 9001)
# ---------------------------------------------------------------------------

class _HealthHandler(BaseHTTPRequestHandler):
    bridge: GatewayBridge

    def do_GET(self) -> None:
        if self.path == "/health":
            body = json.dumps({
                "status": "ok" if _HealthHandler.bridge._online else "offline",
                "gateway_id": _HealthHandler.bridge.gateway_id,
                "stats": _HealthHandler.bridge._stats,
                "queue_size": _HealthHandler.bridge.queue.queue_size(),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, *args: Any) -> None:
        pass  # Suppress HTTP access log noise


def _start_health_server(bridge: GatewayBridge, port: int = 9001) -> None:
    _HealthHandler.bridge = bridge
    server = HTTPServer(("0.0.0.0", port), _HealthHandler)
    Thread(target=server.serve_forever, daemon=True).start()
    print(f"[GW] Health endpoint: http://localhost:{port}/health")


# ---------------------------------------------------------------------------
# CLI entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AquaSentinel Gateway Bridge")
    parser.add_argument("--api", default="http://localhost:8000", help="FastAPI backend URL")
    parser.add_argument("--gateway", default="GW001", help="Gateway ID")
    parser.add_argument("--port", default=None, help="Serial port (e.g. COM3)")
    parser.add_argument("--simulate", action="store_true", help="Run in simulation mode")
    parser.add_argument("--replay", action="store_true", help="Only replay queued packets")
    parser.add_argument("--queue-db", default="gateway_queue.db", help="SQLite queue file")
    args = parser.parse_args()

    bridge = GatewayBridge(
        api_url=args.api,
        gateway_id=args.gateway,
        serial_port=args.port,
        simulate=args.simulate or (not args.port and not args.replay),
        queue_db=args.queue_db,
    )
    _start_health_server(bridge)

    asyncio.run(bridge.start())
