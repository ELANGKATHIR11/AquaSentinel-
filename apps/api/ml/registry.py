"""
AquaSentinel — ML Model Registry
==================================
Manages versioned joblib model artifacts on disk.

Registry layout:
  apps/api/ml/registry/
    flood_risk_rf/
      v1.0-prototype/
        model.joblib
        metadata.json
      latest -> v1.0-prototype/   (symlink or latest.txt)
    pollution_anomaly_if/
      v1.0-prototype/
        model.joblib
        metadata.json

Models are loaded on first use and cached in memory.
The registry path is configurable via settings.
"""
from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import structlog

log = structlog.get_logger(__name__)

_lock = threading.Lock()
_cache: dict[str, Any] = {}


def get_registry_path() -> Path:
    from apps.api.config import get_settings
    return Path(get_settings().model_registry_dir)


def _model_dir(model_name: str, version: str) -> Path:
    return get_registry_path() / model_name / version


def save_model(
    model: Any,
    model_name: str,
    version: str,
    metadata: dict[str, Any],
) -> Path:
    """Save a trained model artifact to the registry."""
    model_dir = _model_dir(model_name, version)
    model_dir.mkdir(parents=True, exist_ok=True)

    model_path = model_dir / "model.joblib"
    joblib.dump(model, model_path, compress=3)

    meta_path = model_dir / "metadata.json"
    metadata.update({
        "model_name": model_name,
        "version": version,
        "saved_at": datetime.now(timezone.utc).isoformat(),
    })
    meta_path.write_text(json.dumps(metadata, indent=2, default=str))

    # Write latest pointer
    latest_path = get_registry_path() / model_name / "latest.txt"
    latest_path.write_text(version)

    log.info("model.saved", model_name=model_name, version=version, path=str(model_path))
    return model_path


def load_model(model_name: str, version: str = "latest") -> tuple[Any, dict[str, Any]]:
    """Load model from registry. Returns (model, metadata)."""
    cache_key = f"{model_name}:{version}"
    with _lock:
        if cache_key in _cache:
            return _cache[cache_key]

    if version == "latest":
        latest_file = get_registry_path() / model_name / "latest.txt"
        if not latest_file.exists():
            raise FileNotFoundError(f"No model registered for '{model_name}'")
        version = latest_file.read_text().strip()

    model_dir = _model_dir(model_name, version)
    model_path = model_dir / "model.joblib"
    meta_path = model_dir / "metadata.json"

    if not model_path.exists():
        raise FileNotFoundError(f"Model artifact not found: {model_path}")

    model = joblib.load(model_path)
    metadata = json.loads(meta_path.read_text()) if meta_path.exists() else {}

    with _lock:
        _cache[cache_key] = (model, metadata)
        _cache[f"{model_name}:latest"] = (model, metadata)

    log.info("model.loaded", model_name=model_name, version=version)
    return model, metadata


def list_models() -> list[dict[str, Any]]:
    """List all registered model versions."""
    registry = get_registry_path()
    if not registry.exists():
        return []

    result = []
    for model_dir in registry.iterdir():
        if not model_dir.is_dir():
            continue
        model_name = model_dir.name
        latest_file = model_dir / "latest.txt"
        latest = latest_file.read_text().strip() if latest_file.exists() else None

        versions = []
        for version_dir in model_dir.iterdir():
            if version_dir.is_dir():
                meta_path = version_dir / "metadata.json"
                meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
                versions.append({
                    "version": version_dir.name,
                    "is_latest": version_dir.name == latest,
                    "saved_at": meta.get("saved_at"),
                    "metrics": meta.get("metrics", {}),
                })

        result.append({"model_name": model_name, "latest": latest, "versions": versions})
    return result


def clear_cache() -> None:
    """Clear in-memory model cache (forces re-load on next inference)."""
    with _lock:
        _cache.clear()
    log.info("model.cache_cleared")


def check_model_drift(model_name: str, current_features: dict[str, Any], baseline_features: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Placeholder drift diagnostic.
    Compares current feature values to baseline distribution.
    In future production versions, this will calculate Population Stability Index (PSI)
    or Kolmogorov-Smirnov (KS) stats to identify distribution drift.
    """
    drift_detected = False
    details = {}
    
    if baseline_features:
        try:
            wl_vals = [f.get("water_level_cm", 150.0) for f in baseline_features]
            mean_wl = sum(wl_vals) / len(wl_vals)
            curr_wl = current_features.get("water_level_cm", 150.0)
            variation = abs(curr_wl - mean_wl) / (mean_wl + 1e-5)
            details["water_level_variation"] = variation
            if variation > 1.5:  # More than 150% variance from baseline
                drift_detected = True
        except Exception:
            pass

    return {
        "model_name": model_name,
        "drift_detected": drift_detected,
        "details": details,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
