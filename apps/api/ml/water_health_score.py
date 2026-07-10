"""
AquaSentinel — Water Health Score (WHS)
========================================
Transparent, rule-based formula for computing a 0–100 water health score
from raw sensor readings.

IMPORTANT DISCLAIMER:
  This is NOT the official Indian Water Quality Index (WQI) or any standardized
  index. It is a research prototype designed for demonstration purposes only.
  Do NOT use these scores for regulatory decisions, public health advisories,
  or official water quality reporting.

  The formula and weights are chosen for illustrative purposes and have NOT
  been validated against official water quality standards.

Formula:
  WHS = round(
    w_ph * pH_score +
    w_turb * turbidity_score +
    w_level * water_level_score +
    w_temp * temperature_score +
    w_do   * dissolved_oxygen_proxy_score +
    w_tilt * tilt_penalty
  )

Each sub-score is 0–100 based on CPCB Class C surface water guidelines
(suitable for outdoor bathing after conventional treatment), used only as
a reference for parameter ranges. Weights sum to 1.0.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


# ---------------------------------------------------------------------------
# Parameter scoring functions (each returns 0.0–100.0)
# ---------------------------------------------------------------------------

def score_ph(ph: float) -> float:
    """pH 6.5–8.5 is ideal. Penalty outside this range."""
    if 6.5 <= ph <= 8.5:
        return 100.0
    if 5.5 <= ph < 6.5 or 8.5 < ph <= 9.5:
        return 60.0
    if 4.5 <= ph < 5.5 or 9.5 < ph <= 10.5:
        return 20.0
    return 0.0


def score_turbidity(turbidity_ntu: float) -> float:
    """Turbidity: < 5 NTU excellent, > 250 NTU very bad."""
    if turbidity_ntu < 5:
        return 100.0
    if turbidity_ntu < 25:
        return 85.0 - (turbidity_ntu - 5) * (25.0 / 20.0)
    if turbidity_ntu < 100:
        return 60.0 - (turbidity_ntu - 25) * (40.0 / 75.0)
    if turbidity_ntu < 250:
        return 20.0 - (turbidity_ntu - 100) * (15.0 / 150.0)
    return max(0.0, 5.0 - turbidity_ntu / 100.0)


def score_temperature(temperature_c: float) -> float:
    """Optimal 20–30°C. Extreme heat or cold reduces score."""
    if 20.0 <= temperature_c <= 30.0:
        return 100.0
    if 15.0 <= temperature_c < 20.0 or 30.0 < temperature_c <= 35.0:
        return 75.0
    if 10.0 <= temperature_c < 15.0 or 35.0 < temperature_c <= 40.0:
        return 40.0
    return 10.0


def score_water_level_rate(turbulence_index: float) -> float:
    """Lower turbulence = healthier, calmer water."""
    return max(0.0, 100.0 - turbulence_index * 80.0)


def score_tilt(tilt_deg: float) -> float:
    """Tilt penalty — high tilt suggests buoy capsized or tamper event."""
    if tilt_deg < 10:
        return 100.0
    if tilt_deg < 30:
        return 80.0
    if tilt_deg < 45:
        return 40.0
    return 0.0


def score_battery(battery_voltage: float) -> float:
    """Battery-based reliability penalty (low battery = unreliable readings)."""
    if battery_voltage >= 3.7:
        return 100.0
    if battery_voltage >= 3.4:
        return 80.0
    if battery_voltage >= 3.1:
        return 50.0
    return 20.0


# ---------------------------------------------------------------------------
# Composite score
# ---------------------------------------------------------------------------

# Weights (must sum to 1.0)
WEIGHTS = {
    "ph": 0.30,
    "turbidity": 0.30,
    "temperature": 0.15,
    "turbulence": 0.10,
    "tilt": 0.10,
    "battery": 0.05,
}


@dataclass
class HealthScoreResult:
    score: int                        # 0–100
    grade: str                        # Excellent / Good / Fair / Poor / Critical
    sub_scores: dict[str, float]      # individual dimension scores
    disclaimer: str = (
        "PROTOTYPE SCORE — NOT official WQI. "
        "Not validated for regulatory or health decisions."
    )


def compute_water_health_score(
    ph: float,
    turbidity_ntu: float,
    temperature_c: float,
    turbulence_index: float,
    tilt_deg: float,
    battery_voltage: float,
) -> HealthScoreResult:
    """Compute the Water Health Score (WHS) from sensor readings."""
    sub_scores = {
        "ph": score_ph(ph),
        "turbidity": score_turbidity(turbidity_ntu),
        "temperature": score_temperature(temperature_c),
        "turbulence": score_water_level_rate(turbulence_index),
        "tilt": score_tilt(tilt_deg),
        "battery": score_battery(battery_voltage),
    }

    composite = sum(WEIGHTS[k] * sub_scores[k] for k in WEIGHTS)
    final_score = max(0, min(100, round(composite)))

    if final_score >= 85:
        grade = "Excellent"
    elif final_score >= 65:
        grade = "Good"
    elif final_score >= 45:
        grade = "Fair"
    elif final_score >= 25:
        grade = "Poor"
    else:
        grade = "Critical"

    return HealthScoreResult(score=final_score, grade=grade, sub_scores=sub_scores)


def compute_from_payload(payload: dict[str, Any]) -> HealthScoreResult:
    """Convenience: compute WHS from a canonical telemetry payload dict."""
    return compute_water_health_score(
        ph=payload["ph"],
        turbidity_ntu=payload["turbidity_ntu"],
        temperature_c=payload["temperature_c"],
        turbulence_index=payload.get("turbulence_index", 0.05),
        tilt_deg=payload.get("tilt_deg", 0.0),
        battery_voltage=payload.get("battery_voltage", 4.0),
    )
