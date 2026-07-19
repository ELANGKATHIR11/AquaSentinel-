"""
AquaSentinel — ThingSpeak Cloud Ingestion Worker
================================================
Polls the ThingSpeak channel feeds in the background and ingests them into the database.
"""
from __future__ import annotations

import asyncio
import datetime
import httpx
import structlog
from apps.api.database import get_db_session
from apps.api.routers.aquasentinel_router import post_sensor_data, SensorReadingPayload

log = structlog.get_logger(__name__)

CHANNEL_ID = "3430881"
READ_API_KEY = "3FHGM53MIXIRT156"

_last_processed_entry_id: int | None = None
_sync_task: asyncio.Task | None = None


async def poll_thingspeak_loop():
    global _last_processed_entry_id
    url = f"https://api.thingspeak.com/channels/{CHANNEL_ID}/feeds.json?api_key={READ_API_KEY}&results=1"
    
    log.info("thingspeak.sync_started", channel_id=CHANNEL_ID)

    while True:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    data = resp.json()
                    feeds = data.get("feeds", [])
                    if feeds:
                        feed = feeds[0]
                        entry_id = feed.get("entry_id")
                        
                        # Initialize or check if it's a new entry
                        if _last_processed_entry_id is None:
                            _last_processed_entry_id = entry_id
                            log.info("thingspeak.sync_initialized", entry_id=entry_id)
                        elif entry_id > _last_processed_entry_id:
                            _last_processed_entry_id = entry_id
                            
                            # Parse fields
                            temp = float(feed.get("field1") or 0.0)
                            raw_turbidity = float(feed.get("field2") or 0.0)
                            water_level = float(feed.get("field3") or 0.0)
                            water_flow = float(feed.get("field4") or 0.0)
                            
                            # Calibrate raw ESP32 ADC (0-4095) turbidity readings to NTU (0-1000)
                            if raw_turbidity > 1000.0:
                                adc_clamped = max(1860.0, min(3720.0, raw_turbidity))
                                voltage = (adc_clamped / 4095.0) * 3.3
                                turbidity_ntu = max(0.0, min(1000.0, (3.0 - voltage) / 1.5 * 1000.0))
                            else:
                                turbidity_ntu = raw_turbidity
                            
                            log.info("thingspeak.new_feed_detected", entry_id=entry_id, temp=temp, turbidity_raw=raw_turbidity, turbidity_ntu=turbidity_ntu)
                            
                            # Construct payload
                            payload = SensorReadingPayload(
                                temp=temp,
                                turbidity=turbidity_ntu,
                                waterLevel=water_level,
                                rain=0.0,
                                pitch=0.0,
                                roll=0.0,
                                ax=0.0,
                                ay=0.0,
                                az=1.0,
                                ph=7.0,
                                tds=200.0,
                                pressure=1013.25,
                                lat=12.9812,
                                lon=80.2321,
                                timestamp=feed.get("created_at"),
                                device_id="AQ001",
                                water_flow=water_flow
                            )
                            
                            # Ingest into database
                            async for db in get_db_session():
                                try:
                                    # Since background task doesn't have BackgroundTasks middleware, pass None
                                    await post_sensor_data(payload, db, background_tasks=None)
                                    break
                                except Exception as ingest_err:
                                    log.error("thingspeak.ingest_error", error=str(ingest_err))
                else:
                    log.warning("thingspeak.poll_failed", status=resp.status_code)
        except Exception as exc:
            log.error("thingspeak.poll_error", error=str(exc))
            
        await asyncio.sleep(5.0)


def start_thingspeak_sync():
    global _sync_task
    if _sync_task is None:
        _sync_task = asyncio.create_task(poll_thingspeak_loop())


def stop_thingspeak_sync():
    global _sync_task
    if _sync_task:
        _sync_task.cancel()
        _sync_task = None
        log.info("thingspeak.sync_stopped")
