#!/usr/bin/env pwsh
# AquaSentinel — Mosquitto MQTT Broker Setup for Windows
# Installs and configures Mosquitto as a Windows service.
# Run once, as Administrator.
#
# Usage: .\scripts\setup-mqtt.ps1

Write-Host "=== AquaSentinel MQTT (Mosquitto) Setup ===" -ForegroundColor Cyan

# 1. Install via winget (no Docker required)
Write-Host "`nChecking Mosquitto installation..." -ForegroundColor Yellow
$mosquittoPath = "C:\Program Files\mosquitto\mosquitto.exe"

if (-not (Test-Path $mosquittoPath)) {
    Write-Host "Installing Mosquitto via winget..." -ForegroundColor Green
    winget install --id EclipseFoundation.Mosquitto --silent --accept-package-agreements --accept-source-agreements
    
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "winget install failed. Download manually: https://mosquitto.org/download/"
        exit 1
    }
} else {
    Write-Host "[OK] Mosquitto already installed: $mosquittoPath" -ForegroundColor Green
}

# 2. Write AquaSentinel config
$mosquittoDir = "C:\Program Files\mosquitto"
$configPath = "$mosquittoDir\aquasentinel.conf"

$configContent = @"
# AquaSentinel MQTT Broker Configuration
# Port: 1883 (plain MQTT) — TLS on port 8883 when certificates are available

listener 1883 0.0.0.0
allow_anonymous true

# Topic ACL — in production, configure with auth_plugin and real credentials
# Uncomment below when ready for production:
# allow_anonymous false
# password_file $mosquittoDir\passwd

# Persistence (survive restarts)
persistence true
persistence_location $mosquittoDir\data\

# Logging
log_dest file $mosquittoDir\log\aquasentinel.log
log_type all

# AquaSentinel topic hierarchy:
#   aquasentinel/{org}/{gateway}/telemetry   — uplink sensor data
#   aquasentinel/{org}/{gateway}/status      — gateway heartbeat
#   aquasentinel/{org}/{gateway}/health      — gateway diagnostics
#   aquasentinel/ack/{gateway}               — delivery acks (downlink)
#   aquasentinel/commands/{gateway}/{sensor} — sensor commands (downlink)

# QoS 1 max inflight messages
max_inflight_messages 50
"@

New-Item -ItemType Directory -Force -Path "$mosquittoDir\data" | Out-Null
New-Item -ItemType Directory -Force -Path "$mosquittoDir\log" | Out-Null
$configContent | Out-File -FilePath $configPath -Encoding utf8
Write-Host "[OK] Config written: $configPath" -ForegroundColor Green

# 3. Start as Windows service
Write-Host "`nConfiguring Mosquitto as Windows service..." -ForegroundColor Yellow

$svcExists = Get-Service -Name "mosquitto" -ErrorAction SilentlyContinue
if ($svcExists) {
    Stop-Service -Name "mosquitto" -Force -ErrorAction SilentlyContinue
    & "$mosquittoDir\mosquitto.exe" uninstall 2>&1 | Out-Null
}

& "$mosquittoDir\mosquitto.exe" install -c $configPath
Start-Service -Name "mosquitto"
Start-Sleep 2

$svc = Get-Service -Name "mosquitto" -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq "Running") {
    Write-Host "[OK] Mosquitto service running on port 1883" -ForegroundColor Green
} else {
    Write-Warning "Mosquitto service may not have started. Check: $mosquittoDir\log\aquasentinel.log"
}

Write-Host @"

=== Mosquitto Setup Complete ===
Broker:       localhost:1883
Config:       $configPath
Log:          $mosquittoDir\log\aquasentinel.log

Test with:
  mosquitto_pub -t "aquasentinel/demo/GW001/telemetry" -m '{"sensor_id":"AQ001"}'
  mosquitto_sub -t "aquasentinel/#" -v

AquaSentinel Gateway API keys:
  GW001: gw001_dev_key_aquasentinel
  GW002: gw002_dev_key_aquasentinel
"@ -ForegroundColor Cyan
