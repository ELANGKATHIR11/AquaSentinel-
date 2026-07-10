# Windows PowerShell Script to pull large datasets and artifacts

Write-Host "=== Pulling AquaSentinel Large Files & Datasets ===" -ForegroundColor Cyan

# 1. Pull Git LFS assets
Write-Host "Pulling Git LFS files..." -ForegroundColor Gray
& git lfs pull

# 2. Pull DVC tracked files
if (Get-Command dvc -ErrorAction SilentlyContinue) {
    Write-Host "Pulling DVC datasets..." -ForegroundColor Gray
    & dvc pull
} else {
    Write-Warning "DVC CLI not available. Skipping DVC pull."
}

# 3. Verification step
Write-Host "Verifying pulled file checksums..." -ForegroundColor Gray
if (Test-Path "scripts/verify-data.ps1") {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verify-data.ps1
}

Write-Host "=== Data synchronization complete! ===" -ForegroundColor Green
