# Windows PowerShell Script to push large datasets and model files

Write-Host "=== Pushing AquaSentinel Large Files & Datasets ===" -ForegroundColor Cyan

# 1. DVC commit & push
if (Get-Command dvc -ErrorAction SilentlyContinue) {
    Write-Host "Saving current workspace to DVC cache..." -ForegroundColor Gray
    & dvc commit -f
    Write-Host "Pushing datasets to remote storage..." -ForegroundColor Gray
    & dvc push
} else {
    Write-Error "DVC CLI not available. Failed to push DVC models/datasets."
    Exit 1
}

# 2. Push LFS tracked files
Write-Host "Pushing Git LFS tracked files to GitHub..." -ForegroundColor Gray
& git lfs push origin --all

Write-Host "=== Data push complete! ===" -ForegroundColor Green
