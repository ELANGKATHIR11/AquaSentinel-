import logging
from pymongo.errors import DuplicateKeyError
from core import db, ws_manager, new_id, utcnow_iso, utcnow
import ml_engine

logger = logging.getLogger("pipeline")

QC_RANGES = {
    "water_level_cm": (0, 1500), "ph_calibrated": (0, 14), "turbidity_ntu": (0, 1000),
    "temperature_c": (-5, 60), "battery_voltage": (2.5, 5.0), "tds_ppm": (0, 3000),
    "dissolved_oxygen_mg_l": (0, 20),
}


def qc_validate(rec):
    flags = []
    for field, (lo, hi) in QC_RANGES.items():
        v = rec.get(field)
        if v is not None and not (lo <= v <= hi):
            flags.append(f"{field}_out_of_range")
    confidence = max(0.0, round(1.0 - 0.25 * len(flags), 2))
    return flags, confidence


async def compute_derived(sensor_id, rec):
    cursor = db.telemetry.find({"sensor_id": sensor_id}, {"_id": 0, "water_level_cm": 1, "timestamp": 1}).sort("timestamp", -1).limit(12)
    prev = await cursor.to_list(12)
    levels = [p["water_level_cm"] for p in prev if p.get("water_level_cm") is not None]
    level = rec.get("water_level_cm", 0)
    if levels:
        mean = sum(levels) / len(levels)
        var = sum((x - mean) ** 2 for x in levels) / len(levels)
        slope = (level - levels[0])
    else:
        mean, var, slope = level, 0, 0
    accel = abs(rec.get("acceleration_x", 0)) + abs(rec.get("acceleration_y", 0))
    return {
        "water_level_slope": round(slope, 2),
        "rolling_mean": round(mean, 2),
        "rolling_std": round(var ** 0.5, 2),
        "turbulence_index": round(min(accel / 2.0 + (var ** 0.5) / 20.0, 1.0), 3),
    }


async def raise_alert(alert_type, severity, sensor, message, context=None, source="rule_engine"):
    existing = await db.alerts.find_one({"sensor_id": sensor["id"], "alert_type": alert_type, "status": {"$in": ["open", "acknowledged"]}})
    if existing:
        return None
    alert = {
        "id": new_id(), "alert_id": f"ALT-{new_id()[:8].upper()}", "alert_type": alert_type, "severity": severity,
        "status": "open", "sensor_id": sensor["id"], "sensor_name": sensor.get("name"), "river_site_id": sensor.get("river_site_id"),
        "site_name": sensor.get("site_name"), "organization_id": sensor.get("organization_id"), "message": message,
        "context": context or {}, "source": source, "acknowledged_by": None, "assigned_to": None, "resolution_notes": None,
        "created_at": utcnow_iso(), "updated_at": utcnow_iso(),
        "incident_timeline": [{"event": "alert_created", "timestamp": utcnow_iso(), "detail": message}],
    }
    await db.alerts.insert_one(dict(alert))
    await db.notifications.insert_one({"id": new_id(), "type": "alert", "severity": severity, "title": f"{alert_type.replace('_', ' ').title()}",
                                       "message": message, "alert_id": alert["id"], "read": False, "created_at": utcnow_iso()})
    alert.pop("_id", None)
    await ws_manager.broadcast("alert.created", alert)
    return alert


async def evaluate_alerts(sensor, site, rec, derived, prediction, confidence):
    level = rec.get("water_level_cm", 0)
    danger = (site or {}).get("danger_level_cm", 450)
    warning = (site or {}).get("warning_level_cm", 350)
    if level >= danger:
        await raise_alert("flood_watch", "critical", sensor, f"Water level {level}cm exceeds danger level {danger}cm at {sensor.get('site_name')}", {"water_level_cm": level, "danger_level_cm": danger})
    elif level >= warning:
        await raise_alert("high_water_level", "warning", sensor, f"Water level {level}cm exceeds warning level {warning}cm at {sensor.get('site_name')}", {"water_level_cm": level, "warning_level_cm": warning})
    if prediction["flood_risk_score"] >= 0.75:
        await raise_alert("flood_risk_estimation", "critical", sensor, f"Flood Risk Estimation score {prediction['flood_risk_score']:.2f} (critical) at {sensor.get('site_name')} — prototype model", {"flood_risk_score": prediction["flood_risk_score"]}, source="ml_engine")
    elif prediction["flood_risk_score"] >= 0.5:
        await raise_alert("flood_risk_estimation", "warning", sensor, f"Flood Risk Estimation score {prediction['flood_risk_score']:.2f} (elevated) at {sensor.get('site_name')} — prototype model", {"flood_risk_score": prediction["flood_risk_score"]}, source="ml_engine")
    if prediction["pollution_anomaly_level"] == "high":
        await raise_alert("pollution_anomaly", "warning", sensor, f"Pollution Anomaly Detection flagged unusual water quality at {sensor.get('site_name')} (score {prediction['pollution_anomaly_score']:.2f}) — prototype model", {"pollution_anomaly_score": prediction["pollution_anomaly_score"]}, source="ml_engine")
    if rec.get("battery_percent") is not None and rec["battery_percent"] < 20:
        await raise_alert("low_battery", "warning", sensor, f"Battery at {rec['battery_percent']}% on {sensor.get('name')}", {"battery_percent": rec["battery_percent"]})
    if confidence < 0.5:
        await raise_alert("data_quality", "info", sensor, f"Low data confidence ({confidence}) from {sensor.get('name')} — QC flags raised", {"data_confidence_score": confidence})


async def process_telemetry(packet: dict, data_source: str, correlation_id: str = None):
    sensor_id = packet.get("sensor_id")
    sensor = await db.sensors.find_one({"id": sensor_id}, {"_id": 0})
    if not sensor:
        return {"status": "rejected", "reason": "unknown_sensor"}
    if sensor.get("device_status") == "retired":
        return {"status": "rejected", "reason": "sensor_retired"}
    correlation_id = correlation_id or new_id()
    seq = packet.get("sequence_number")

    raw_doc = {"id": new_id(), "sensor_id": sensor_id, "sequence_number": seq, "correlation_id": correlation_id,
               "payload": packet, "data_source": data_source, "received_at": utcnow_iso(), "payload_version": packet.get("payload_version", "1.0")}
    try:
        await db.telemetry_raw.insert_one(dict(raw_doc))
    except DuplicateKeyError:
        return {"status": "duplicate", "correlation_id": correlation_id, "sequence_number": seq}

    flags, confidence = qc_validate(packet)
    derived = await compute_derived(sensor_id, packet)
    prediction = ml_engine.infer(packet, derived)

    ts = packet.get("timestamp") or utcnow_iso()
    record = {k: v for k, v in packet.items() if k not in ("payload_version",)}
    record.update({
        "id": new_id(), "timestamp": ts, "ingested_at": utcnow_iso(), "correlation_id": correlation_id,
        "data_source": data_source, "quality_flags": flags, "data_confidence_score": confidence,
        "organization_id": sensor.get("organization_id"), "river_site_id": sensor.get("river_site_id"),
        **derived,
    })
    await db.telemetry.insert_one(dict(record))

    pred_doc = {"id": new_id(), "sensor_id": sensor_id, "river_site_id": sensor.get("river_site_id"),
                "correlation_id": correlation_id, "timestamp": ts, **prediction}
    await db.predictions.insert_one(dict(pred_doc))

    site = await db.river_sites.find_one({"id": sensor.get("river_site_id")}, {"_id": 0})
    await evaluate_alerts(sensor, site, packet, derived, prediction, confidence)

    battery = packet.get("battery_percent")
    device_health = round(min(1.0, (battery or 80) / 100 * 0.6 + (1 if packet.get("rssi", -80) > -110 else 0.5) * 0.4), 2)
    await db.sensors.update_one({"id": sensor_id}, {"$set": {
        "last_seen": utcnow_iso(), "device_status": "online", "battery_percent": battery,
        "battery_voltage": packet.get("battery_voltage"), "rssi": packet.get("rssi"), "snr": packet.get("snr"),
        "device_health_score": device_health, "last_sequence_number": seq,
        "latest": {"water_level_cm": packet.get("water_level_cm"), "ph_calibrated": packet.get("ph_calibrated"),
                   "turbidity_ntu": packet.get("turbidity_ntu"), "temperature_c": packet.get("temperature_c"),
                   "flood_risk_score": prediction["flood_risk_score"], "flood_risk_level": prediction["flood_risk_level"],
                   "pollution_anomaly_level": prediction["pollution_anomaly_level"], "water_health_score": prediction["water_health_score"],
                   "timestamp": ts},
    }})

    record.pop("_id", None)
    pred_doc.pop("_id", None)
    await ws_manager.broadcast("telemetry.created", {"sensor_id": sensor_id, "sensor_name": sensor.get("name"), **{k: record.get(k) for k in ("timestamp", "water_level_cm", "ph_calibrated", "turbidity_ntu", "temperature_c", "battery_percent", "data_confidence_score", "water_level_slope")}})
    await ws_manager.broadcast("prediction.created", {"sensor_id": sensor_id, "flood_risk_score": prediction["flood_risk_score"], "flood_risk_level": prediction["flood_risk_level"], "pollution_anomaly_level": prediction["pollution_anomaly_level"], "water_health_score": prediction["water_health_score"]})
    if flags:
        await ws_manager.broadcast("telemetry.quality_flagged", {"sensor_id": sensor_id, "quality_flags": flags, "data_confidence_score": confidence})

    return {"status": "accepted", "correlation_id": correlation_id, "quality_flags": flags, "data_confidence_score": confidence, "prediction": prediction}
