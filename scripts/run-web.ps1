#!/usr/bin/env pwsh
# AquaSentinel — Run Web Dashboard (Vite Dev Server)
# Usage: .\scripts\run-web.ps1 [-Port 3000]

param([int]$Port = 3000)

$rootDir = Split-Path -Parent $PSScriptRoot
Set-Location $rootDir

Write-Host "=== AquaSentinel Web Dashboard ===" -ForegroundColor Cyan
Write-Host "URL: http://localhost:$Port" -ForegroundColor Green
Write-Host ""
Write-Host "Mode: $(if ((Get-Content .env | Select-String 'VITE_MOCK_MODE=true') -ne $null) { 'DEMO (mock)' } else { 'LIVE (connected to API)' })" -ForegroundColor Yellow

Set-Location (Join-Path $rootDir "apps/web")
npm run dev -- --port $Port
