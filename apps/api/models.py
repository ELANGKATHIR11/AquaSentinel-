"""
AquaSentinel — SQLite ORM models.
"""
from __future__ import annotations

import datetime
from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from apps.api.database import Base


class Device(Base):
    __tablename__ = "devices"

    device_id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="online")  # online, offline
    last_seen: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)
    battery_level: Mapped[float] = mapped_column(Float, default=100.0)
    rssi: Mapped[float] = mapped_column(Float, default=0.0)
    ip_address: Mapped[str | None] = mapped_column(String(50), nullable=True)
    
    # Calibration coefficients
    calibration_temp: Mapped[float] = mapped_column(Float, default=1.0)
    calibration_ph: Mapped[float] = mapped_column(Float, default=1.0)
    calibration_turbidity: Mapped[float] = mapped_column(Float, default=1.0)


class SensorData(Base):
    __tablename__ = "sensor_data"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    device_id: Mapped[str] = mapped_column(String(50), default="ESP32_DevKitV1_01")
    temp: Mapped[float] = mapped_column(Float, default=0.0)
    turbidity: Mapped[float] = mapped_column(Float, default=0.0)
    waterLevel: Mapped[float] = mapped_column(Float, default=0.0)
    rain: Mapped[float] = mapped_column(Float, default=0.0)
    pitch: Mapped[float] = mapped_column(Float, default=0.0)
    roll: Mapped[float] = mapped_column(Float, default=0.0)
    ax: Mapped[float] = mapped_column(Float, default=0.0)
    ay: Mapped[float] = mapped_column(Float, default=0.0)
    az: Mapped[float] = mapped_column(Float, default=0.0)
    ph: Mapped[float] = mapped_column(Float, default=0.0)
    tds: Mapped[float] = mapped_column(Float, default=0.0)
    pressure: Mapped[float] = mapped_column(Float, default=0.0)
    lat: Mapped[float] = mapped_column(Float, default=0.0)
    lon: Mapped[float] = mapped_column(Float, default=0.0)
    timestamp: Mapped[datetime.datetime] = mapped_column(DateTime, default=func.now())


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    device_id: Mapped[str] = mapped_column(String(50), default="ESP32_DevKitV1_01")
    type: Mapped[str] = mapped_column(String(50))  # High Water Level, Rapid Rise, Heavy Rain, etc.
    severity: Mapped[str] = mapped_column(String(20))  # Low, Moderate, High, Critical
    message: Mapped[str] = mapped_column(Text)
    timestamp: Mapped[datetime.datetime] = mapped_column(DateTime, default=func.now())
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)


class SystemLog(Base):
    __tablename__ = "system_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime.datetime] = mapped_column(DateTime, default=func.now())
    level: Mapped[str] = mapped_column(String(20))  # INFO, WARNING, ERROR, CRITICAL
    message: Mapped[str] = mapped_column(Text)


class SensorHealth(Base):
    __tablename__ = "sensor_health"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    device_id: Mapped[str] = mapped_column(String(50), default="ESP32_DevKitV1_01")
    sensor_name: Mapped[str] = mapped_column(String(50))  # DS18B20, TSW-20M, AJ-SR04M, MPU6050, Rain Sensor, pH Sensor, TDS Sensor, GPS
    status: Mapped[str] = mapped_column(String(20), default="normal")  # normal, fault, drift, degraded
    last_checked: Mapped[datetime.datetime] = mapped_column(DateTime, default=func.now())
    error_count: Mapped[int] = mapped_column(Integer, default=0)
