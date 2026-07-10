# AquaSentinel — GitHub Storage & Secret Policy

This document defines the storage limits, LFS patterns, and security constraints for the AquaSentinel repository.

---

## 1. Storage Limits

* **Direct Commits (< 10 MB)**: Code, configurations, schemas, and test fixtures are committed directly to Git.
* **Git LFS (10 MB – 100 MB)**: Approved assets (like maps, small GeoJSON layer overlays) are managed by Git LFS.
* **DVC / External Storage (> 100 MB)**: Multi-GB datasets and trained model binaries must never be added to Git history. They must be tracked via DVC.
* **Hard Block (> 2 GB)**: No file above 2 GB may be pushed to GitHub or Git LFS. These belong strictly in raw external object storage.

---

## 2. Pre-Commit Guards
A pre-commit Git hook checks staged files to block:
1. Files exceeding 100 MB.
2. Credentials or secret key exposure (e.g. `.env` files, PEM certificates).

To configure this hook:
```powershell
.\scripts\setup-git.ps1
```
