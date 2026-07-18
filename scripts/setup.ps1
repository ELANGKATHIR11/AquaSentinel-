#!/usr/bin/env pwsh
# AquaSentinel — One-click setup for Windows native development
# Run this once after cloning the repository.
# Usage: .\scripts\setup.ps1

$rootDir = Split-Path -Parent $PSScriptRoot
Set-Location $rootDir

Write-Host "=== AquaSentinel Platform Setup ===" -ForegroundColor Cyan

# 1. Copy .env if not exists
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "[OK] Created .env from .env.example — fill in your DATABASE_URL and SECRET_KEY!" -ForegroundColor Yellow
} else {
    Write-Host "[OK] .env already exists" -ForegroundColor Green
}

# 2. Check Python
Write-Host "`n--- Python dependencies ---" -ForegroundColor Cyan
python --version
pip install -r apps/api/requirements.txt --quiet
Write-Host "[OK] Python dependencies installed" -ForegroundColor Green

# 3. Install npm packages
Write-Host "`n--- Node.js dependencies ---" -ForegroundColor Cyan
node --version
Set-Location apps/web
npm install
Set-Location $rootDir
Write-Host "[OK] npm packages installed" -ForegroundColor Green

# 4. Seed database
Write-Host "`n--- Database setup ---" -ForegroundColor Cyan
Write-Host "Running database seed (creates DB, enables PostGIS, seeds demo data)..."
python -m apps.api.scripts.seed_db
Write-Host "[OK] Database seeded" -ForegroundColor Green

Write-Host "`n=== Setup complete! ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Start API:  .\scripts\run-api.ps1 -Reload" -ForegroundColor Gray
Write-Host "  2. Start Web:  .\scripts\run-web.ps1" -ForegroundColor Gray
Write-Host "  3. Docs:       http://localhost:8000/docs" -ForegroundColor Gray
Write-Host "  4. Dashboard:  http://localhost:3000" -ForegroundColor Gray
