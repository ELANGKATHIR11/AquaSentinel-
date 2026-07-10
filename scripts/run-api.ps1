#!/usr/bin/env pwsh
# AquaSentinel — Run API Server
# Usage: .\scripts\run-api.ps1 [-Port 8000] [-Reload]

param(
    [int]$Port = 8000,
    [switch]$Reload,
    [switch]$Production
)

$rootDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $rootDir

Write-Host "=== AquaSentinel API Server ===" -ForegroundColor Cyan
Write-Host "Port: $Port | Reload: $Reload | Production: $Production" -ForegroundColor Gray

if (-not (Test-Path ".env")) {
    Write-Warning ".env not found. Copying from .env.example..."
    Copy-Item ".env.example" ".env"
}

$uvicornArgs = @(
    "apps.api.main:app",
    "--host", "0.0.0.0",
    "--port", $Port.ToString()
)

if ($Reload) {
    $uvicornArgs += "--reload"
}

if ($Production) {
    $uvicornArgs += "--workers"
    $uvicornArgs += "4"
    $uvicornArgs += "--no-access-log"
}

Write-Host "Starting: uvicorn $($uvicornArgs -join ' ')" -ForegroundColor Green
uvicorn @uvicornArgs
