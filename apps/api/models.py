"""
AquaSentinel — SQLAlchemy ORM models.

Schema design:
- All timestamps stored in UTC.
- PostGIS geometry for sensor/site locations (SRID 4326).
- telemetry_readings uses declarative partitioning by timestamp (monthly).
  TimescaleDB is NOT required; standard PostgreSQL partitioning is used.
- source column uses enum to enforce valid values.
- Raw IoT JSONB payload preserved for audit / replay.
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
    JSON,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

# Engine-agnostic JSON fallback for testing (SQLite doesn't support JSONB)
from sqlalchemy.types import TypeDecorator
class JSONB(TypeDecorator):
    impl = JSON
    cache_ok = True
    def load_dialect_impl(self, dialect):
        if dialect.name == 'postgresql':
            from sqlalchemy.dialects.postgresql import JSONB as PG_JSONB
            return dialect.type_descriptor(PG_JSONB())
        return dialect.type_descriptor(JSON())

from apps.api.database import Base


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------

class DataSourceEnum(str, enum.Enum):
    iot = "iot"
    manual = "manual"
    simulation = "simulation"
    import_ = "import"
    cached = "cached"
    offline = "offline"


class AlertSeverityEnum(str, enum.Enum):
    low = "low"
    moderate = "moderate"
    high = "high"
    critical = "critical"


class AlertTypeEnum(str, enum.Enum):
    flood = "flood"
    pollution = "pollution"
    device_health = "device-health"
    tamper = "tamper"
    gateway = "gateway"
    calibration = "calibration"


class AlertStatusEnum(str, enum.Enum):
    active = "active"
    acknowledged = "acknowledged"
    resolved = "resolved"


class QualityFlagEnum(str, enum.Enum):
    good = "good"
    suspect = "suspect"
    bad = "bad"
    missing = "missing"


class UserRoleEnum(str, enum.Enum):
    super_admin = "super_admin"
    org_admin = "org_admin"
    operator = "operator"
    analyst = "analyst"
    viewer = "viewer"


class SensorStatusEnum(str, enum.Enum):
    normal = "normal"
    warning = "warning"
    high_risk = "high_risk"
    critical = "critical"
    offline = "offline"


# ---------------------------------------------------------------------------
# Organizations & Users
# ---------------------------------------------------------------------------

class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(60), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(60), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    users: Mapped[list["User"]] = relationship("User", back_populates="organization")
    river_sites: Mapped[list["RiverSite"]] = relationship("RiverSite", back_populates="organization")
    gateways: Mapped[list["Gateway"]] = relationship("Gateway", back_populates="organization")


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRoleEnum] = mapped_column(Enum(UserRoleEnum), nullable=False, default=UserRoleEnum.viewer)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    organization: Mapped["Organization"] = relationship("Organization", back_populates="users")


# ---------------------------------------------------------------------------
# GIS: River Sites
# ---------------------------------------------------------------------------

class RiverSite(Base):
    __tablename__ = "river_sites"

    id: Mapped[str] = mapped_column(String(60), primary_key=True)  # e.g. 'site_adyar'
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    river_name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # PostGIS geometry — centroid of the monitoring zone
    location: Mapped[object] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326), nullable=False
    )
    # Bounding polygon of the monitoring zone (nullable — can be added later)
    boundary: Mapped[object | None] = mapped_column(
        Geometry(geometry_type="POLYGON", srid=4326), nullable=True
    )
    flood_threshold_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    organization: Mapped["Organization"] = relationship("Organization", back_populates="river_sites")
    sensor_nodes: Mapped[list["SensorNode"]] = relationship("SensorNode", back_populates="site")


# ---------------------------------------------------------------------------
# IoT: Gateways & Sensor Nodes
# ---------------------------------------------------------------------------

class Gateway(Base):
    __tablename__ = "gateways"

    id: Mapped[str] = mapped_column(String(20), primary_key=True)   # e.g. 'GW001'
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    api_key_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    location: Mapped[object | None] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    firmware_version: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    organization: Mapped["Organization"] = relationship("Organization", back_populates="gateways")
    sensor_nodes: Mapped[list["SensorNode"]] = relationship("SensorNode", back_populates="gateway")


class SensorNode(Base):
    __tablename__ = "sensor_nodes"

    sensor_id: Mapped[str] = mapped_column(String(20), primary_key=True)  # e.g. 'AQ001'
    site_id: Mapped[str | None] = mapped_column(ForeignKey("river_sites.id"), nullable=True)
    gateway_id: Mapped[str | None] = mapped_column(ForeignKey("gateways.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[SensorStatusEnum] = mapped_column(
        Enum(SensorStatusEnum), nullable=False, default=SensorStatusEnum.offline
    )
    # PostGIS geometry — last known location
    location: Mapped[object | None] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326), nullable=True
    )
    battery_voltage: Mapped[float | None] = mapped_column(Float, nullable=True)
    rssi: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    snr: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    water_health_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    flood_risk_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    pollution_anomaly_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    firmware_version: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    site: Mapped["RiverSite | None"] = relationship("RiverSite", back_populates="sensor_nodes")
    gateway: Mapped["Gateway | None"] = relationship("Gateway", back_populates="sensor_nodes")
    readings: Mapped[list["TelemetryReading"]] = relationship("TelemetryReading", back_populates="sensor")
    calibration_profiles: Mapped[list["CalibrationProfile"]] = relationship(
        "CalibrationProfile", back_populates="sensor"
    )


# ---------------------------------------------------------------------------
# Telemetry — Declaratively Partitioned by Range (timestamp, monthly)
# NOTE: TimescaleDB is not required. PostgreSQL native partitioning is used.
# ---------------------------------------------------------------------------

class TelemetryReading(Base):
    """
    Raw sensor telemetry readings.

    Partitioning: RANGE on (timestamp) — partitions created monthly by the
    migration script (see alembic/versions/).

    Deduplication: unique constraint on (sensor_id, sequence_no, timestamp, payload_hash)
    to prevent double-ingestion from gateway retries.
    """
    __tablename__ = "telemetry_readings"
    __table_args__ = (
        UniqueConstraint("sensor_id", "sequence_no", "timestamp", "payload_hash",
                         name="uq_telemetry_dedup"),
        Index("ix_telemetry_sensor_ts", "sensor_id", "timestamp"),
        Index("ix_telemetry_source", "source"),
        # postgresql_partition_by is set in the migration DDL directly
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sensor_id: Mapped[str] = mapped_column(
        String(20), ForeignKey("sensor_nodes.sensor_id"), nullable=False
    )
    gateway_id: Mapped[str | None] = mapped_column(String(20), nullable=True)
    sequence_no: Mapped[int | None] = mapped_column(Integer, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Physical measurements
    latitude: Mapped[float] = mapped_column(Numeric(9, 6), nullable=False)
    longitude: Mapped[float] = mapped_column(Numeric(9, 6), nullable=False)
    water_level_cm: Mapped[float] = mapped_column(Float, nullable=False)
    ph: Mapped[float] = mapped_column(Float, nullable=False)
    turbidity_ntu: Mapped[float] = mapped_column(Float, nullable=False)
    temperature_c: Mapped[float] = mapped_column(Float, nullable=False)
    tilt_deg: Mapped[float] = mapped_column(Float, nullable=False)
    turbulence_index: Mapped[float] = mapped_column(Float, nullable=False)
    battery_voltage: Mapped[float] = mapped_column(Float, nullable=False)
    solar_voltage: Mapped[float | None] = mapped_column(Float, nullable=True)
    rssi: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    snr: Mapped[float] = mapped_column(Float, nullable=False)
    fish_activity_index: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Quality & lineage
    quality_flag: Mapped[QualityFlagEnum] = mapped_column(
        Enum(QualityFlagEnum), nullable=False, default=QualityFlagEnum.good
    )
    source: Mapped[DataSourceEnum] = mapped_column(
        Enum(DataSourceEnum), nullable=False, default=DataSourceEnum.iot
    )
    payload_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    raw_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    sensor: Mapped["SensorNode"] = relationship("SensorNode", back_populates="readings")
    features: Mapped["TelemetryFeatures | None"] = relationship(
        "TelemetryFeatures", back_populates="reading", uselist=False
    )
    predictions: Mapped[list["MLPrediction"]] = relationship("MLPrediction", back_populates="reading")


class TelemetryFeatures(Base):
    """
    Engineered features derived from raw telemetry for ML inference.
    One-to-one with TelemetryReading.
    """
    __tablename__ = "telemetry_features"

    reading_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("telemetry_readings.id", ondelete="CASCADE"), primary_key=True
    )
    # Rolling & rate-of-change features
    water_level_slope_1h: Mapped[float | None] = mapped_column(Float, nullable=True)
    water_level_rolling_mean_3h: Mapped[float | None] = mapped_column(Float, nullable=True)
    water_level_rolling_max_6h: Mapped[float | None] = mapped_column(Float, nullable=True)
    ph_rate_of_change_1h: Mapped[float | None] = mapped_column(Float, nullable=True)
    turbidity_baseline_deviation: Mapped[float | None] = mapped_column(Float, nullable=True)
    temperature_trend_6h: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Seasonal / calendar
    hour_of_day: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    month: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    is_monsoon: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    reading: Mapped["TelemetryReading"] = relationship("TelemetryReading", back_populates="features")


# ---------------------------------------------------------------------------
# ML Predictions
# ---------------------------------------------------------------------------

class MLPrediction(Base):
    """
    ML model outputs associated with a telemetry reading.
    Multiple predictions may exist per reading (flood, pollution, health score).
    Clearly labelled with model_name, model_version, and label to prevent misuse.
    """
    __tablename__ = "ml_predictions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    reading_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("telemetry_readings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sensor_id: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    model_name: Mapped[str] = mapped_column(String(60), nullable=False)     # e.g. "flood_risk_rf"
    model_version: Mapped[str] = mapped_column(String(20), nullable=False)  # e.g. "v1.0-prototype"
    model_label: Mapped[str] = mapped_column(String(60), nullable=False)
    # e.g. "prototype | not validated for operational decisions"
    score: Mapped[float] = mapped_column(Float, nullable=False)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    output_metadata: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    reading: Mapped["TelemetryReading"] = relationship("TelemetryReading", back_populates="predictions")


# ---------------------------------------------------------------------------
# Alerts
# ---------------------------------------------------------------------------

class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: f"alt_{uuid.uuid4().hex[:12]}")
    sensor_id: Mapped[str] = mapped_column(
        String(20), ForeignKey("sensor_nodes.sensor_id"), nullable=False, index=True
    )
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    severity: Mapped[AlertSeverityEnum] = mapped_column(Enum(AlertSeverityEnum), nullable=False)
    type: Mapped[AlertTypeEnum] = mapped_column(Enum(AlertTypeEnum), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[AlertStatusEnum] = mapped_column(
        Enum(AlertStatusEnum), nullable=False, default=AlertStatusEnum.active
    )
    assigned_to: Mapped[str | None] = mapped_column(String(120), nullable=True)
    source: Mapped[DataSourceEnum] = mapped_column(Enum(DataSourceEnum), nullable=False)
    telemetry_reading_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("telemetry_readings.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


# ---------------------------------------------------------------------------
# Calibration
# ---------------------------------------------------------------------------

class CalibrationProfile(Base):
    __tablename__ = "calibration_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sensor_id: Mapped[str] = mapped_column(
        String(20), ForeignKey("sensor_nodes.sensor_id"), nullable=False, index=True
    )
    ph_offset: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    ph_slope: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    turbidity_zero_offset: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    water_level_offset_cm: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    last_calibrated: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    operator_id: Mapped[str | None] = mapped_column(String(120), nullable=True)  # User ID or label
    validity_status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="valid"
    )  # valid | expired | requires_attention
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    sensor: Mapped["SensorNode"] = relationship("SensorNode", back_populates="calibration_profiles")


# ---------------------------------------------------------------------------
# Audit Logs
# ---------------------------------------------------------------------------

class AuditLog(Base):
    """Immutable append-only audit trail for all state-changing operations."""
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    user_id: Mapped[str | None] = mapped_column(String(40), nullable=True)  # null = system/gateway
    action: Mapped[str] = mapped_column(String(80), nullable=False)  # e.g. "telemetry.ingest"
    resource_type: Mapped[str] = mapped_column(String(60), nullable=False)
    resource_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(40), nullable=True)


# ---------------------------------------------------------------------------
# Additional Enterprise & Operational Models (Phase 1)
# ---------------------------------------------------------------------------

class Role(Base):
    __tablename__ = "roles"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)  # e.g. 'analyst', 'operator'
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)


class UserRole(Base):
    __tablename__ = "user_roles"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role_id: Mapped[str] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)


class TelemetryQualityFlags(Base):
    __tablename__ = "telemetry_quality_flags"

    reading_id: Mapped[int] = mapped_column(ForeignKey("telemetry_readings.id", ondelete="CASCADE"), primary_key=True)
    is_ph_valid: Mapped[bool] = mapped_column(Boolean, default=True)
    is_turbidity_valid: Mapped[bool] = mapped_column(Boolean, default=True)
    is_water_level_valid: Mapped[bool] = mapped_column(Boolean, default=True)
    is_battery_valid: Mapped[bool] = mapped_column(Boolean, default=True)
    is_tilt_valid: Mapped[bool] = mapped_column(Boolean, default=True)
    flagged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ModelRegistry(Base):
    __tablename__ = "model_registry"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    model_name: Mapped[str] = mapped_column(String(60), nullable=False)
    version: Mapped[str] = mapped_column(String(20), nullable=False)
    metrics: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    trained_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AlertEvent(Base):
    __tablename__ = "alert_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    alert_id: Mapped[str] = mapped_column(ForeignKey("alerts.id", ondelete="CASCADE"), nullable=False)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)  # e.g., 'created', 'updated', 'escalated'
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    details: Mapped[str | None] = mapped_column(Text, nullable=True)


class AlertAcknowledgement(Base):
    __tablename__ = "alert_acknowledgements"

    alert_id: Mapped[str] = mapped_column(ForeignKey("alerts.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(40), nullable=False)
    acknowledged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class AlertAssignment(Base):
    __tablename__ = "alert_assignments"

    alert_id: Mapped[str] = mapped_column(ForeignKey("alerts.id", ondelete="CASCADE"), primary_key=True)
    assigned_to_user_id: Mapped[str] = mapped_column(String(40), nullable=False)
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    assigned_by_user_id: Mapped[str] = mapped_column(String(40), nullable=False)


class CalibrationHistory(Base):
    __tablename__ = "calibration_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sensor_id: Mapped[str] = mapped_column(ForeignKey("sensor_nodes.sensor_id"), nullable=False)
    ph_offset: Mapped[float] = mapped_column(Float, nullable=False)
    ph_slope: Mapped[float] = mapped_column(Float, nullable=False)
    turbidity_zero_offset: Mapped[float] = mapped_column(Float, nullable=False)
    water_level_offset_cm: Mapped[float] = mapped_column(Float, nullable=False)
    calibrated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    operator_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False)


class GatewayHealthLog(Base):
    __tablename__ = "gateway_health_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    gateway_id: Mapped[str] = mapped_column(ForeignKey("gateways.id"), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    cpu_temp: Mapped[float | None] = mapped_column(Float, nullable=True)
    ram_usage_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    disk_usage_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    network_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    uptime_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)


class DeviceCommand(Base):
    __tablename__ = "device_commands"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: f"cmd_{uuid.uuid4().hex[:12]}")
    sensor_id: Mapped[str] = mapped_column(ForeignKey("sensor_nodes.sensor_id"), nullable=False)
    command_type: Mapped[str] = mapped_column(String(60), nullable=False)
    payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | sent | acknowledged | expired
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CommandAcknowledgement(Base):
    __tablename__ = "command_acknowledgements"

    command_id: Mapped[str] = mapped_column(ForeignKey("device_commands.id", ondelete="CASCADE"), primary_key=True)
    sensor_id: Mapped[str] = mapped_column(String(20), nullable=False)
    acknowledged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    status: Mapped[str] = mapped_column(String(20), default="success")
    details: Mapped[str | None] = mapped_column(Text, nullable=True)

