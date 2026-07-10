"""
AquaSentinel MQTT Subscription Client
======================================
Subscribes to the MQTT broker and routes incoming telemetry packets into the
FastAPI ingestion pipeline.

Topics consumed:
  aquasentinel/{org}/{gateway}/telemetry     — raw sensor readings
  aquasentinel/{org}/{gateway}/status        — gateway heartbeat/status
  aquasentinel/{org}/{gateway}/health        — gateway health metrics

Run standalone:
  python -m apps.api.mqtt_client

Or integrated: called from FastAPI lifespan via asyncio.create_task()
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any

import structlog

log = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Topic helpers
# ---------------------------------------------------------------------------

def parse_topic(topic: str) -> dict[str, str] | None:
    """
    Parse MQTT topic into components.
    Expected format: aquasentinel/{org}/{gateway}/{type}
    Returns None if topic doesn't match the expected pattern.
    """
    parts = topic.split("/")
    if len(parts) < 4 or parts[0] != "aquasentinel":
        return None
    return {
        "org": parts[1],
        "gateway": parts[2],
        "type": parts[3],
    }


# ---------------------------------------------------------------------------
# Core MQTT Client (paho-mqtt based — Mosquitto compatible)
# ---------------------------------------------------------------------------

class AquaSentinelMQTTClient:
    """
    Async-compatible MQTT client using paho-mqtt with asyncio bridging.

    On each telemetry message received, it POSTs to the FastAPI ingest
    endpoint, which handles dedup, validation, and DB writes.

    If paho-mqtt is not installed or broker is unreachable, logs a warning
    and exits gracefully — the simulator / HTTP path still works.
    """

    def __init__(
        self,
        broker_host: str = "localhost",
        broker_port: int = 1883,
        username: str = "",
        password: str = "",
        topic_prefix: str = "aquasentinel",
        ingest_url: str = "http://localhost:8000/api/v1/telemetry/ingest",
    ) -> None:
        self.broker_host = broker_host
        self.broker_port = broker_port
        self.username = username
        self.password = password
        self.topic_prefix = topic_prefix
        self.ingest_url = ingest_url
        self._client: Any = None
        self._running = False
        self._stats = {"received": 0, "accepted": 0, "rejected": 0, "errors": 0}

    async def start(self) -> None:
        """Start the MQTT client loop in an asyncio-compatible way."""
        try:
            import paho.mqtt.client as mqtt
        except ImportError:
            log.warning("mqtt.not_available", msg="paho-mqtt not installed; MQTT ingestion disabled")
            return

        import httpx

        lwt_topic = f"{self.topic_prefix}/clients/backend/status"

        def on_connect(client: Any, userdata: Any, flags: Any, rc: int, properties: Any = None) -> None:
            if rc == 0:
                topic = f"{self.topic_prefix}/#"
                client.subscribe(topic, qos=1)
                client.publish(lwt_topic, payload="online", qos=1, retain=True)
                log.info("mqtt.connected", broker=f"{self.broker_host}:{self.broker_port}", topic=topic)
            else:
                log.error("mqtt.connect_failed", rc=rc)

        def on_message(client: Any, userdata: Any, msg: Any) -> None:
            self._stats["received"] += 1
            try:
                payload_str = msg.payload.decode("utf-8")
                payload = json.loads(payload_str)
                parts = parse_topic(msg.topic)
                if parts is None:
                    return

                msg_type = parts["type"]

                if msg_type == "telemetry":
                    # Dispatch to async handler via thread-safe call
                    asyncio.run_coroutine_threadsafe(
                        self._ingest_telemetry(payload, parts["gateway"]),
                        asyncio.get_event_loop(),
                    )
                elif msg_type == "status":
                    log.info("mqtt.gateway_status", gateway=parts["gateway"], payload=payload)
                elif msg_type == "health":
                    log.info("mqtt.gateway_health", gateway=parts["gateway"], payload=payload)

            except json.JSONDecodeError as exc:
                log.warning("mqtt.invalid_json", topic=msg.topic, error=str(exc))
                self._stats["errors"] += 1
            except Exception as exc:
                log.error("mqtt.message_error", error=str(exc))
                self._stats["errors"] += 1

        def on_disconnect(client: Any, userdata: Any, rc: int, properties: Any = None) -> None:
            log.warning("mqtt.disconnected", rc=rc)

        self._client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
        self._client.on_connect = on_connect
        self._client.on_message = on_message
        self._client.on_disconnect = on_disconnect
        self._client.will_set(lwt_topic, payload="offline", qos=1, retain=True)

        if self.username:
            self._client.username_pw_set(self.username, self.password)

        try:
            self._client.connect(self.broker_host, self.broker_port, keepalive=60)
        except ConnectionRefusedError:
            log.warning(
                "mqtt.broker_unavailable",
                broker=f"{self.broker_host}:{self.broker_port}",
                msg="MQTT broker not reachable. Telemetry via HTTP/simulator still works.",
            )
            return
        except Exception as exc:
            log.error("mqtt.connect_error", error=str(exc))
            return

        self._running = True
        self._http_client = httpx.AsyncClient(timeout=10.0)

        # Run paho loop in a background thread
        self._client.loop_start()
        log.info("mqtt.client_started")

    async def stop(self) -> None:
        if self._client and self._running:
            self._client.loop_stop()
            self._client.disconnect()
            self._running = False
        if hasattr(self, "_http_client"):
            await self._http_client.aclose()
        log.info("mqtt.client_stopped", stats=self._stats)

    async def _ingest_telemetry(self, payload: dict[str, Any], gateway_id: str) -> None:
        """Forward MQTT telemetry payload to the HTTP ingest endpoint."""
        try:
            # Ensure source is set
            payload.setdefault("source", "iot")
            payload.setdefault("gateway_id", gateway_id)

            resp = await self._http_client.post(
                self.ingest_url,
                json=payload,
                headers={"X-Gateway-Id": gateway_id},
            )
            if resp.status_code == 200:
                result = resp.json()
                if result.get("status") == "accepted":
                    self._stats["accepted"] += 1
                else:
                    self._stats["rejected"] += 1
            else:
                log.warning("mqtt.ingest_failed", status=resp.status_code, sensor_id=payload.get("sensor_id"))
                self._stats["errors"] += 1
        except Exception as exc:
            log.error("mqtt.ingest_error", error=str(exc))
            self._stats["errors"] += 1

    def publish_ack(self, gateway_id: str, sensor_id: str, sequence_no: int, status: str = "accepted") -> None:
        """Send acknowledgement back to gateway."""
        if self._client and self._running:
            topic = f"{self.topic_prefix}/ack/{gateway_id}"
            payload = json.dumps({
                "sensor_id": sensor_id,
                "sequence_no": sequence_no,
                "status": status,
                "ts": datetime.now(timezone.utc).isoformat(),
            })
            self._client.publish(topic, payload, qos=1)

    def publish_command(self, gateway_id: str, sensor_id: str, command: dict[str, Any]) -> None:
        """Send a downlink command to a sensor via the gateway."""
        if self._client and self._running:
            topic = f"{self.topic_prefix}/commands/{gateway_id}/{sensor_id}"
            self._client.publish(topic, json.dumps(command), qos=1)
            log.info("mqtt.command_sent", gateway=gateway_id, sensor=sensor_id, command=command)

    @property
    def stats(self) -> dict[str, int]:
        return self._stats.copy()


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_mqtt_client: AquaSentinelMQTTClient | None = None


def get_mqtt_client() -> AquaSentinelMQTTClient:
    global _mqtt_client
    if _mqtt_client is None:
        from apps.api.config import get_settings
        s = get_settings()
        _mqtt_client = AquaSentinelMQTTClient(
            broker_host=s.mqtt_broker_host,
            broker_port=s.mqtt_broker_port,
            username=s.mqtt_username,
            password=s.mqtt_password,
            topic_prefix=s.mqtt_topic_prefix,
        )
    return _mqtt_client


# ---------------------------------------------------------------------------
# CLI entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys
    sys.path.insert(0, str(__file__.replace("apps/api/mqtt_client.py", "")))

    async def main() -> None:
        client = get_mqtt_client()
        await client.start()
        print("MQTT client running. Press Ctrl+C to stop.")
        try:
            while True:
                await asyncio.sleep(10)
                print(f"Stats: {client.stats}")
        except KeyboardInterrupt:
            pass
        finally:
            await client.stop()

    asyncio.run(main())
