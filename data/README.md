# AquaSentinel — Data Directory Policy

This directory contains version-controlled geospatial layers and telemetry data. 

## Folder Policy

* `raw/`: Raw geospatial files and external datasets (e.g., HydroRIVERS database). **Fully ignored by Git, tracked by DVC.**
* `interim/`: Intermediate cleaning steps. **Fully ignored by Git.**
* `processed/`: Curated models inputs. **Fully ignored by Git.**
* `demo/`: Curated small test fixtures (< 10 MB). **Committed directly to Git.**
* `manifests/`: Dataset schemas and metadata registers. **Committed directly to Git.**

All large raw assets must be registered in the dataset manifest `data/manifest.csv`.
