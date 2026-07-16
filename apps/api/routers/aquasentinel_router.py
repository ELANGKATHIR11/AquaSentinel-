"""
AquaSentinel — REST API Routers
Implements the specific requirements for:
- POST /api/sensor
- GET /api/latest
- GET /api/history
- GET /api/alerts
- GET /api/flood
- GET /api/wqi
- GET /api/device
"""
from __future__ import annotations

import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.database import get_db_session
from apps.api.models import SensorData, Alert, Device, SensorHealth, SystemLog
from apps.api.ml.ai_engine import calculate_wqi, predict_flood_risk, detect_sensor_faults

router = APIRouter(tags=["AquaSentinel Core"])


class SensorReadingPayload(BaseModel):
    temp: float = Field(..., description="Temperature in C")
    turbidity: float = Field(..., description="Turbidity in NTU")
    waterLevel: float = Field(..., description="Water level in cm")
    rain: float = Field(..., description="Precipitation level in mm")
    pitch: float = Field(..., description="Sensor tilt pitch in degrees")
    roll: float = Field(..., description="Sensor tilt roll in degrees")
    ax: float = Field(..., description="Accelerometer X axis")
    ay: float = Field(..., description="Accelerometer Y axis")
    az: float = Field(..., description="Accelerometer Z axis")
    ph: float = Field(..., description="pH value")
    tds: float = Field(..., description="TDS value in ppm")
    pressure: float = Field(..., description="Barometric pressure")
    lat: float = Field(..., description="Latitude")
    lon: float = Field(..., description="Longitude")
    timestamp: Optional[str] = Field(None, description="ISO format timestamp")
    device_id: Optional[str] = Field("ESP32_DevKitV1_01", description="Device Identifier")


@router.post("/api/sensor")
async def post_sensor_data(payload: SensorReadingPayload, db: AsyncSession = Depends(get_db_session)):
    # Parse timestamp
    dt = datetime.datetime.now()
    if payload.timestamp:
        try:
            # Handle ISO formats
            dt = datetime.datetime.fromisoformat(payload.timestamp.replace("Z", "+00:00"))
        except ValueError:
            pass

    # Ensure device entry exists
    device_id = payload.device_id or "ESP32_DevKitV1_01"
    stmt_dev = select(Device).where(Device.device_id == device_id)
    res_dev = await db.execute(stmt_dev)
    device = res_dev.scalar_one_or_none()

    if not device:
        device = Device(
            device_id=device_id,
            name=f"Buoy Node ({device_id})",
            status="online",
            last_seen=dt
        )
        db.add(device)
        await db.flush()
    else:
        device.last_seen = dt
        device.status = "online"

    # Calculate rate of rise
    rate_of_rise = 0.0
    stmt_prev = select(SensorData).where(SensorData.device_id == device_id).order_by(desc(SensorData.timestamp)).limit(1)
    res_prev = await db.execute(stmt_prev)
    prev_reading = res_prev.scalar_one_or_none()

    if prev_reading:
        time_diff = (dt - prev_reading.timestamp).total_seconds() / 60.0
        if time_diff > 0.1:
            rate_of_rise = (payload.waterLevel - prev_reading.waterLevel) / time_diff

    # Add to SQLite
    reading = SensorData(
        device_id=device_id,
        temp=payload.temp,
        turbidity=payload.turbidity,
        waterLevel=payload.waterLevel,
        rain=payload.rain,
        pitch=payload.pitch,
        roll=payload.roll,
        ax=payload.ax,
        ay=payload.ay,
        az=payload.az,
        ph=payload.ph,
        tds=payload.tds,
        pressure=payload.pressure,
        lat=payload.lat,
        lon=payload.lon,
        timestamp=dt
    )
    db.add(reading)
    await db.flush()

    # AI Engine Inference
    wqi_score = calculate_wqi(payload.ph, payload.turbidity, payload.tds, payload.temp)
    flood_pred = predict_flood_risk(payload.waterLevel, payload.rain, rate_of_rise)
    faults = await detect_sensor_faults(device_id, payload.model_dump(), db)

    # Threshold alerts check
    triggered_alerts = []
    
    if payload.waterLevel > 200.0:
        triggered_alerts.append(("High Water Level", "Critical", f"Water level reached {payload.waterLevel} cm."))
    if rate_of_rise > 10.0:
        triggered_alerts.append(("Rapid Rise", "High", f"Water level rising rapidly at {round(rate_of_rise, 2)} cm/min."))
    if payload.rain > 50.0:
        triggered_alerts.append(("Heavy Rain", "Moderate", f"Heavy rainfall detected: {payload.rain} mm."))
    if payload.turbidity > 150.0:
        triggered_alerts.append(("High Turbidity", "High", f"Turbidity levels exceeds threshold: {payload.turbidity} NTU."))
    if payload.temp > 35.0:
        triggered_alerts.append(("High Temperature", "Low", f"High water temperature: {payload.temp} C."))
    if payload.ph < 6.0:
        triggered_alerts.append(("Low pH", "High", f"Acidic water alert: pH is {payload.ph}."))
    if payload.tds > 1000.0:
        triggered_alerts.append(("High TDS", "Moderate", f"High TDS concentration detected: {payload.tds} ppm."))

    for f in faults:
        triggered_alerts.append(("Sensor Failure", "High", f["message"]))

    # Save alerts to table
    for a_type, severity, msg in triggered_alerts:
        # Avoid duplicating same active alert
        stmt_dup = select(Alert).where(
            Alert.device_id == device_id,
            Alert.type == a_type,
            Alert.resolved == False
        )
        res_dup = await db.execute(stmt_dup)
        if not res_dup.scalar_one_or_none():
            alert_entry = Alert(
                device_id=device_id,
                type=a_type,
                severity=severity,
                message=msg,
                timestamp=dt,
                resolved=False
            )
            db.add(alert_entry)

    # Insert System Log
    sys_log = SystemLog(
        level="INFO",
        message=f"Received telemetry from {device_id}. WQI: {wqi_score}, Flood Risk: {flood_pred['risk_level']}."
    )
    db.add(sys_log)

    await db.commit()

    # Broadcast to WebSocket clients in real-time
    try:
        from apps.api.websocket_manager import get_ws_manager
        ws_mgr = get_ws_manager()
        
        telemetry_event = {
            "type": "telemetry",
            "sensor_id": device_id,
            "gateway_id": "GW001",
            "sequence_no": reading.id,
            "timestamp": dt.isoformat(),
            "latitude": payload.lat,
            "longitude": payload.lon,
            "water_level_cm": payload.waterLevel,
            "ph": payload.ph,
            "turbidity_ntu": payload.turbidity,
            "temperature_c": payload.temp,
            "tilt_deg": payload.pitch,
            "turbulence_index": 0.1,
            "battery_voltage": 3.9,
            "rssi": -90,
            "snr": 8.5,
            "water_health_score": int(wqi_score),
            "flood_risk_score": flood_pred["risk_score"] / 100.0,
            "pollution_anomaly_score": 0.0,
            "source": "iot"
        }
        await ws_mgr.telemetry.broadcast(telemetry_event)
        await ws_mgr.dashboard.broadcast(telemetry_event)
        
        # Broadcast alerts
        for a_type, severity, msg in triggered_alerts:
            alert_event = {
                "type": "alert",
                "event": "alert.created",
                "alert_id": f"alt_{reading.id}_{a_type.replace(' ', '_').lower()}",
                "sensor_id": device_id,
                "severity": severity.lower(),
                "alert_type": a_type.lower(),
                "summary": msg,
                "status": "active",
                "timestamp": dt.isoformat(),
                "source": "iot"
            }
            await ws_mgr.alerts.broadcast(alert_event)
            await ws_mgr.dashboard.broadcast(alert_event)
    except Exception as ws_err:
        pass

    return {
        "status": "success",
        "device_id": device_id,
        "wqi": wqi_score,
        "flood_risk": flood_pred,
        "faults_detected": len(faults)
    }


@router.get("/api/latest")
async def get_latest_data(device_id: str = "ESP32_DevKitV1_01", db: AsyncSession = Depends(get_db_session)):
    stmt = select(SensorData).where(SensorData.device_id == device_id).order_by(desc(SensorData.timestamp)).limit(1)
    res = await db.execute(stmt)
    latest = res.scalar_one_or_none()
    if not latest:
        raise HTTPException(status_code=404, detail="No telemetry data found for device.")
    return latest


@router.get("/api/history")
async def get_history_data(device_id: str = "ESP32_DevKitV1_01", limit: int = 100, db: AsyncSession = Depends(get_db_session)):
    stmt = select(SensorData).where(SensorData.device_id == device_id).order_by(desc(SensorData.timestamp)).limit(limit)
    res = await db.execute(stmt)
    return res.scalars().all()


@router.get("/api/alerts")
async def get_alerts(active_only: bool = True, db: AsyncSession = Depends(get_db_session)):
    stmt = select(Alert)
    if active_only:
        stmt = stmt.where(Alert.resolved == False)
    stmt = stmt.order_by(desc(Alert.timestamp))
    res = await db.execute(stmt)
    return res.scalars().all()


@router.get("/api/flood")
async def get_flood_risk(device_id: str = "ESP32_DevKitV1_01", db: AsyncSession = Depends(get_db_session)):
    # Retrieve latest sensor data
    stmt = select(SensorData).where(SensorData.device_id == device_id).order_by(desc(SensorData.timestamp)).limit(2)
    res = await db.execute(stmt)
    readings = res.scalars().all()
    
    if not readings:
        raise HTTPException(status_code=404, detail="No telemetry available for flood prediction.")
    
    latest = readings[0]
    rate_of_rise = 0.0
    if len(readings) > 1:
        prev = readings[1]
        time_diff = (latest.timestamp - prev.timestamp).total_seconds() / 60.0
        if time_diff > 0.1:
            rate_of_rise = (latest.waterLevel - prev.waterLevel) / time_diff

    risk = predict_flood_risk(latest.waterLevel, latest.rain, rate_of_rise)
    return {
        "device_id": device_id,
        "timestamp": latest.timestamp,
        "water_level": latest.waterLevel,
        "precipitation": latest.rain,
        "rate_of_rise": round(rate_of_rise, 2),
        "flood_risk_score": risk["risk_score"],
        "flood_risk_level": risk["risk_level"]
    }


@router.get("/api/wqi")
async def get_water_quality_index(device_id: str = "ESP32_DevKitV1_01", db: AsyncSession = Depends(get_db_session)):
    stmt = select(SensorData).where(SensorData.device_id == device_id).order_by(desc(SensorData.timestamp)).limit(1)
    res = await db.execute(stmt)
    latest = res.scalar_one_or_none()
    
    if not latest:
        raise HTTPException(status_code=404, detail="No telemetry available for WQI calculations.")

    score = calculate_wqi(latest.ph, latest.turbidity, latest.tds, latest.temp)
    
    status = "Excellent"
    if score < 25.0:
        status = "Extremely Poor"
    elif score < 50.0:
        status = "Poor"
    elif score < 75.0:
        status = "Fair"
    elif score < 95.0:
        status = "Good"

    return {
        "device_id": device_id,
        "timestamp": latest.timestamp,
        "wqi_score": score,
        "status": status,
        "parameters": {
            "ph": latest.ph,
            "turbidity": latest.turbidity,
            "tds": latest.tds,
            "temperature": latest.temp
        }
    }


@router.get("/api/device")
async def get_devices(db: AsyncSession = Depends(get_db_session)):
    stmt = select(Device)
    res = await db.execute(stmt)
    return res.scalars().all()


# --- React Dashboard Compatibility Endpoints (v1) ---

@router.get("/api/v1/sensors")
async def get_v1_sensors(db: AsyncSession = Depends(get_db_session)):
    stmt = select(Device)
    res = await db.execute(stmt)
    devices = res.scalars().all()
    
    out = []
    for d in devices:
        # Fetch latest reading for WQI and location
        stmt_last = select(SensorData).where(SensorData.device_id == d.device_id).order_by(desc(SensorData.timestamp)).limit(1)
        res_last = await db.execute(stmt_last)
        last = res_last.scalar_one_or_none()
        
        wqi = 85.0
        flood = 0.0
        pollution = 0.0
        lat = last.lat if last else 13.0827
        lon = last.lon if last else 80.2707
        
        if last:
            wqi = calculate_wqi(last.ph, last.turbidity, last.tds, last.temp)
            # Calculate flood risk
            risk = predict_flood_risk(last.waterLevel, last.rain, 0.0)
            flood = risk["risk_score"] / 100.0
            
        out.append({
            "sensor_id": d.device_id,
            "name": d.name,
            "site_id": "site_adyar",
            "gateway_id": "GW001",
            "status": "normal" if d.status == "online" else "offline",
            "last_seen": d.last_seen,
            "latitude": lat,
            "longitude": lon,
            "battery_voltage": 3.9 if d.status == "online" else 0.0,
            "rssi": d.rssi,
            "snr": 8.5,
            "water_health_score": wqi,
            "flood_risk_score": flood,
            "pollution_anomaly_score": pollution,
            "source": "iot",
            "is_stale": False,
            "is_active": True
        })
    return out


@router.get("/api/v1/sensors/{sensor_id}")
async def get_v1_sensor(sensor_id: str, db: AsyncSession = Depends(get_db_session)):
    stmt = select(Device).where(Device.device_id == sensor_id)
    res = await db.execute(stmt)
    d = res.scalar_one_or_none()
    if not d:
        raise HTTPException(status_code=404, detail="Device not found")
        
    stmt_last = select(SensorData).where(SensorData.device_id == sensor_id).order_by(desc(SensorData.timestamp)).limit(1)
    res_last = await db.execute(stmt_last)
    last = res_last.scalar_one_or_none()
    
    wqi = 85.0
    flood = 0.0
    lat = last.lat if last else 13.0827
    lon = last.lon if last else 80.2707
    
    if last:
        wqi = calculate_wqi(last.ph, last.turbidity, last.tds, last.temp)
        risk = predict_flood_risk(last.waterLevel, last.rain, 0.0)
        flood = risk["risk_score"] / 100.0

    return {
        "sensor_id": d.device_id,
        "name": d.name,
        "site_id": "site_adyar",
        "gateway_id": "GW001",
        "status": "normal" if d.status == "online" else "offline",
        "last_seen": d.last_seen,
        "latitude": lat,
        "longitude": lon,
        "battery_voltage": 3.9,
        "rssi": d.rssi,
        "snr": 8.5,
        "water_health_score": wqi,
        "flood_risk_score": flood,
        "pollution_anomaly_score": 0.0,
        "source": "iot",
        "is_stale": False,
        "is_active": True
    }


@router.get("/api/v1/sensors/{sensor_id}/telemetry")
async def get_v1_sensor_telemetry(sensor_id: str, db: AsyncSession = Depends(get_db_session)):
    stmt = select(SensorData).where(SensorData.device_id == sensor_id).order_by(desc(SensorData.timestamp)).limit(100)
    res = await db.execute(stmt)
    readings = res.scalars().all()
    
    out = []
    for r in readings:
        wqi = calculate_wqi(r.ph, r.turbidity, r.tds, r.temp)
        risk = predict_flood_risk(r.waterLevel, r.rain, 0.0)
        flood = risk["risk_score"] / 100.0
        
        out.append({
            "id": r.id,
            "sensor_id": r.device_id,
            "gateway_id": "GW001",
            "sequence_no": r.id,
            "timestamp": r.timestamp,
            "received_at": r.timestamp,
            "latitude": r.lat,
            "longitude": r.lon,
            "water_level_cm": r.waterLevel,
            "ph": r.ph,
            "turbidity_ntu": r.turbidity,
            "temperature_c": r.temp,
            "tilt_deg": r.pitch,
            "turbulence_index": 0.1,
            "battery_voltage": 3.9,
            "solar_voltage": 4.2,
            "rssi": -90,
            "snr": 8.5,
            "fish_activity_index": 0.0,
            "quality_flag": "good",
            "source": "iot",
            "notes": "",
            "water_health_score": wqi,
            "flood_risk_score": flood,
            "pollution_anomaly_score": 0.0,
            "model_version": "v1.0"
        })
    return out


@router.get("/api/v1/alerts")
async def get_v1_alerts(db: AsyncSession = Depends(get_db_session)):
    stmt = select(Alert).order_by(desc(Alert.timestamp))
    res = await db.execute(stmt)
    alerts = res.scalars().all()
    
    out = []
    for a in alerts:
        out.append({
            "id": f"alt_{a.id}",
            "sensor_id": a.device_id,
            "timestamp": a.timestamp,
            "severity": a.severity.lower(),
            "type": a.type.lower(),
            "summary": a.message,
            "notes": None,
            "status": "resolved" if a.resolved else "active",
            "assigned_to": None,
            "source": "iot",
            "created_at": a.timestamp
        })
    return out


@router.post("/api/v1/telemetry/manual")
async def post_v1_telemetry_manual(payload: SensorReadingPayload, db: AsyncSession = Depends(get_db_session)):
    return await post_sensor_data(payload, db)


@router.post("/api/v1/calibration")
async def post_v1_calibration(payload: dict, db: AsyncSession = Depends(get_db_session)):
    device_id = payload.get("sensor_id") or "ESP32_DevKitV1_01"
    stmt = select(Device).where(Device.device_id == device_id)
    res = await db.execute(stmt)
    device = res.scalar_one_or_none()
    
    if not device:
        device = Device(
            device_id=device_id,
            name=f"Buoy Node ({device_id})",
            status="online"
        )
        db.add(device)
        await db.flush()
        
    device.calibration_ph = payload.get("ph_offset", 1.0)
    device.calibration_temp = payload.get("temp_offset", 1.0)
    device.calibration_turbidity = payload.get("turbidity_zero_offset", 1.0)
    
    await db.commit()
    return {
        "status": "success",
        "profile": {
            "sensor_id": device_id,
            "ph_offset": device.calibration_ph,
            "ph_slope": 1.0,
            "turbidity_zero_offset": device.calibration_turbidity,
            "water_level_offset_cm": 0.0,
            "operator": "Command Center"
        }
    }

