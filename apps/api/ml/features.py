"""
AquaSentinel — Feature Engineering Pipeline
=============================================
Transforms raw telemetry readings into ML-ready features.

Features computed:
  - Rolling statistics (mean, max, slope) over 1h, 3h, 6h windows
  - Rate-of-change for key parameters
  - Seasonal/calendar features (hour, month, is_monsoon)
  - Baseline deviation (turbidity vs sensor-specific rolling baseline)

All features are computed in-memory using pandas on the historical readings
retrieved from the database.

IMPORTANT: This is a prototype pipeline. Features have not been
externally validated for flood or pollution prediction accuracy.
"""
from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd


# Tamil Nadu monsoon months (South-West: June–September, NE: October–December)
MONSOON_MONTHS = {6, 7, 8, 9, 10, 11, 12}


def is_monsoon_season(month: int) -> bool:
    return month in MONSOON_MONTHS


def compute_features(
    readings: list[dict[str, Any]],
    sensor_id: str,
) -> list[dict[str, Any]]:
    """
    Compute engineered features for a sequence of readings from one sensor.

    Args:
        readings: List of telemetry dicts sorted by timestamp (oldest first)
        sensor_id: Used for logging/context

    Returns:
        List of feature dicts, one per reading (same length as input).
        Returns empty list if readings is empty.
    """
    if not readings:
        return []

    df = pd.DataFrame(readings)
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df = df.sort_values("timestamp").reset_index(drop=True)

    # Calendar features
    df["hour_of_day"] = df["timestamp"].dt.hour
    df["month"] = df["timestamp"].dt.month
    df["is_monsoon"] = df["month"].apply(is_monsoon_season)
    df["day_of_week"] = df["timestamp"].dt.dayofweek

    # Set timestamp as index for rolling operations
    df = df.set_index("timestamp")

    # Water level rolling features (30-min interval assumed)
    df["water_level_rolling_mean_3h"] = (
        df["water_level_cm"].rolling(window=6, min_periods=1).mean()
    )
    df["water_level_rolling_max_6h"] = (
        df["water_level_cm"].rolling(window=12, min_periods=1).max()
    )
    # Slope: change over last 2 readings (rate of rise)
    df["water_level_slope_1h"] = df["water_level_cm"].diff(2)

    # pH rate of change (over last 1h = 2 readings)
    df["ph_rate_of_change_1h"] = df["ph"].diff(2)

    # Turbidity baseline deviation (deviation from 6h rolling mean)
    turb_baseline = df["turbidity_ntu"].rolling(window=12, min_periods=3).mean()
    df["turbidity_baseline_deviation"] = df["turbidity_ntu"] - turb_baseline

    # Temperature trend over 6h
    df["temperature_trend_6h"] = df["temperature_c"].diff(12)

    # Tilt acceleration (change in tilt — tamper indicator)
    df["tilt_change_rate"] = df["tilt_deg"].diff(2)

    # Battery drain rate (per hour)
    df["battery_drain_rate"] = df["battery_voltage"].diff(2)

    # RSSI trend
    df["rssi_trend"] = df["rssi"].diff(4)

    df = df.reset_index()
    df = df.fillna(0.0)

    # Return as list of dicts
    feature_cols = [
        "hour_of_day", "month", "is_monsoon", "day_of_week",
        "water_level_rolling_mean_3h", "water_level_rolling_max_6h",
        "water_level_slope_1h", "ph_rate_of_change_1h",
        "turbidity_baseline_deviation", "temperature_trend_6h",
        "tilt_change_rate", "battery_drain_rate", "rssi_trend",
    ]
    return df[feature_cols].to_dict(orient="records")


def get_feature_vector(
    current: dict[str, Any],
    history: list[dict[str, Any]],
) -> dict[str, float]:
    """
    Get the feature vector for the most recent reading given its history.

    Args:
        current: Most recent telemetry reading
        history: Previous readings (oldest first), NOT including current

    Returns:
        Feature dict for the current reading
    """
    all_readings = history + [current]
    features_list = compute_features(all_readings, current.get("sensor_id", "unknown"))
    if not features_list:
        return _zero_features()
    return features_list[-1]  # features for the current (last) reading


def _zero_features() -> dict[str, float]:
    return {
        "hour_of_day": 0, "month": 0, "is_monsoon": False, "day_of_week": 0,
        "water_level_rolling_mean_3h": 0.0, "water_level_rolling_max_6h": 0.0,
        "water_level_slope_1h": 0.0, "ph_rate_of_change_1h": 0.0,
        "turbidity_baseline_deviation": 0.0, "temperature_trend_6h": 0.0,
        "tilt_change_rate": 0.0, "battery_drain_rate": 0.0, "rssi_trend": 0.0,
    }


def build_model_input(
    current: dict[str, Any],
    features: dict[str, float],
) -> list[float]:
    """
    Build the flat feature vector for the ML models.
    Order must match what the models were trained on.

    Raw features + engineered features combined:
    [water_level_cm, ph, turbidity_ntu, temperature_c, tilt_deg,
     turbulence_index, battery_voltage, rssi, snr,
     water_level_slope_1h, water_level_rolling_max_6h,
     turbidity_baseline_deviation, ph_rate_of_change_1h,
     hour_of_day, is_monsoon]
    """
    return [
        float(current.get("water_level_cm", 0)),
        float(current.get("ph", 7.0)),
        float(current.get("turbidity_ntu", 0)),
        float(current.get("temperature_c", 28)),
        float(current.get("tilt_deg", 0)),
        float(current.get("turbulence_index", 0)),
        float(current.get("battery_voltage", 3.8)),
        float(current.get("rssi", -90)),
        float(current.get("snr", 5)),
        float(features.get("water_level_slope_1h", 0)),
        float(features.get("water_level_rolling_max_6h", 0)),
        float(features.get("turbidity_baseline_deviation", 0)),
        float(features.get("ph_rate_of_change_1h", 0)),
        float(features.get("hour_of_day", 0)),
        float(features.get("is_monsoon", 0)),
    ]


FEATURE_NAMES = [
    "water_level_cm", "ph", "turbidity_ntu", "temperature_c",
    "tilt_deg", "turbulence_index", "battery_voltage", "rssi", "snr",
    "water_level_slope_1h", "water_level_rolling_max_6h",
    "turbidity_baseline_deviation", "ph_rate_of_change_1h",
    "hour_of_day", "is_monsoon",
]
