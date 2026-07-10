# AquaSentinel — Data Versioning Workflow (DVC)

This document details how large datasets (HydroRIVERS, Sentinel-2 imagery) and model binaries are versioned and stored.

---

## 1. Core Principles
* **Code in Git**: Python, TypeScript, SQL schema migrations, and markdown documentation belong in the GitHub repository.
* **Large Files in DVC**: Any file exceeding **100 MB** or raw telemetry/imagery datasets must be ignored in Git and tracked via DVC.
* **Metadata in Git**: DVC generates `.dvc` files containing file hashes (MD5). These `.dvc` files are committed to Git.

---

## 2. Developer Operations

### Initialize DVC Cache & Remote
To fetch versioned files, run:
```powershell
.\scripts\setup-dvc.ps1
```

### Pulling Data & Models
To download all datasets:
```powershell
.\scripts\pull-data.ps1
```

### Adding New Datasets
When adding a new raw file (e.g. `data/raw/large_dataset.zip`):
1. Add it to the manifest registry `data/manifest.csv`.
2. Tell DVC to track the file:
   ```powershell
   dvc add data/raw/large_dataset.zip
   ```
3. Commit the generated `.dvc` file to Git:
   ```powershell
   git add data/raw/large_dataset.zip.dvc data/manifest.csv
   git commit -m "Track new raw dataset"
   ```
4. Push the binary to the external remote storage:
   ```powershell
   .\scripts\push-data.ps1
   ```
