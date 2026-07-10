# Windows PowerShell Script to initialize DVC and workspace remotes

Write-Host "=== Setting up DVC for AquaSentinel ===" -ForegroundColor Cyan

# 1. Check if DVC is installed
if (-not (Get-Command dvc -ErrorAction SilentlyContinue)) {
    Write-Warning "DVC CLI is not installed or not in PATH. Please run: pip install dvc dvc-s3"
} else {
    Write-Host "DVC is installed. Checking config status..." -ForegroundColor Gray
}

# 2. Setup storage directory local path placeholder
$RemotePath = "data/dvc-remote"
if (-not (Test-Path $RemotePath)) {
    New-Item -ItemType Directory -Path $RemotePath | Out-Null
    Write-Host "Created local DVC remote storage path: $RemotePath" -ForegroundColor Gray
}

# 3. Configure DVC Remote named 'storage'
& dvc remote add -d -f storage "./$RemotePath"
& dvc config core.analytics false

Write-Host "[OK] DVC initialized with remote 'storage' pointing to './$RemotePath'" -ForegroundColor Green
Write-Host "=== DVC Configuration complete! ===" -ForegroundColor Green
