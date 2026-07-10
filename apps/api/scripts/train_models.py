"""Train all AquaSentinel ML models and save to registry."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parents[3]))

from apps.api.ml.flood_model import train_and_register as train_flood
from apps.api.ml.pollution_model import train_and_register as train_pollution

print("=" * 50)
print("AquaSentinel ML Model Training")
print("=" * 50)
print()
print("DISCLAIMER: These are prototype models trained on synthetic data.")
print("NOT validated for operational use.\n")

print("1/2 Training Flood Risk (RandomForest)...")
flood_metrics = train_flood(n_samples=3000)
print()

print("2/2 Training Pollution Anomaly (IsolationForest)...")
pollution_metrics = train_pollution(n_samples=5000)
print()

print("=" * 50)
print("Training complete. Models saved to: apps/api/ml/registry/")
print(f"  flood_risk_rf:       AUC={flood_metrics.get('auc_roc', 'N/A')}")
print(f"  pollution_anomaly_if: separation={pollution_metrics.get('score_separation', 'N/A')}")
print("=" * 50)
