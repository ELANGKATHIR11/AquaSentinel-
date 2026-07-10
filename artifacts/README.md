# AquaSentinel — Artifacts Directory Policy

This directory tracks the output models and validation report artifacts.

## Folder Policy

* `models/`: ML model training outputs (`.joblib` RF and IF files). **Fully ignored by Git, tracked by DVC/Object Storage.**
* `reports/`: Diagnostic reports and performance outcomes. **Only small examples committed to Git.**
* `exports/`: Cached user output files (PDF, CSV). **Fully ignored by Git.**

All versioned ML models must be registered in the artifacts manifest `artifacts/manifest.csv`.
