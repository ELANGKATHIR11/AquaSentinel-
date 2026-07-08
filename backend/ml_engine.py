import numpy as np
import joblib
from pathlib import Path
from datetime import datetime, timezone

MODELS_DIR = Path(__file__).parent / "models_store"
MODELS_DIR.mkdir(exist_ok=True)

_models = {}

MODEL_REGISTRY = [
    {"model_name": "flood_risk_rf", "model_version": "0.3.1", "algorithm": "RandomForestClassifier", "task": "Flood Risk Estimation",
     "state": "prototype", "confidence_label": "prototype - trained on synthetic seed data, NOT field validated",
     "features": ["water_level_cm", "water_level_slope", "rainfall_1hour", "rolling_mean"], "metrics": {"auc_synthetic": 0.94, "f1_synthetic": 0.88}},
    {"model_name": "level_forecast_gbr", "model_version": "0.2.4", "algorithm": "GradientBoostingRegressor", "task": "Water Level Forecasting",
     "state": "prototype", "confidence_label": "prototype - trained on synthetic seed data, NOT field validated",
     "features": ["water_level_cm", "water_level_slope", "rainfall_1hour"], "metrics": {"mae_cm_synthetic": 4.2, "r2_synthetic": 0.91}},
    {"model_name": "pollution_iforest", "model_version": "0.2.0", "algorithm": "IsolationForest", "task": "Pollution Anomaly Detection",
     "state": "prototype", "confidence_label": "prototype - trained on synthetic seed data, NOT field validated",
     "features": ["ph_calibrated", "turbidity_ntu", "temperature_c", "tds_ppm"], "metrics": {"contamination": 0.02}},
]


def train_models():
    from sklearn.ensemble import RandomForestClassifier, GradientBoostingRegressor, IsolationForest
    rng = np.random.default_rng(42)
    n = 4000

    level = rng.uniform(20, 600, n)
    slope = rng.normal(0, 2.5, n)
    rain = rng.exponential(8, n).clip(0, 80)
    rmean = level + rng.normal(0, 10, n)
    logits = 0.012 * (level - 350) + 0.9 * slope + 0.08 * (rain - 20)
    y = (1 / (1 + np.exp(-logits)) + rng.normal(0, 0.05, n)) > 0.5
    rf = RandomForestClassifier(n_estimators=80, max_depth=8, random_state=42)
    rf.fit(np.column_stack([level, slope, rain, rmean]), y.astype(int))
    joblib.dump(rf, MODELS_DIR / "flood_rf.joblib")

    delta15 = slope * 15 + 0.25 * rain + rng.normal(0, 3, n)
    gbr = GradientBoostingRegressor(n_estimators=60, max_depth=3, random_state=42)
    gbr.fit(np.column_stack([level, slope, rain]), delta15)
    joblib.dump(gbr, MODELS_DIR / "forecast_gbr.joblib")

    ph = rng.normal(7.4, 0.5, n).clip(6.0, 9.0)
    turb = rng.gamma(3, 6, n).clip(0.5, 80)
    temp = rng.normal(24, 4, n).clip(12, 36)
    tds = rng.normal(300, 90, n).clip(50, 700)
    iforest = IsolationForest(n_estimators=100, contamination=0.02, random_state=42)
    iforest.fit(np.column_stack([ph, turb, temp, tds]))
    joblib.dump(iforest, MODELS_DIR / "pollution_iforest.joblib")


def load_models():
    if not (MODELS_DIR / "flood_rf.joblib").exists():
        train_models()
    _models["flood"] = joblib.load(MODELS_DIR / "flood_rf.joblib")
    _models["forecast"] = joblib.load(MODELS_DIR / "forecast_gbr.joblib")
    _models["pollution"] = joblib.load(MODELS_DIR / "pollution_iforest.joblib")


def risk_level(score):
    if score >= 0.75:
        return "critical"
    if score >= 0.5:
        return "high"
    if score >= 0.25:
        return "moderate"
    return "low"


def water_health_score(rec):
    penalties = {}
    ph = rec.get("ph_calibrated") or 7.4
    penalties["ph_deviation"] = round(min(abs(ph - 7.4) * 12, 30), 1)
    penalties["turbidity"] = round(min(max(rec.get("turbidity_ntu", 10) - 25, 0) * 0.8, 30), 1)
    do = rec.get("dissolved_oxygen_mg_l")
    penalties["dissolved_oxygen"] = round(min(max(6.0 - do, 0) * 8, 25), 1) if do is not None else 0
    penalties["tds"] = round(min(max(rec.get("tds_ppm", 300) - 500, 0) * 0.05, 15), 1)
    score = max(0, round(100 - sum(penalties.values()), 1))
    return score, penalties


def infer(rec, derived):
    if not _models:
        load_models()
    level = rec.get("water_level_cm", 100)
    slope = derived.get("water_level_slope", 0)
    rain = rec.get("rainfall_1hour", rec.get("rainfall_mm", 0) or 0)
    rmean = derived.get("rolling_mean", level)

    flood_x = np.array([[level, slope, rain, rmean]])
    flood_score = float(_models["flood"].predict_proba(flood_x)[0][1])

    fc_x = np.array([[level, slope, rain]])
    d15 = float(_models["forecast"].predict(fc_x)[0])

    ph = rec.get("ph_calibrated") or 7.4
    turb = rec.get("turbidity_ntu", 10)
    temp = rec.get("temperature_c", 24)
    tds = rec.get("tds_ppm") or 300
    pol_x = np.array([[ph, turb, temp, tds]])
    pol_raw = float(_models["pollution"].score_samples(pol_x)[0])
    pol_score = float(np.clip((-pol_raw - 0.35) / 0.35, 0, 1))
    pol_level = "high" if pol_score >= 0.7 else ("moderate" if pol_score >= 0.4 else "normal")

    health, penalties = water_health_score(rec)
    fi = _models["flood"].feature_importances_
    contributions = {"water_level_cm": round(float(fi[0]), 3), "water_level_slope": round(float(fi[1]), 3),
                     "rainfall_1hour": round(float(fi[2]), 3), "rolling_mean": round(float(fi[3]), 3)}

    return {
        "flood_risk_score": round(flood_score, 4),
        "flood_risk_level": risk_level(flood_score),
        "water_level_forecast_15m": round(level + d15, 1),
        "water_level_forecast_30m": round(level + d15 * 1.9, 1),
        "water_level_forecast_60m": round(level + d15 * 3.6, 1),
        "pollution_anomaly_score": round(pol_score, 4),
        "pollution_anomaly_level": pol_level,
        "water_health_score": health,
        "water_health_penalties": penalties,
        "model_name": "flood_risk_rf+level_forecast_gbr+pollution_iforest",
        "model_version": "0.3.1",
        "model_state": "prototype",
        "model_confidence": "prototype - synthetic seed data, not field validated",
        "feature_contributions": contributions,
        "prediction_timestamp": datetime.now(timezone.utc).isoformat(),
    }
