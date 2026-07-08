import os
import random
from datetime import timedelta
from core import db, new_id, utcnow, utcnow_iso, hash_password
from ml_engine import MODEL_REGISTRY

SITES = [
    {"name": "Rishikesh Barrage", "river_name": "Ganga", "river_basin": "Upper Ganga Basin", "lat": 30.0869, "lon": 78.2676,
     "elevation": 372, "warning_level_cm": 340, "danger_level_cm": 430, "catchment_area_km2": 21700, "land_use": "forest/urban",
     "soil_type": "alluvial", "historical_flood_zone": True, "flood_return_period_years": 25, "population_exposure": 102000,
     "critical_infrastructure": ["Rishikesh Barrage", "Lakshman Jhula Bridge"], "nearby_industrial_zone": False},
    {"name": "Kanpur Barrage", "river_name": "Ganga", "river_basin": "Middle Ganga Basin", "lat": 26.5010, "lon": 80.3218,
     "elevation": 126, "warning_level_cm": 360, "danger_level_cm": 460, "catchment_area_km2": 88000, "land_use": "urban/industrial",
     "soil_type": "alluvial", "historical_flood_zone": True, "flood_return_period_years": 10, "population_exposure": 2900000,
     "critical_infrastructure": ["Ganga Barrage", "Water Treatment Plant"], "nearby_industrial_zone": True},
    {"name": "Varanasi Assi Ghat", "river_name": "Ganga", "river_basin": "Middle Ganga Basin", "lat": 25.2892, "lon": 83.0076,
     "elevation": 81, "warning_level_cm": 380, "danger_level_cm": 480, "catchment_area_km2": 105000, "land_use": "dense urban",
     "soil_type": "alluvial", "historical_flood_zone": True, "flood_return_period_years": 8, "population_exposure": 1500000,
     "critical_infrastructure": ["Assi Ghat", "Ramnagar Fort"], "nearby_industrial_zone": False},
    {"name": "Delhi Wazirabad", "river_name": "Yamuna", "river_basin": "Yamuna Basin", "lat": 28.7183, "lon": 77.2295,
     "elevation": 213, "warning_level_cm": 330, "danger_level_cm": 420, "catchment_area_km2": 34500, "land_use": "dense urban",
     "soil_type": "alluvial", "historical_flood_zone": True, "flood_return_period_years": 12, "population_exposure": 4200000,
     "critical_infrastructure": ["Wazirabad Barrage", "Water Treatment Plant"], "nearby_industrial_zone": True},
    {"name": "Guwahati Pandu Port", "river_name": "Brahmaputra", "river_basin": "Brahmaputra Basin", "lat": 26.1738, "lon": 91.6708,
     "elevation": 49, "warning_level_cm": 400, "danger_level_cm": 500, "catchment_area_km2": 424000, "land_use": "urban/riverine",
     "soil_type": "silty alluvium", "historical_flood_zone": True, "flood_return_period_years": 5, "population_exposure": 1100000,
     "critical_infrastructure": ["Pandu Port", "Saraighat Bridge"], "nearby_industrial_zone": True},
]


async def seed_all():
    org = await db.organizations.find_one({})
    if not org:
        org = {"id": new_id(), "name": "AquaSentinel Demo Authority", "slug": "aquasentinel-demo", "created_at": utcnow_iso()}
        await db.organizations.insert_one(dict(org))
    org_id = org["id"]

    admin_email = os.environ.get("ADMIN_EMAIL", "admin@aquasentinel.io")
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin@1234")
    from core import verify_password
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({"id": new_id(), "email": admin_email, "name": "Super Admin", "role": "super_admin",
                                   "organization_id": org_id, "password_hash": hash_password(admin_password), "created_at": utcnow_iso()})
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})

    test_users = [
        ("ops@aquasentinel.io", "Ops@12345", "Operations Manager", "operations_manager"),
        ("viewer@aquasentinel.io", "Viewer@123", "Read Only Viewer", "viewer"),
    ]
    for email, pw, name, role in test_users:
        if not await db.users.find_one({"email": email}):
            await db.users.insert_one({"id": new_id(), "email": email, "name": name, "role": role,
                                       "organization_id": org_id, "password_hash": hash_password(pw), "created_at": utcnow_iso()})

    if await db.river_sites.count_documents({}) == 0:
        for s in SITES:
            await db.river_sites.insert_one({"id": new_id(), "organization_id": org_id, "name": s["name"], "river_name": s["river_name"],
                                             "river_basin": s["river_basin"], "location": {"type": "Point", "coordinates": [s["lon"], s["lat"]]},
                                             "elevation": s["elevation"], "warning_level_cm": s["warning_level_cm"], "danger_level_cm": s["danger_level_cm"],
                                             "catchment_area_km2": s["catchment_area_km2"], "land_use": s["land_use"], "soil_type": s["soil_type"],
                                             "historical_flood_zone": s["historical_flood_zone"], "flood_return_period_years": s["flood_return_period_years"],
                                             "population_exposure": s["population_exposure"], "critical_infrastructure": s["critical_infrastructure"],
                                             "nearby_industrial_zone": s["nearby_industrial_zone"], "created_at": utcnow_iso()})

    sites = await db.river_sites.find({}, {"_id": 0}).to_list(20)

    if await db.gateways.count_documents({}) == 0:
        for i, site in enumerate(sites):
            await db.gateways.insert_one({"id": new_id(), "gateway_id": f"GW-{site['name'].split()[0].upper()[:3]}-{i+1:02d}",
                                          "name": f"{site['name']} Gateway", "organization_id": org_id, "river_site_id": site["id"],
                                          "site_name": site["name"], "gateway_status": "online", "last_seen": utcnow_iso(),
                                          "network_type": "LoRaWAN + 4G", "firmware_version": "gw-2.1.0", "queue_depth": random.randint(0, 3),
                                          "local_storage_usage_percent": random.randint(4, 22), "uptime_seconds": random.randint(100000, 3000000),
                                          "restart_count": random.randint(0, 3), "watchdog_events": random.randint(0, 2),
                                          "location": site["location"], "created_at": utcnow_iso()})

    gateways = await db.gateways.find({}, {"_id": 0}).to_list(20)

    if await db.sensors.count_documents({}) == 0:
        n = int(os.environ.get("SIM_NODES", "12"))
        for i in range(n):
            site = sites[i % len(sites)]
            gw = next(g for g in gateways if g["river_site_id"] == site["id"])
            lat = site["location"]["coordinates"][1] + random.uniform(-0.015, 0.015)
            lon = site["location"]["coordinates"][0] + random.uniform(-0.015, 0.015)
            await db.sensors.insert_one({"id": new_id(), "name": f"AQS-{i+1:04d}", "sensor_id": f"AQS-{i+1:04d}",
                                         "gateway_id": gw["id"], "organization_id": org_id, "river_site_id": site["id"],
                                         "site_name": site["name"], "firmware_version": "1.4.2", "hardware_revision": "rev-C",
                                         "device_status": "provisioned", "last_seen": None, "sampling_interval_seconds": 60,
                                         "transmission_interval_seconds": 60, "location": {"type": "Point", "coordinates": [lon, lat]},
                                         "data_source": "simulation", "battery_percent": None, "device_health_score": None,
                                         "calibration_profile_version": "cal-1.2", "configuration_version": "cfg-1.0",
                                         "created_at": utcnow_iso(), "latest": {}})

    if await db.model_registry.count_documents({}) == 0:
        for m in MODEL_REGISTRY:
            await db.model_registry.insert_one({"id": new_id(), **m, "registered_at": utcnow_iso(), "approved": False,
                                                "approval_note": "Prototype models pending field validation review"})


async def ensure_indexes():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id")
    await db.telemetry_raw.create_index([("sensor_id", 1), ("sequence_number", 1)], unique=True)
    await db.telemetry.create_index([("sensor_id", 1), ("timestamp", -1)])
    await db.telemetry.create_index("ingested_at")
    await db.telemetry.create_index("correlation_id")
    await db.predictions.create_index([("sensor_id", 1), ("timestamp", -1)])
    await db.alerts.create_index([("status", 1), ("created_at", -1)])
    await db.sensors.create_index("id")
    await db.sensors.create_index([("location", "2dsphere")])
    await db.audit_logs.create_index([("timestamp", -1)])
    await db.device_commands.create_index([("issued_at", -1)])
    await db.login_attempts.create_index("identifier")
