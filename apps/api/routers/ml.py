"""
ML Inference Router
====================
GET  /api/v1/ml/scores/{sensor_id}     — latest ML scores for a sensor
GET  /api/v1/ml/models                 — list registered model versions
POST /api/v1/ml/predict                — on-demand prediction from raw payload
GET  /api/v1/ml/whs/{sensor_id}        — water health score details

NOTE: All ML outputs carry PROTOTYPE labels.
Not validated for operational decisions.
"""
from __future__ import annotations

from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.database import get_db_session
from apps.api.ml.features import build_model_input, compute_features, get_feature_vector
from apps.api.ml.flood_model import predict_flood_risk
from apps.api.ml.pollution_model import predict_pollution_anomaly
from apps.api.ml.registry import list_models
from apps.api.ml.water_health_score import compute_from_payload
from apps.api.models import SensorNode, TelemetryReading
from apps.api.schemas import TelemetryIngestPayload

router = APIRouter(prefix="/ml", tags=["ML / AI"])
log = structlog.get_logger(__name__)

PROTOTYPE_DISCLAIMER = (
    "PROTOTYPE ML scores. Not validated for operational decisions. "
    "Do NOT use for official flood warnings, pollution reports, or regulatory decisions."
)


class PredictRequest(BaseModel):
    sensor_id: str
    water_level_cm: float
    ph: float
    turbidity_ntu: float
    temperature_c: float
    tilt_deg: float
    turbulence_index: float
    battery_voltage: float
    rssi: int
    snr: float
    fish_activity_index: float | None = None


class PredictResponse(BaseModel):
    sensor_id: str
    water_health_score: int
    water_health_grade: str
    flood_risk_score: float
    pollution_anomaly_score: float
    model_versions: dict[str, str]
    disclaimer: str
    sub_scores: dict[str, float]


class MLModelsResponse(BaseModel):
    models: list[dict[str, Any]]
    disclaimer: str


@router.get("/models", response_model=MLModelsResponse)
async def get_models() -> MLModelsResponse:
    return MLModelsResponse(models=list_models(), disclaimer=PROTOTYPE_DISCLAIMER)


@router.post("/predict", response_model=PredictResponse)
async def predict(body: PredictRequest, db: AsyncSession = Depends(get_db_session)) -> PredictResponse:
    """
    On-demand ML prediction from a provided payload.
    Uses recent telemetry history from the DB for feature engineering context.
    """
    # Fetch last 24 readings for feature engineering
    stmt = (
        select(TelemetryReading)
        .where(TelemetryReading.sensor_id == body.sensor_id)
        .order_by(TelemetryReading.timestamp.desc())
        .limit(24)
    )
    result = await db.execute(stmt)
    history_objs = result.scalars().all()
    history = [
        {
            "timestamp": r.timestamp.isoformat(),
            "water_level_cm": r.water_level_cm,
            "ph": r.ph,
            "turbidity_ntu": r.turbidity_ntu,
            "temperature_c": r.temperature_c,
            "tilt_deg": r.tilt_deg,
            "turbulence_index": r.turbulence_index,
            "battery_voltage": r.battery_voltage,
            "rssi": r.rssi,
            "snr": r.snr,
        }
        for r in reversed(history_objs)
    ]

    current_payload = body.model_dump()
    features = get_feature_vector(current_payload, history)
    feature_vector = build_model_input(current_payload, features)

    # Compute scores
    whs_result = compute_from_payload(current_payload)
    flood_score, flood_ver = predict_flood_risk(feature_vector)
    pollution_score, pollution_ver = predict_pollution_anomaly(
        ph=body.ph,
        turbidity_ntu=body.turbidity_ntu,
        temperature_c=body.temperature_c,
        turbulence_index=body.turbulence_index,
        turbidity_baseline_deviation=features.get("turbidity_baseline_deviation", 0.0),
        ph_rate_of_change_1h=features.get("ph_rate_of_change_1h", 0.0),
    )

    return PredictResponse(
        sensor_id=body.sensor_id,
        water_health_score=whs_result.score,
        water_health_grade=whs_result.grade,
        flood_risk_score=flood_score,
        pollution_anomaly_score=pollution_score,
        model_versions={"flood": flood_ver, "pollution": pollution_ver},
        disclaimer=PROTOTYPE_DISCLAIMER,
        sub_scores=whs_result.sub_scores,
    )


@router.get("/scores/{sensor_id}", response_model=PredictResponse)
async def get_sensor_scores(
    sensor_id: str,
    db: AsyncSession = Depends(get_db_session),
) -> PredictResponse:
    """Get ML scores computed from the sensor's most recent telemetry reading."""
    # Get most recent reading
    stmt = (
        select(TelemetryReading)
        .where(TelemetryReading.sensor_id == sensor_id)
        .order_by(TelemetryReading.timestamp.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    reading = result.scalar_one_or_none()

    if reading is None:
        raise HTTPException(status_code=404, detail=f"No readings found for sensor '{sensor_id}'")

    req = PredictRequest(
        sensor_id=sensor_id,
        water_level_cm=reading.water_level_cm,
        ph=reading.ph,
        turbidity_ntu=reading.turbidity_ntu,
        temperature_c=reading.temperature_c,
        tilt_deg=reading.tilt_deg,
        turbulence_index=reading.turbulence_index,
        battery_voltage=reading.battery_voltage,
        rssi=reading.rssi,
        snr=reading.snr,
        fish_activity_index=reading.fish_activity_index,
    )
    return await predict(req, db)
