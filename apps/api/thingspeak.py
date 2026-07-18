"""
AquaSentinel — ThingSpeak Integration Helper
============================================
Handles asynchronous communication with ThingSpeak IoT Platform.
Sends custom selected fields:
  Field 1: Temperature (°C)
  Field 2: Turbidity (NTU)
  Field 3: Water Level (cm)
  Field 4: Water Flow (L/min)
"""
from __future__ import annotations

import httpx
import structlog
from apps.api.config import get_settings

log = structlog.get_logger(__name__)


async def send_to_thingspeak(
    temperature: float,
    turbidity: float,
    water_level: float,
    water_flow: float,
) -> bool:
    """
    Sends telemetry data to ThingSpeak channel feed using HTTP POST asynchronously.
    """
    settings = get_settings()

    if not settings.thingspeak_enabled:
        log.debug("thingspeak.disabled")
        return False

    api_key = settings.thingspeak_write_api_key
    if not api_key:
        log.warning("thingspeak.missing_api_key", msg="ThingSpeak is enabled but Write API key is empty.")
        return False

    url = "https://api.thingspeak.com/update"
    payload = {
        "api_key": api_key,
        "field1": round(temperature, 2),
        "field2": round(turbidity, 2),
        "field3": round(water_level, 2),
        "field4": round(water_flow, 2),
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, data=payload)
            if resp.status_code == 200:
                log.info("thingspeak.send_success", response=resp.text, fields=payload)
                return True
            else:
                log.warning("thingspeak.send_failed", status=resp.status_code, response=resp.text)
                return False
    except Exception as exc:
        log.error("thingspeak.request_error", error=str(exc))
        return False
