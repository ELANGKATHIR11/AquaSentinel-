"""
AquaSentinel — Database initialization and seed script.

Run with: python .\apps\api\scripts\seed_db.py
"""
from __future__ import annotations

import asyncio
import random
import sys
import datetime
from pathlib import Path

# Ensure project root is on sys.path
sys.path.insert(0, str(Path(__file__).parents[3]))

from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import create_async_engine

from apps.api.config import get_settings
from apps.api.database import Base
from apps.api.models import (
    Device,
    SensorData,
    Alert,
    SystemLog,
    SensorHealth,
)

settings = get_settings()

DEVICES_TO_SEED = [
    {
        "device_id": "AQ001",
        "name": "Adyar Bypass Bridge",
        "status": "online",
        "battery_level": 92.0,
        "rssi": -95.0,
        "lat": 12.9812,
        "lon": 80.2321,
    },
    {
        "device_id": "AQ002",
        "name": "Cooum Napier Bridge",
        "status": "online",
        "battery_level": 98.0,
        "rssi": -82.0,
        "lat": 13.0694,
        "lon": 80.2831,
    },
    {
        "device_id": "AQ003",
        "name": "Chembarambakkam Spillway",
        "status": "online",
        "battery_level": 95.0,
        "rssi": -91.0,
        "lat": 13.0084,
        "lon": 80.0612,
    },
    {
        "device_id": "AQ004",
        "name": "Kosasthalaiyar Ennore",
        "status": "offline",
        "battery_level": 15.0,
        "rssi": -121.0,
        "lat": 13.2163,
        "lon": 80.3151,
    },
    {
        "device_id": "AQ005",
        "name": "Buckingham Canal Mylapore",
        "status": "online",
        "battery_level": 74.0,
        "rssi": -108.0,
        "lat": 13.0291,
        "lon": 80.2643,
    },
]

def generate_telemetry_history(device_id: str, base_lat: float, base_lon: float, hours: int = 24) -> list[dict]:
    history = []
    
    base_water_level = 120.0
    base_ph = 7.2
    base_turbidity = 5.0
    base_temp = 28.0

    if device_id == "AQ001":
        base_water_level = 190.5
        base_ph = 6.8
        base_turbidity = 12.0
    elif device_id == "AQ002":
        base_water_level = 80.2
        base_ph = 7.4
        base_turbidity = 4.2
    elif device_id == "AQ003":
        base_water_level = 340.0
        base_ph = 7.0
        base_turbidity = 6.1
    elif device_id == "AQ004":
        base_water_level = 110.0
        base_ph = 6.2
        base_turbidity = 18.0
    elif device_id == "AQ005":
        base_water_level = 145.0
        base_ph = 5.1
        base_turbidity = 34.5

    now = datetime.datetime.now(datetime.timezone.utc)
    for i in range(hours, -1, -1):
        timestamp = now - datetime.timedelta(hours=i)
        noise_factor = float(random.uniform(-1.0, 1.0))
        water_level = max(10.0, base_water_level + noise_factor * 15.0 + random.uniform(-2.0, 2.0))
        ph = min(14.0, max(0.0, base_ph + noise_factor * 0.2 + random.uniform(-0.05, 0.05)))
        turbidity = max(0.1, base_turbidity + noise_factor * 3.0 + random.uniform(-0.75, 0.75))
        temp = base_temp + float(random.uniform(-1.0, 1.0))

        history.append({
            "device_id": device_id,
            "temp": round(temp, 1),
            "turbidity": round(turbidity, 1),
            "waterLevel": round(water_level, 1),
            "rain": round(max(0.0, float(random.uniform(0.0, 10.0)) if random.random() > 0.7 else 0.0), 1),
            "pitch": round(float(random.uniform(0.5, 4.0)), 1),
            "roll": round(float(random.uniform(-2.0, 2.0)), 1),
            "ax": 0.0,
            "ay": 0.0,
            "az": 1.0,
            "ph": round(ph, 2),
            "tds": round(float(random.uniform(150.0, 300.0)), 1),
            "pressure": 1013.25,
            "lat": base_lat + random.uniform(-0.0001, 0.0001),
            "lon": base_lon + random.uniform(-0.0001, 0.0001),
            "timestamp": timestamp,
        })
    return history

async def seed() -> None:
    print("=== AquaSentinel Database Seed ===")

    # Initialize tables
    async_engine = create_async_engine(settings.database_url)
    async with async_engine.begin() as conn:
        await conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE;"))
        await conn.execute(text("CREATE SCHEMA public;"))
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis;"))
        await conn.run_sync(Base.metadata.create_all)
    print("Tables initialized successfully")

    # Seed data using sessions
    from sqlalchemy.ext.asyncio import async_sessionmaker
    factory = async_sessionmaker(bind=async_engine, expire_on_commit=False)

    async with factory() as session:
        # Seed Devices
        for dev_data in DEVICES_TO_SEED:
            existing = await session.get(Device, dev_data["device_id"])
            if not existing:
                device = Device(
                    device_id=dev_data["device_id"],
                    name=dev_data["name"],
                    status=dev_data["status"],
                    battery_level=dev_data["battery_level"],
                    rssi=dev_data["rssi"],
                    last_seen=datetime.datetime.now(),
                )
                session.add(device)
        print(f"Seeded {len(DEVICES_TO_SEED)} devices")
        await session.commit()

        # Seed Telemetry History (SensorData)
        total_readings = 0
        for dev_data in DEVICES_TO_SEED:
            readings = generate_telemetry_history(
                dev_data["device_id"], dev_data["lat"], dev_data["lon"], hours=24
            )
            for r in readings:
                reading = SensorData(**r)
                session.add(reading)
            total_readings += len(readings)
        print(f"Seeded {total_readings} sensor data records")
        await session.commit()

        # Seed Alerts
        demo_alerts = [
            {
                "device_id": "AQ005",
                "type": "Low pH",
                "severity": "High",
                "message": "Severe pH drop detected. Current pH 5.1 indicates strong acidic discharge pollution anomaly.",
                "resolved": False,
            },
            {
                "device_id": "AQ003",
                "type": "High Water Level",
                "severity": "High",
                "message": "Water level exceeded high flood threshold: 340.0 cm. Spillage estimates rising.",
                "resolved": True,
            },
            {
                "device_id": "AQ001",
                "type": "High Water Level",
                "severity": "Moderate",
                "message": "Water level reached 190.5 cm.",
                "resolved": False,
            },
        ]
        for a_data in demo_alerts:
            alert = Alert(
                device_id=a_data["device_id"],
                type=a_data["type"],
                severity=a_data["severity"],
                message=a_data["message"],
                resolved=a_data["resolved"],
                timestamp=datetime.datetime.now() - datetime.timedelta(minutes=random.randint(10, 120)),
            )
            session.add(alert)
        print("Seeded demo alerts")
        await session.commit()

        # Seed SensorHealth
        sensors_list = ["DS18B20", "TSW-20M", "AJ-SR04M", "MPU6050", "Rain Sensor", "pH Sensor", "TDS Sensor", "GPS"]
        for dev in DEVICES_TO_SEED:
            for s in sensors_list:
                health = SensorHealth(
                    device_id=dev["device_id"],
                    sensor_name=s,
                    status="normal" if dev["status"] == "online" else "offline",
                    last_checked=datetime.datetime.now(),
                    error_count=0,
                )
                session.add(health)
        print("Seeded sensor health profiles")
        await session.commit()

    await async_engine.dispose()
    print("=== Database Seeding Complete! ===")

if __name__ == "__main__":
    asyncio.run(seed())
