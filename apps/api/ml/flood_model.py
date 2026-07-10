"""
AquaSentinel — Random Forest Flood Risk Model
===============================================
PROTOTYPE MODEL — NOT validated for operational flood prediction.

This module provides:
  1. Training script (generates synthetic training data & trains RF)
  2. Inference function (predict_flood_risk)
  3. Model registration

Model:
  - Estimator: sklearn RandomForestClassifier (binary: flood / no_flood)
  - Output: probability score 0.0–1.0 (higher = more risk)
  - Features: 15 engineered features (see features.py)

Training data:
  Synthetic data generated from known flood/non-flood parameter ranges
  calibrated for Tamil Nadu rivers. NOT real historical observations.

DISCLAIMER:
  This model is a research prototype. Outputs should NOT be used for
  official flood warnings or evacuation decisions. Always follow official
  CWC/IMD flood bulletins.
"""
from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import structlog

log = structlog.get_logger(__name__)

MODEL_NAME = "flood_risk_rf"
MODEL_VERSION = "v1.0-prototype"
MODEL_LABEL = "PROTOTYPE | RandomForest | Not validated for operational flood decisions"


# ---------------------------------------------------------------------------
# Synthetic training data generation
# ---------------------------------------------------------------------------

def _generate_training_data(n_samples: int = 3000) -> tuple[np.ndarray, np.ndarray]:
    """
    Generate synthetic labeled data for flood risk model training.
    Label 1 = flood risk, 0 = normal conditions.

    Flood conditions (approximately 40% of samples):
    - water_level_cm > 280 (high)
    - water_level_slope_1h > 15 (rapidly rising)
    - turbulence_index > 0.4
    - is_monsoon = 1

    Non-flood conditions (60%):
    - normal parameter ranges
    """
    rng = np.random.default_rng(42)

    flood_n = int(n_samples * 0.4)
    normal_n = n_samples - flood_n

    def _flood_sample() -> list[float]:
        water_level = rng.uniform(250, 500)
        return [
            water_level,                           # water_level_cm
            rng.uniform(6.0, 8.5),                 # ph
            rng.uniform(30, 300),                  # turbidity_ntu
            rng.uniform(24, 33),                   # temperature_c
            rng.uniform(2, 25),                    # tilt_deg
            rng.uniform(0.3, 1.0),                 # turbulence_index
            rng.uniform(3.0, 4.2),                 # battery_voltage
            rng.integers(-120, -70),               # rssi
            rng.uniform(-5, 10),                   # snr
            rng.uniform(15, 80),                   # water_level_slope_1h
            water_level + rng.uniform(20, 100),    # water_level_rolling_max_6h
            rng.uniform(10, 150),                  # turbidity_baseline_deviation
            rng.uniform(-0.5, -0.1),               # ph_rate_of_change_1h
            rng.integers(0, 23),                   # hour_of_day
            1.0,                                   # is_monsoon
        ]

    def _normal_sample() -> list[float]:
        water_level = rng.uniform(30, 220)
        return [
            water_level,
            rng.uniform(6.5, 8.5),
            rng.uniform(1, 40),
            rng.uniform(22, 31),
            rng.uniform(0, 8),
            rng.uniform(0, 0.2),
            rng.uniform(3.3, 4.5),
            rng.integers(-100, -70),
            rng.uniform(5, 15),
            rng.uniform(-5, 8),
            water_level + rng.uniform(0, 20),
            rng.uniform(-5, 10),
            rng.uniform(-0.05, 0.05),
            rng.integers(0, 23),
            float(rng.integers(0, 2)),
        ]

    X_flood = np.array([_flood_sample() for _ in range(flood_n)])
    X_normal = np.array([_normal_sample() for _ in range(normal_n)])
    y_flood = np.ones(flood_n)
    y_normal = np.zeros(normal_n)

    X = np.vstack([X_flood, X_normal])
    y = np.concatenate([y_flood, y_normal])

    # Shuffle
    idx = rng.permutation(len(X))
    return X[idx], y[idx]


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def train_and_register(n_samples: int = 3000) -> dict[str, Any]:
    """Train the Random Forest flood risk model and register it."""
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.model_selection import cross_val_score, train_test_split
    from sklearn.metrics import (
        classification_report,
        roc_auc_score,
        accuracy_score,
    )
    from apps.api.ml.registry import save_model

    print(f"[FloodRF] Generating {n_samples} synthetic training samples...")
    X, y = _generate_training_data(n_samples)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    print("[FloodRF] Training RandomForestClassifier...")
    model = RandomForestClassifier(
        n_estimators=150,
        max_depth=12,
        min_samples_leaf=5,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_train, y_train)

    # Evaluate
    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]
    accuracy = accuracy_score(y_test, y_pred)
    auc = roc_auc_score(y_test, y_prob)

    print(f"[FloodRF] Test Accuracy: {accuracy:.3f} | AUC-ROC: {auc:.3f}")
    print(classification_report(y_test, y_pred, target_names=["normal", "flood"]))

    from apps.api.ml.features import FEATURE_NAMES
    metrics = {
        "accuracy": round(accuracy, 4),
        "auc_roc": round(auc, 4),
        "n_estimators": model.n_estimators,
        "train_samples": len(X_train),
        "test_samples": len(X_test),
        "training_data": "SYNTHETIC — not real historical observations",
    }

    meta = {
        "description": "RandomForest binary classifier for flood risk detection",
        "label": MODEL_LABEL,
        "features": FEATURE_NAMES,
        "output": "probability score 0.0-1.0 (higher = more flood risk)",
        "disclaimer": (
            "PROTOTYPE. Synthetic training data only. "
            "NOT validated for operational flood decisions. "
            "Always follow official CWC/IMD bulletins."
        ),
        "metrics": metrics,
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }

    save_model(model, MODEL_NAME, MODEL_VERSION, meta)
    print(f"[FloodRF] Model saved to registry as {MODEL_NAME}/{MODEL_VERSION}")
    return metrics


# ---------------------------------------------------------------------------
# Inference
# ---------------------------------------------------------------------------

_model_cache: tuple[Any, dict] | None = None


def predict_flood_risk(feature_vector: list[float]) -> tuple[float, str]:
    """
    Predict flood risk probability from a 15-element feature vector.

    Returns:
        (score, version_label) where score is 0.0–1.0
    """
    global _model_cache
    if _model_cache is None:
        try:
            from apps.api.ml.registry import load_model
            _model_cache = load_model(MODEL_NAME)
        except FileNotFoundError:
            log.warning("flood_model.not_found", msg="Using rule-based fallback")
            return _rule_based_flood_score(feature_vector), "rule-based-fallback"

    model, meta = _model_cache
    X = np.array([feature_vector])
    prob = float(model.predict_proba(X)[0, 1])
    return round(prob, 4), f"{MODEL_NAME}/{MODEL_VERSION}"


def _rule_based_flood_score(features: list[float]) -> float:
    """
    Simple rule-based fallback when model is not available.
    Based on water level and slope thresholds.
    """
    water_level = features[0]
    slope = features[9]  # water_level_slope_1h
    turbulence = features[5]

    score = 0.0
    if water_level > 350:
        score += 0.5
    elif water_level > 250:
        score += 0.3
    elif water_level > 180:
        score += 0.1

    if slope > 30:
        score += 0.3
    elif slope > 15:
        score += 0.15

    if turbulence > 0.5:
        score += 0.2

    return min(1.0, round(score, 4))


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).parents[3]))
    metrics = train_and_register()
    print(f"Training complete: {metrics}")
