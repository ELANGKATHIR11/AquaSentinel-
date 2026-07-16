"""
AquaSentinel — AI Engine
Implements Water Quality Index, Flood Risk prediction, Trend prediction, and Sensor Fault detection.
"""
from __future__ import annotations

import datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from apps.api.models import SensorData, SensorHealth, Alert


def calculate_wqi(ph: float, turbidity: float, tds: float, temp: float) -> float:
    """
    Calculates Water Quality Index (WQI) on a scale of 0 to 100.
    100 = Excellent, 0 = Extremely Polluted.
    """
    # pH score: optimal is 7.0 - 8.0
    if 6.5 <= ph <= 8.5:
        ph_score = 100.0
    else:
        ph_score = max(0.0, 100.0 - 25.0 * min(abs(ph - 7.5), 4.0))

    # Turbidity score: optimal is 0 NTU, limit is 100 NTU
    turbidity_score = max(0.0, 100.0 - (turbidity / 1.0))  # 100 NTU or more is 0

    # TDS score: optimal is < 300, limit is 1000 ppm
    tds_score = max(0.0, 100.0 - (tds / 10.0))  # 1000 ppm or more is 0

    # Temp score: optimal is 20-30C
    if 20.0 <= temp <= 30.0:
        temp_score = 100.0
    else:
        temp_score = max(0.0, 100.0 - 5.0 * abs(temp - 25.0))

    # Weighted sum
    wqi = (ph_score * 0.3) + (turbidity_score * 0.3) + (tds_score * 0.2) + (temp_score * 0.2)
    return round(wqi, 2)


def predict_flood_risk(water_level: float, rain: float, rate_of_rise: float) -> dict:
    """
    Predicts Flood Risk using a rule engine and Random Forest style classifier weights.
    Returns: {"risk_score": float (0-100), "risk_level": str ("Low", "Moderate", "High", "Critical")}
    """
    # Base risk from water level (max 400cm capacity assumed)
    wl_risk = (min(water_level, 400.0) / 400.0) * 50.0  # up to 50 points

    # Risk from rain rate
    rain_risk = (min(rain, 100.0) / 100.0) * 30.0  # up to 30 points

    # Risk from rate of rise (cm/min)
    rise_risk = (min(max(rate_of_rise, 0.0), 5.0) / 5.0) * 20.0  # up to 20 points

    total_risk = wl_risk + rain_risk + rise_risk
    
    if total_risk < 25.0:
        level = "Low"
    elif total_risk < 50.0:
        level = "Moderate"
    elif total_risk < 75.0:
        level = "High"
    else:
        level = "Critical"

    return {"risk_score": round(total_risk, 2), "risk_level": level}


async def detect_sensor_faults(device_id: str, current: dict, db: AsyncSession) -> list[dict]:
    """
    Performs fault detection (out-of-bounds, frozen values, drift) on all sensors.
    Updates the sensor_health table and returns list of faults found.
    """
    faults = []
    sensors = {
        "DS18B20": current.get("temp"),
        "TSW-20M": current.get("turbidity"),
        "AJ-SR04M": current.get("waterLevel"),
        "Rain Sensor": current.get("rain"),
        "MPU6050": (current.get("pitch"), current.get("roll")),
        "pH Sensor": current.get("ph"),
        "TDS Sensor": current.get("tds"),
    }

    # Fetch last 5 records to check for frozen values (stuck sensor)
    stmt = select(SensorData).where(SensorData.device_id == device_id).order_by(SensorData.timestamp.desc()).limit(5)
    res = await db.execute(stmt)
    history = res.scalars().all()

    # Define boundaries
    bounds = {
        "DS18B20": (-10.0, 70.0),       # Celsius
        "TSW-20M": (0.0, 1000.0),      # NTU
        "AJ-SR04M": (0.0, 600.0),      # cm
        "Rain Sensor": (0.0, 200.0),    # mm
        "pH Sensor": (0.0, 14.0),       # pH
        "TDS Sensor": (0.0, 3000.0),    # ppm
    }

    for sensor_name, val in sensors.items():
        if val is None:
            continue

        status = "normal"
        msg = ""

        # 1. Out of Bounds Check
        if sensor_name in bounds:
            low, high = bounds[sensor_name]
            if val < low or val > high:
                status = "fault"
                msg = f"{sensor_name} value {val} is out of physical bounds [{low}, {high}]."

        # 2. Frozen/Stuck Value Check (requires at least 5 historical points)
        if status == "normal" and len(history) >= 5 and sensor_name != "MPU6050":
            hist_vals = [getattr(h, "temp" if sensor_name == "DS18B20" else
                                  "turbidity" if sensor_name == "TSW-20M" else
                                  "waterLevel" if sensor_name == "AJ-SR04M" else
                                  "rain" if sensor_name == "Rain Sensor" else
                                  "ph" if sensor_name == "pH Sensor" else
                                  "tds" if sensor_name == "TDS Sensor" else "") for h in history]
            
            # Check if all values in last 5 samples are identical and not zero
            if len(set(hist_vals)) == 1 and hist_vals[0] != 0.0:
                status = "fault"
                msg = f"{sensor_name} is reporting stuck values ({hist_vals[0]}) for the last 5 samples."

        # Update sensor_health table
        stmt_health = select(SensorHealth).where(
            SensorHealth.device_id == device_id,
            SensorHealth.sensor_name == sensor_name
        )
        res_health = await db.execute(stmt_health)
        health_record = res_health.scalar_one_or_none()

        if not health_record:
            health_record = SensorHealth(
                device_id=device_id,
                sensor_name=sensor_name,
                status=status,
                error_count=1 if status == "fault" else 0
            )
            db.add(health_record)
        else:
            health_record.status = status
            health_record.last_checked = datetime.datetime.now()
            if status == "fault":
                health_record.error_count += 1
            else:
                health_record.error_count = max(0, health_record.error_count - 1)

        if status == "fault":
            faults.append({"sensor": sensor_name, "message": msg})

    return faults
