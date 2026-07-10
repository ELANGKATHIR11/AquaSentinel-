"""
AquaSentinel — Pydantic v2 API schemas for request/response serialization.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ---------------------------------------------------------------------------
# Shared / Primitives
# ---------------------------------------------------------------------------

class HealthResponse(BaseModel):
    status: str
    version: str
    environment: str
    timestamp: str


class ReadinessResponse(BaseModel):
    ready: bool
    database: str
    details: dict[str, Any] = {}


# ---------------------------------------------------------------------------
# Telemetry
# ---------------------------------------------------------------------------

class TelemetryIngestPayload(BaseModel):
    """Canonical IoT telemetry packet from gateway / simulator."""
    model_config = ConfigDict(str_strip_whitespace=True)

    sensor_id: str = Field(..., min_length=1, max_length=20)
    gateway_id: str | None = Field(None, max_length=20)
    sequence_no: int | None = None
    timestamp: datetime
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    water_level_cm: float = Field(..., ge=0, le=1000)
    ph: float = Field(..., ge=0, le=14)
    turbidity_ntu: float = Field(..., ge=0, le=1000)
    temperature_c: float = Field(..., ge=-10, le=60)
    tilt_deg: float = Field(..., ge=0, le=180)
    turbulence_index: float = Field(..., ge=0, le=1)
    battery_voltage: float = Field(..., ge=0, le=6)
    solar_voltage: float | None = Field(None, ge=0, le=10)
    rssi: int = Field(..., ge=-150, le=0)
    snr: float = Field(..., ge=-50, le=50)
    fish_activity_index: float | None = Field(None, ge=0, le=1)
    source: str = Field(default="iot")
    notes: str | None = None

    @field_validator("source")
    @classmethod
    def validate_source(cls, v: str) -> str:
        allowed = {"iot", "manual", "simulation", "import", "cached", "offline"}
        if v not in allowed:
            raise ValueError(f"source must be one of {allowed}")
        return v


class TelemetryResponse(BaseModel):
    """Full telemetry reading returned by the API — includes computed scores."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    sensor_id: str
    gateway_id: str | None
    sequence_no: int | None
    timestamp: datetime
    received_at: datetime
    latitude: float
    longitude: float
    water_level_cm: float
    ph: float
    turbidity_ntu: float
    temperature_c: float
    tilt_deg: float
    turbulence_index: float
    battery_voltage: float
    solar_voltage: float | None
    rssi: int
    snr: float
    fish_activity_index: float | None
    quality_flag: str
    source: str
    notes: str | None

    # ML outputs (populated after inference pipeline runs)
    water_health_score: float | None = None
    flood_risk_score: float | None = None
    pollution_anomaly_score: float | None = None
    model_version: str | None = None


class TelemetryIngestResponse(BaseModel):
    status: str  # "accepted" | "duplicate" | "rejected"
    reading_id: int | None = None
    message: str = ""
    ack_token: str | None = None


# ---------------------------------------------------------------------------
# Sensors
# ---------------------------------------------------------------------------

class SensorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    sensor_id: str
    name: str
    site_id: str | None
    gateway_id: str | None
    status: str
    last_seen: datetime | None
    latitude: float | None
    longitude: float | None
    battery_voltage: float | None
    rssi: int | None
    snr: float | None
    water_health_score: float | None
    flood_risk_score: float | None
    pollution_anomaly_score: float | None
    source: str = "offline"
    is_stale: bool = False
    is_active: bool


# ---------------------------------------------------------------------------
# Gateways
# ---------------------------------------------------------------------------

class GatewayResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str | None
    is_active: bool
    last_seen: datetime | None
    firmware_version: str | None


# ---------------------------------------------------------------------------
# Alerts
# ---------------------------------------------------------------------------

class AlertResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    sensor_id: str
    timestamp: datetime
    severity: str
    type: str
    summary: str
    notes: str | None
    status: str
    assigned_to: str | None
    source: str
    created_at: datetime


class AlertAcknowledgeRequest(BaseModel):
    operator_note: str | None = None


class AlertResolveRequest(BaseModel):
    notes: str | None = None


# ---------------------------------------------------------------------------
# Calibration
# ---------------------------------------------------------------------------

class CalibrationProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sensor_id: str
    ph_offset: float
    ph_slope: float
    turbidity_zero_offset: float
    water_level_offset_cm: float
    last_calibrated: datetime
    operator_id: str | None
    validity_status: str


class CalibrationCreateRequest(BaseModel):
    sensor_id: str
    ph_offset: float = Field(default=0.0, ge=-5, le=5)
    ph_slope: float = Field(default=1.0, ge=0.5, le=2.0)
    turbidity_zero_offset: float = Field(default=0.0, ge=0, le=50)
    water_level_offset_cm: float = Field(default=0.0, ge=-100, le=100)


# ---------------------------------------------------------------------------
# GIS
# ---------------------------------------------------------------------------

class RiverSiteResponse(BaseModel):
    id: str
    name: str
    river_name: str
    description: str | None
    latitude: float
    longitude: float
    flood_threshold_cm: float | None


class GeoJSONFeature(BaseModel):
    type: str = "Feature"
    geometry: dict[str, Any]
    properties: dict[str, Any]


class GeoJSONFeatureCollection(BaseModel):
    type: str = "FeatureCollection"
    features: list[GeoJSONFeature]


# ---------------------------------------------------------------------------
# Pagination wrapper
# ---------------------------------------------------------------------------

class PaginatedResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[Any]
