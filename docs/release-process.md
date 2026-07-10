# AquaSentinel — Release Process Guide

This document defines the release cycle and manifest-compilation steps.

---

## 1. Release Manifest
Each release includes a generated `release-manifest.json` file in the root containing:
* Git Commit SHA.
* Dataset metadata (manifest hashes).
* Model metadata (model version hashes).
* Compilation timestamp.

---

## 2. Release Sequence

1. **Verify Local Integrity**:
   Ensure all local files pass checksum validation:
   ```powershell
   .\scripts\verify-data.ps1
   ```
2. **Build Release Manifest**:
   Generate the manifest file:
   ```powershell
   .\scripts\create-release-manifest.ps1
   ```
3. **Commit Release Metadata**:
   Commit the manifest and tag the release:
   ```powershell
   git add release-manifest.json
   git commit -m "Release v1.0.0"
   git tag -a v1.0.0 -m "Production release v1.0.0"
   ```
4. **Push Release**:
   Push the tag and code to the remote repository.
