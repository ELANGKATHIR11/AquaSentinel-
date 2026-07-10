"""
AquaSentinel — Database initialization and seed script.

Run with: python -m apps.api.scripts.seed_db

Creates:
  - aquasentinel database (if not exists)
  - PostGIS extension
  - All tables via SQLAlchemy metadata.create_all
  - Demo organization
  - 6 Tamil Nadu river sites (Adyar, Cooum, Palar, Kaveri, Vaigai, Tamiraparani)
  - 3 gateways (GW001–GW003)
  - 5 sensor nodes (AQ001–AQ005)
  - Realistic demo telemetry readings (tagged source='simulation')

Note: Manual partitions for telemetry_readings are created as a regular table
here (no TimescaleDB). See migration notes for partition management.
"""
from __future__ import annotations

import asyncio
import hashlib
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Ensure project root is on sys.path
sys.path.insert(0, str(Path(__file__).parents[3]))

from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import create_async_engine

from apps.api.config import get_settings
from apps.api.database import Base
from apps.api.models import (
    Alert,
    AlertSeverityEnum,
    AlertStatusEnum,
    AlertTypeEnum,
    CalibrationProfile,
    DataSourceEnum,
    Gateway,
    Organization,
    QualityFlagEnum,
    RiverSite,
    SensorNode,
    SensorStatusEnum,
    TelemetryReading,
    User,
    UserRoleEnum,
    Role,
    UserRole,
)

settings = get_settings()


# ---------------------------------------------------------------------------
# Seed data definitions
# ---------------------------------------------------------------------------

DEMO_ORG = {
    "id": "org_aquasentinel_demo",
    "name": "AquaSentinel Demo Organization",
    "slug": "aquasentinel-demo",
}

RIVER_SITES = [
    {
        "id": "site_adyar",
        "name": "Adyar River Basin",
        "river_name": "Adyar",
        "description": "Southern Chennai drainage and bypass overflow monitoring zone",
        "latitude": 12.9812,
        "longitude": 80.2321,
        "flood_threshold_cm": 280.0,
    },
    {
        "id": "site_cooum",
        "name": "Cooum River Central",
        "river_name": "Cooum",
        "description": "Core urban flow and industrial effluent monitoring — Napier Bridge area",
        "latitude": 13.0694,
        "longitude": 80.2831,
        "flood_threshold_cm": 220.0,
    },
    {
        "id": "site_chembar",
        "name": "Chembarambakkam Outlet",
        "river_name": "Adyar",
        "description": "Reservoir spillway discharge velocity monitoring",
        "latitude": 13.0084,
        "longitude": 80.0612,
        "flood_threshold_cm": 380.0,
    },
    {
        "id": "site_kosas",
        "name": "Kosasthalaiyar Estuary",
        "river_name": "Kosasthalaiyar",
        "description": "Northern tidal backwater interface — Ennore",
        "latitude": 13.2163,
        "longitude": 80.3151,
        "flood_threshold_cm": 200.0,
    },
    {
        "id": "site_palar",
        "name": "Palar River Delta",
        "river_name": "Palar",
        "description": "Southern Tamil Nadu — Palar delta and agricultural zone",
        "latitude": 12.6000,
        "longitude": 79.9800,
        "flood_threshold_cm": 300.0,
    },
    {
        "id": "site_tamira",
        "name": "Tamiraparani Monitoring Zone",
        "river_name": "Tamiraparani",
        "description": "Tirunelveli district — Tamiraparani lower course",
        "latitude": 8.7139,
        "longitude": 77.7567,
        "flood_threshold_cm": 250.0,
    },
]

GATEWAYS = [
    {
        "id": "GW001",
        "name": "Chennai North LoRa Gateway",
        "description": "Covers Cooum, Kosasthalaiyar, and northern sensor nodes",
        "api_key": "gw001_dev_key_aquasentinel",
        "latitude": 13.09,
        "longitude": 80.27,
    },
    {
        "id": "GW002",
        "name": "Chennai South LoRa Gateway",
        "description": "Covers Adyar, Chembarambakkam, and Buckingham Canal nodes",
        "api_key": "gw002_dev_key_aquasentinel",
        "latitude": 13.00,
        "longitude": 80.20,
    },
    {
        "id": "GW003",
        "name": "Palar Delta LoRa Gateway",
        "description": "Covers Palar river delta and southern zone sensors",
        "api_key": "gw003_dev_key_aquasentinel",
        "latitude": 12.60,
        "longitude": 79.98,
    },
]

SENSORS = [
    {
        "sensor_id": "AQ001",
        "name": "Adyar Bypass Bridge",
        "site_id": "site_adyar",
        "gateway_id": "GW002",
        "latitude": 12.9812,
        "longitude": 80.2321,
        "battery_voltage": 3.82,
        "rssi": -95,
        "snr": 4.2,
    },
    {
        "sensor_id": "AQ002",
        "name": "Cooum Napier Bridge",
        "site_id": "site_cooum",
        "gateway_id": "GW001",
        "latitude": 13.0694,
        "longitude": 80.2831,
        "battery_voltage": 4.12,
        "rssi": -82,
        "snr": 9.8,
    },
    {
        "sensor_id": "AQ003",
        "name": "Chembarambakkam Spillway",
        "site_id": "site_chembar",
        "gateway_id": "GW002",
        "latitude": 13.0084,
        "longitude": 80.0612,
        "battery_voltage": 3.95,
        "rssi": -91,
        "snr": 7.1,
    },
    {
        "sensor_id": "AQ004",
        "name": "Kosasthalaiyar Ennore",
        "site_id": "site_kosas",
        "gateway_id": "GW001",
        "latitude": 13.2163,
        "longitude": 80.3151,
        "battery_voltage": 3.21,
        "rssi": -121,
        "snr": -12.5,
    },
    {
        "sensor_id": "AQ005",
        "name": "Buckingham Canal Mylapore",
        "site_id": "site_adyar",
        "gateway_id": "GW002",
        "latitude": 13.0291,
        "longitude": 80.2643,
        "battery_voltage": 3.42,
        "rssi": -108,
        "snr": -2.3,
    },
]


def _hash_api_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def _gen_telemetry(sensor: dict, hours: int = 48) -> list[dict]:
    """Generate realistic demo telemetry for a sensor (tagged simulation)."""
    readings = []
    base_levels = {
        "AQ001": (190.5, 6.8, 12.0, 28.5),
        "AQ002": (80.2, 7.4, 4.2, 27.0),
        "AQ003": (340.0, 7.0, 6.1, 28.0),
        "AQ004": (110.0, 6.2, 18.0, 27.5),
        "AQ005": (145.0, 5.1, 34.5, 28.2),
    }
    base_wl, base_ph, base_turb, base_temp = base_levels.get(
        sensor["sensor_id"], (150.0, 7.0, 8.0, 28.0)
    )
    now = datetime.now(timezone.utc)

    for i in range(hours * 2):  # every 30 min
        ts = now - timedelta(minutes=30 * (hours * 2 - i))
        noise = random.gauss(0, 0.5)
        wl = max(10, base_wl + noise * 15 + 10 * abs(noise))
        ph = min(14, max(0, base_ph + random.gauss(0, 0.05)))
        turb = max(0.1, base_turb + abs(random.gauss(0, 1.5)))
        temp = base_temp + random.gauss(0, 0.3)
        tilt = max(0, 2.0 + random.uniform(0, 4))
        turb_idx = max(0, min(1.0, 0.05 + abs(random.gauss(0, 0.03))))
        batt = max(3.0, sensor["battery_voltage"] - i * 0.002)
        rssi = sensor["rssi"] + random.randint(-3, 3)
        snr = sensor["snr"] + random.gauss(0, 1)

        readings.append({
            "sensor_id": sensor["sensor_id"],
            "gateway_id": sensor["gateway_id"],
            "sequence_no": i + 1,
            "timestamp": ts,
            "latitude": sensor["latitude"] + random.gauss(0, 0.0001),
            "longitude": sensor["longitude"] + random.gauss(0, 0.0001),
            "water_level_cm": round(wl, 1),
            "ph": round(ph, 2),
            "turbidity_ntu": round(turb, 1),
            "temperature_c": round(temp, 1),
            "tilt_deg": round(tilt, 1),
            "turbulence_index": round(turb_idx, 3),
            "battery_voltage": round(batt, 2),
            "solar_voltage": round(random.uniform(4.8, 5.5), 2),
            "rssi": rssi,
            "snr": round(snr, 1),
            "fish_activity_index": round(random.uniform(0.3, 0.8), 2),
            "quality_flag": QualityFlagEnum.good,
            "source": DataSourceEnum.simulation,
        })

    return readings


# ---------------------------------------------------------------------------
# Main seed logic
# ---------------------------------------------------------------------------

async def seed() -> None:
    print("=== AquaSentinel Database Seed ===")

    # Create DB if not exists (sync connection)
    sync_url_base = settings.database_url_sync.rsplit("/", 1)[0]
    engine_root = create_engine(f"{sync_url_base}/postgres", isolation_level="AUTOCOMMIT")
    with engine_root.connect() as conn:
        result = conn.execute(text("SELECT 1 FROM pg_database WHERE datname='aquasentinel'"))
        if not result.fetchone():
            conn.execute(text("CREATE DATABASE aquasentinel"))
            print("Created database: aquasentinel")
        else:
            print("Database already exists: aquasentinel")
    engine_root.dispose()

    # Enable PostGIS
    engine_postgis = create_engine(settings.database_url_sync, isolation_level="AUTOCOMMIT")
    with engine_postgis.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
        conn.execute(text('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"'))
        print("PostGIS extension enabled")
    engine_postgis.dispose()

    # Create all tables
    async_engine = create_async_engine(settings.database_url)
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Tables created")

    # Seed data using sessions
    from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession
    factory = async_sessionmaker(bind=async_engine, expire_on_commit=False)

    async with factory() as session:
        # Organization
        from sqlalchemy import select
        org_result = await session.execute(
            select(Organization).where(Organization.id == DEMO_ORG["id"])
        )
        if not org_result.scalar_one_or_none():
            org = Organization(**DEMO_ORG)
            session.add(org)
            print(f"Seeded organization: {DEMO_ORG['name']}")

        # River Sites
        for site_data in RIVER_SITES:
            existing = await session.get(RiverSite, site_data["id"])
            if not existing:
                site = RiverSite(
                    id=site_data["id"],
                    organization_id=DEMO_ORG["id"],
                    name=site_data["name"],
                    river_name=site_data["river_name"],
                    description=site_data["description"],
                    location=from_shape(
                        Point(site_data["longitude"], site_data["latitude"]), srid=4326
                    ),
                    flood_threshold_cm=site_data["flood_threshold_cm"],
                )
                session.add(site)
        print(f"Seeded {len(RIVER_SITES)} river sites")

        # Gateways
        for gw_data in GATEWAYS:
            existing = await session.get(Gateway, gw_data["id"])
            if not existing:
                gw = Gateway(
                    id=gw_data["id"],
                    organization_id=DEMO_ORG["id"],
                    name=gw_data["name"],
                    description=gw_data["description"],
                    api_key_hash=_hash_api_key(gw_data["api_key"]),
                    location=from_shape(
                        Point(gw_data["longitude"], gw_data["latitude"]), srid=4326
                    ),
                    is_active=True,
                )
                session.add(gw)
        print(f"Seeded {len(GATEWAYS)} gateways")

        # Sensor Nodes
        for sensor_data in SENSORS:
            existing = await session.get(SensorNode, sensor_data["sensor_id"])
            if not existing:
                node = SensorNode(
                    sensor_id=sensor_data["sensor_id"],
                    site_id=sensor_data["site_id"],
                    gateway_id=sensor_data["gateway_id"],
                    name=sensor_data["name"],
                    status=SensorStatusEnum.normal,
                    location=from_shape(
                        Point(sensor_data["longitude"], sensor_data["latitude"]), srid=4326
                    ),
                    battery_voltage=sensor_data["battery_voltage"],
                    rssi=sensor_data["rssi"],
                    snr=sensor_data["snr"],
                    last_seen=datetime.now(timezone.utc) - timedelta(minutes=random.randint(1, 10)),
                    is_active=True,
                )
                session.add(node)

        # Commit org/sites/gateways/sensors first
        await session.commit()
        print(f"Seeded {len(SENSORS)} sensor nodes")

        # Demo telemetry
        total_readings = 0
        for sensor_data in SENSORS:
            readings_data = _gen_telemetry(sensor_data, hours=24)
            for rd in readings_data:
                import hashlib, json
                raw = {k: str(v) for k, v in rd.items()}
                payload_hash = hashlib.sha256(json.dumps(raw, sort_keys=True).encode()).hexdigest()
                reading = TelemetryReading(
                    sensor_id=rd["sensor_id"],
                    gateway_id=rd["gateway_id"],
                    sequence_no=rd["sequence_no"],
                    timestamp=rd["timestamp"],
                    latitude=rd["latitude"],
                    longitude=rd["longitude"],
                    water_level_cm=rd["water_level_cm"],
                    ph=rd["ph"],
                    turbidity_ntu=rd["turbidity_ntu"],
                    temperature_c=rd["temperature_c"],
                    tilt_deg=rd["tilt_deg"],
                    turbulence_index=rd["turbulence_index"],
                    battery_voltage=rd["battery_voltage"],
                    solar_voltage=rd["solar_voltage"],
                    rssi=rd["rssi"],
                    snr=rd["snr"],
                    fish_activity_index=rd["fish_activity_index"],
                    quality_flag=rd["quality_flag"],
                    source=rd["source"],
                    payload_hash=payload_hash,
                )
                session.add(reading)
            total_readings += len(readings_data)

        await session.commit()
        print(f"Seeded {total_readings} demo telemetry readings (source=simulation)")

        # Demo roles
        rbac_roles = [
            {"id": "super_admin", "name": "Super Administrator", "description": "Global administrator across all organizations"},
            {"id": "org_admin", "name": "Organization Administrator", "description": "Administrator of a single organization"},
            {"id": "operations_manager", "name": "Operations Manager", "description": "Manage river basins, gateways, and field operations"},
            {"id": "field_engineer", "name": "Field Engineer", "description": "Deploy, inspect, and calibrate sensors and gateways"},
            {"id": "analyst", "name": "Analyst", "description": "Access GIS maps, telemetry charts, and model results"},
            {"id": "viewer", "name": "Viewer", "description": "Read-only access to basic dashboards"},
        ]
        for role_data in rbac_roles:
            existing_role = await session.get(Role, role_data["id"])
            if not existing_role:
                role_obj = Role(**role_data)
                session.add(role_obj)
        await session.commit()
        print("Seeded RBAC roles")

        # Demo users
        from apps.api.auth import hash_password
        demo_users = [
            {"email": "superadmin@aquasentinel.com", "display_name": "Super Admin User", "role_id": "super_admin"},
            {"email": "admin@aquasentinel.com", "display_name": "Org Admin User", "role_id": "org_admin"},
            {"email": "operator@aquasentinel.com", "display_name": "Operations Manager User", "role_id": "operations_manager"},
            {"email": "field@aquasentinel.com", "display_name": "Field Engineer User", "role_id": "field_engineer"},
            {"email": "analyst@aquasentinel.com", "display_name": "Analyst User", "role_id": "analyst"},
            {"email": "viewer@aquasentinel.com", "display_name": "Viewer User", "role_id": "viewer"},
        ]
        for user_data in demo_users:
            import uuid
            # Check if user already exists
            from sqlalchemy import select
            user_select = await session.execute(select(User).where(User.email == user_data["email"]))
            existing_user = user_select.scalar_one_or_none()
            if not existing_user:
                new_user = User(
                    id=str(uuid.uuid4()),
                    organization_id=DEMO_ORG["id"],
                    email=user_data["email"],
                    display_name=user_data["display_name"],
                    hashed_password=hash_password("Password123!"),
                    role=UserRoleEnum(user_data["role_id"]) if user_data["role_id"] in [u.value for u in UserRoleEnum] else UserRoleEnum.viewer,
                    is_active=True,
                )
                session.add(new_user)
                await session.flush()
                # Associate UserRole
                assoc = UserRole(user_id=new_user.id, role_id=user_data["role_id"])
                session.add(assoc)
        await session.commit()
        print("Seeded demo users and user-role associations")

        # Demo calibration profiles
        for sensor_data in SENSORS[:3]:
            cal = CalibrationProfile(
                sensor_id=sensor_data["sensor_id"],
                ph_offset=round(random.uniform(-0.2, 0.2), 3),
                ph_slope=round(random.uniform(0.98, 1.02), 3),
                turbidity_zero_offset=round(random.uniform(0.1, 0.8), 2),
                water_level_offset_cm=round(random.uniform(-5, 5), 1),
                last_calibrated=datetime.now(timezone.utc) - timedelta(days=random.randint(5, 30)),
                operator_id="seed_script",
                validity_status="valid",
            )
            session.add(cal)

        await session.commit()
        print("Seeded calibration profiles")

    await async_engine.dispose()
    print("\n=== Seed complete! ===")
    print("Gateway API keys (for X-Api-Key header, dev mode only):")
    for gw in GATEWAYS:
        print(f"  {gw['id']}: {gw['api_key']}")


if __name__ == "__main__":
    asyncio.run(seed())
