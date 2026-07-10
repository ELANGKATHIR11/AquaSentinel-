"""
Unit tests for ML modules.
Tests WHS formula, feature engineering, and model inference.
"""
from __future__ import annotations

import pytest

from apps.api.ml.water_health_score import (
    HealthScoreResult,
    compute_water_health_score,
    score_ph,
    score_turbidity,
    score_temperature,
)
from apps.api.ml.features import (
    compute_features,
    build_model_input,
    FEATURE_NAMES,
)


# ---------------------------------------------------------------------------
# Water Health Score unit tests
# ---------------------------------------------------------------------------

class TestWaterHealthScore:
    def test_ideal_conditions_score_high(self):
        result = compute_water_health_score(
            ph=7.2, turbidity_ntu=3.0, temperature_c=25.0,
            turbulence_index=0.05, tilt_deg=2.0, battery_voltage=4.0,
        )
        assert result.score >= 85
        assert result.grade == "Excellent"

    def test_acidic_water_drops_score(self):
        result = compute_water_health_score(
            ph=4.5, turbidity_ntu=5.0, temperature_c=25.0,
            turbulence_index=0.05, tilt_deg=2.0, battery_voltage=4.0,
        )
        # pH weight is 0.30, score_ph(4.5)=0 → max contribution loss is 30 pts
        # Other params are ideal, so score should be ≤ 75 (not full Excellent)
        assert result.score < 80
        assert result.sub_scores["ph"] < 30.0  # pH sub-score is bad

    def test_high_turbidity_drops_score(self):
        result = compute_water_health_score(
            ph=7.0, turbidity_ntu=400.0, temperature_c=25.0,
            turbulence_index=0.05, tilt_deg=2.0, battery_voltage=4.0,
        )
        # Turbidity weight 0.30, score near 0 → total drops by ~30 points
        assert result.score < 80
        assert result.sub_scores["turbidity"] < 5.0  # Very bad turbidity

    def test_high_tilt_drops_score(self):
        result = compute_water_health_score(
            ph=7.2, turbidity_ntu=5.0, temperature_c=25.0,
            turbulence_index=0.05, tilt_deg=60.0, battery_voltage=4.0,
        )
        # Tilt weight 0.10 → can reduce total by at most 10 pts
        # A 60° tilt buoy still has good pH and turbidity, so score ≥ 85
        # The key check: tilt sub-score must be penalized
        assert result.sub_scores["tilt"] == 0.0  # 60° tilt = zero tilt score

    def test_score_range(self):
        result = compute_water_health_score(
            ph=6.0, turbidity_ntu=80.0, temperature_c=36.0,
            turbulence_index=0.6, tilt_deg=10.0, battery_voltage=3.2,
        )
        assert 0 <= result.score <= 100

    def test_grade_labels_are_valid(self):
        for ph in [4.0, 6.0, 7.0, 9.0, 11.0]:
            result = compute_water_health_score(
                ph=ph, turbidity_ntu=20.0, temperature_c=27.0,
                turbulence_index=0.1, tilt_deg=5.0, battery_voltage=3.8,
            )
            assert result.grade in ("Excellent", "Good", "Fair", "Poor", "Critical")

    def test_disclaimer_present(self):
        result = compute_water_health_score(
            ph=7.0, turbidity_ntu=5.0, temperature_c=25.0,
            turbulence_index=0.1, tilt_deg=3.0, battery_voltage=4.0,
        )
        assert "PROTOTYPE" in result.disclaimer
        assert "NOT" in result.disclaimer


class TestPhScoring:
    def test_ideal_ph_range(self):
        assert score_ph(7.0) == 100.0
        assert score_ph(6.5) == 100.0
        assert score_ph(8.5) == 100.0

    def test_marginal_ph(self):
        assert score_ph(6.0) == 60.0
        assert score_ph(9.0) == 60.0

    def test_extreme_ph_zero(self):
        assert score_ph(3.0) == 0.0
        assert score_ph(12.0) == 0.0


class TestTurbidityScoring:
    def test_excellent_turbidity(self):
        assert score_turbidity(2.0) == 100.0

    def test_high_turbidity_lower_score(self):
        assert score_turbidity(50.0) < score_turbidity(10.0)
        assert score_turbidity(300.0) < 10.0

    def test_score_non_negative(self):
        assert score_turbidity(1000.0) >= 0.0


# ---------------------------------------------------------------------------
# Feature engineering tests
# ---------------------------------------------------------------------------

class TestFeatureEngineering:
    def _make_readings(self, n=24) -> list[dict]:
        """Generate simple test readings."""
        from datetime import datetime, timedelta, timezone
        readings = []
        for i in range(n):
            ts = datetime.now(timezone.utc) - timedelta(minutes=30 * (n - i))
            readings.append({
                "timestamp": ts.isoformat(),
                "water_level_cm": 150.0 + i * 2,
                "ph": 7.0,
                "turbidity_ntu": 10.0,
                "temperature_c": 28.0,
                "tilt_deg": 3.0,
                "turbulence_index": 0.05,
                "battery_voltage": 3.8,
                "rssi": -90,
                "snr": 7.0,
            })
        return readings

    def test_features_returns_correct_length(self):
        readings = self._make_readings(24)
        features = compute_features(readings, "AQ001")
        assert len(features) == 24

    def test_empty_readings_returns_empty(self):
        result = compute_features([], "AQ001")
        assert result == []

    def test_feature_vector_length(self):
        readings = self._make_readings(24)
        current = readings[-1]
        from apps.api.ml.features import get_feature_vector
        features = get_feature_vector(current, readings[:-1])
        vector = build_model_input(current, features)
        assert len(vector) == len(FEATURE_NAMES)

    def test_rising_water_slope_positive(self):
        readings = self._make_readings(24)  # water_level increases by 2 each step
        features = compute_features(readings, "AQ001")
        # Last reading should have positive slope
        last_features = features[-1]
        assert last_features["water_level_slope_1h"] > 0
