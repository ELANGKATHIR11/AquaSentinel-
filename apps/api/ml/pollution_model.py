"""
AquaSentinel — Isolation Forest Pollution Anomaly Model
=========================================================
PROTOTYPE MODEL — NOT validated for operational pollution detection.

This module provides:
  1. Training script (trains IF on synthetic normal water data)
  2. Inference function (predict_pollution_anomaly)
  3. Model registration

Model:
  - Estimator: sklearn IsolationForest (unsupervised anomaly detection)
  - Output: anomaly score 0.0–1.0 (higher = more anomalous / more polluted)
  - Features: 6 pollution-relevant features

Training approach:
  IsolationForest is trained on synthetic NORMAL water quality data.
  Contaminated samples deviate significantly from this distribution.
  The anomaly score from sklearn is negated and scaled to 0–1.

DISCLAIMER:
  This model is a research prototype using synthetic data.
  It has NOT been validated on real-world pollution events.
  Do NOT use for regulatory pollution reporting or public advisories.
"""
from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import structlog

log = structlog.get_logger(__name__)

MODEL_NAME = "pollution_anomaly_if"
MODEL_VERSION = "v1.0-prototype"
MODEL_LABEL = "PROTOTYPE | IsolationForest | Not validated for operational pollution decisions"

# Features used for pollution detection
POLLUTION_FEATURES = [
    "ph", "turbidity_ntu", "temperature_c",
    "turbulence_index", "turbidity_baseline_deviation", "ph_rate_of_change_1h",
]


# ---------------------------------------------------------------------------
# Synthetic training data
# ---------------------------------------------------------------------------

def _generate_normal_data(n_samples: int = 5000) -> np.ndarray:
    """
    Generate synthetic NORMAL water quality readings for IsolationForest training.
    IsolationForest is trained only on normal data; anomalies are detected at inference.
    """
    rng = np.random.default_rng(42)
    return np.column_stack([
        rng.normal(7.0, 0.3, n_samples),         # ph — normally distributed around 7.0
        rng.exponential(8.0, n_samples) + 1,     # turbidity_ntu — right-skewed
        rng.normal(28.0, 1.5, n_samples),        # temperature_c
        rng.beta(2, 10, n_samples),              # turbulence_index — mostly low
        rng.normal(0.0, 2.0, n_samples),         # turbidity_baseline_deviation
        rng.normal(0.0, 0.03, n_samples),        # ph_rate_of_change_1h
    ])


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def train_and_register(n_samples: int = 5000) -> dict[str, Any]:
    """Train the Isolation Forest model and register it."""
    from sklearn.ensemble import IsolationForest
    from sklearn.preprocessing import StandardScaler
    from sklearn.pipeline import Pipeline
    from apps.api.ml.registry import save_model

    print(f"[PollutionIF] Generating {n_samples} synthetic normal samples...")
    X_normal = _generate_normal_data(n_samples)

    print("[PollutionIF] Training IsolationForest...")
    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("if", IsolationForest(
            n_estimators=200,
            max_samples=256,
            contamination=0.05,  # Expected ~5% contamination in real world
            random_state=42,
        )),
    ])
    pipeline.fit(X_normal)

    # Evaluate on known clean vs. polluted
    n_eval = 500
    rng = np.random.default_rng(99)
    X_clean_eval = _generate_normal_data(n_eval // 2)
    X_polluted_eval = np.column_stack([
        rng.choice([4.5, 9.5], n_eval // 2) + rng.normal(0, 0.2, n_eval // 2),  # ph extreme
        rng.uniform(200, 600, n_eval // 2),     # turbidity very high
        rng.uniform(24, 33, n_eval // 2),
        rng.uniform(0.5, 1.0, n_eval // 2),     # turbulence high
        rng.uniform(100, 400, n_eval // 2),     # large baseline deviation
        rng.uniform(-0.5, 0.5, n_eval // 2),
    ])
    X_eval = np.vstack([X_clean_eval, X_polluted_eval])
    raw_scores = pipeline.decision_function(X_eval)
    # IF decision_function: more negative = more anomalous
    # Map to 0-1: 0 = normal, 1 = anomalous
    scores_01 = 1 - (raw_scores - raw_scores.min()) / (raw_scores.max() - raw_scores.min() + 1e-8)
    clean_mean = float(scores_01[:n_eval // 2].mean())
    polluted_mean = float(scores_01[n_eval // 2:].mean())
    separation = polluted_mean - clean_mean

    print(f"[PollutionIF] Clean mean score: {clean_mean:.3f} | Polluted mean score: {polluted_mean:.3f}")
    print(f"[PollutionIF] Separation: {separation:.3f}")

    metrics = {
        "clean_mean_score": round(clean_mean, 4),
        "polluted_mean_score": round(polluted_mean, 4),
        "score_separation": round(separation, 4),
        "n_estimators": 200,
        "contamination": 0.05,
        "training_data": "SYNTHETIC — not real pollution events",
    }

    meta = {
        "description": "IsolationForest unsupervised anomaly detector for pollution events",
        "label": MODEL_LABEL,
        "features": POLLUTION_FEATURES,
        "output": "anomaly score 0.0-1.0 (higher = more anomalous)",
        "disclaimer": (
            "PROTOTYPE. Synthetic training data. "
            "NOT validated on real pollution events. "
            "Do NOT use for regulatory or public health decisions."
        ),
        "metrics": metrics,
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }

    save_model(pipeline, MODEL_NAME, MODEL_VERSION, meta)
    print(f"[PollutionIF] Model saved: {MODEL_NAME}/{MODEL_VERSION}")
    return metrics


# ---------------------------------------------------------------------------
# Inference
# ---------------------------------------------------------------------------

_model_cache: tuple[Any, dict] | None = None
_score_min: float | None = None
_score_max: float | None = None


def predict_pollution_anomaly(
    ph: float,
    turbidity_ntu: float,
    temperature_c: float,
    turbulence_index: float,
    turbidity_baseline_deviation: float = 0.0,
    ph_rate_of_change_1h: float = 0.0,
) -> tuple[float, str]:
    """
    Predict pollution anomaly score.

    Returns:
        (score, version_label) where score is 0.0–1.0
    """
    global _model_cache
    if _model_cache is None:
        try:
            from apps.api.ml.registry import load_model
            _model_cache = load_model(MODEL_NAME)
        except FileNotFoundError:
            log.warning("pollution_model.not_found", msg="Using rule-based fallback")
            return _rule_based_pollution_score(ph, turbidity_ntu, turbulence_index), "rule-based-fallback"

    pipeline, meta = _model_cache
    X = np.array([[ph, turbidity_ntu, temperature_c, turbulence_index,
                   turbidity_baseline_deviation, ph_rate_of_change_1h]])

    raw_score = float(pipeline.decision_function(X)[0])
    # Normalize: IF decision_function is typically in [-0.5, 0.5]
    # More negative = more anomalous → invert and clip to [0,1]
    anomaly_score = max(0.0, min(1.0, (-raw_score + 0.5)))
    return round(anomaly_score, 4), f"{MODEL_NAME}/{MODEL_VERSION}"


def _rule_based_pollution_score(ph: float, turbidity: float, turbulence: float) -> float:
    """Simple rule-based fallback when model is not available."""
    score = 0.0
    if ph < 5.5 or ph > 9.5:
        score += 0.5
    elif ph < 6.5 or ph > 8.5:
        score += 0.2

    if turbidity > 200:
        score += 0.4
    elif turbidity > 80:
        score += 0.2
    elif turbidity > 30:
        score += 0.1

    if turbulence > 0.5:
        score += 0.1

    return min(1.0, round(score, 4))


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).parents[3]))
    metrics = train_and_register()
    print(f"Training complete: {metrics}")
