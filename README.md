# AquaSentinel: Industrial-Grade IoT Water Quality & Flood Monitoring Platform

AquaSentinel is an end-to-end industrial-grade system for monitoring real-time river health, water quality parameters, and predictive flood threats. It features high-fidelity ESP32 DevKit V1 edge firmware, an async FastAPI backend on SQLite, an integrated rule-and-ML-based AI Engine, and an interactive GIS Command Dashboard.

---

## 🏗️ Architecture

```
ESP32 DevKit V1 (Edge Node)
       ↓
Sensor Data Acquisition
       ↓
WiFi (HTTP REST API + MQTT)
       ↓
Raspberry Pi 4 (2GB Gateway)
       ↓
FastAPI Backend (SQLite Database + AI Engine + Dashboard Service)
```

- **ESP32**: Handles edge data acquisition, filtering (Moving Average + Median), local storage buffering, and sensor health checks.
- **Raspberry Pi 4**: Hosts the API service, SQLite database, AI inference engine, and the Web UI Dashboard.

---

## 🔌 Hardware & Pin Configuration

### ESP32 DevKit V1 Pin Mapping

| Sensor | GPIO Pin | Voltage | Note |
|---|---|---|---|
| **DS18B20 Temp** | GPIO4 | 3V3 | Requires 4.7kΩ pull-up |
| **MPU6050 SDA** | GPIO21 | 3V3 | I2C Data |
| **MPU6050 SCL** | GPIO22 | 3V3 | I2C Clock |
| **TSW-20M Turbidity**| GPIO34 | 5V | Analog Output (AO) |
| **Rain Sensor** | GPIO35 | 5V | Analog Output (AO) |
| **Ultrasonic TRIG** | GPIO18 | 5V | Trigger pulse |
| **Ultrasonic ECHO** | GPIO19 | 5V | Echo pulse (use 5V to 3.3V divider on RX) |
| **pH Sensor** | GPIO32 | 5V | Analog Output (AO) |
| **TDS Sensor** | GPIO33 | 5V | Analog Output (AO) |
| **NEO-6M GPS RX** | GPIO16 | 3V3 | ESP32 RX2 |
| **NEO-6M GPS TX** | GPIO17 | 3V3 | ESP32 TX2 |

---

## 🎨 Circuit Schematic Diagram

```
                 +-----------------------------------+
                 |          ESP32 DevKit V1          |
                 |                                   |
    3V3 ---------| [3V3]                       [GND] |--------- Common GND
    GPIO4 -------| [GPIO4]                   [GPIO21]|--------- SDA (MPU6050)
    GPIO32 ------| [GPIO32]                  [GPIO22]|--------- SCL (MPU6050)
    GPIO33 ------| [GPIO33]                  [GPIO18]|--------- TRIG (Ultrasonic)
    GPIO34 ------| [GPIO34]                  [GPIO19]|--------- ECHO (Ultrasonic)
    GPIO35 ------| [GPIO35]                  [GPIO16]|--------- RX (GPS TX)
    5V ----------| [VIN]                     [GPIO17]|--------- TX (GPS RX)
                 +-----------------------------------+

SENSORS WIRING DETAIL:
1. DS18B20:
   [VDD] -> 3V3, [GND] -> GND, [DQ] -> GPIO4 (with 4.7k resistor to 3V3)
2. MPU6050:
   [VCC] -> 3V3, [GND] -> GND, [SDA] -> GPIO21, [SCL] -> GPIO22
3. TSW-20M Turbidity / Rain / pH / TDS:
   [VCC] -> 5V (VIN), [GND] -> GND, [AO] -> Respectively mapped Analog pins
4. AJ-SR04M Ultrasonic:
   [VCC] -> 5V (VIN), [GND] -> GND, [Trig] -> GPIO18, [Echo] -> GPIO19
```

---

## 📂 Folder Structure

```
aquasentinel-gis-command-dashboard/
├── apps/
│   └── api/
│       ├── main.py                     # Backend startup
│       ├── database.py                 # SQLite configuration
│       ├── models.py                   # SQLAlchemy model schemas
│       ├── ml/
│       │   └── ai_engine.py            # WQI, Flood Risk & Anomaly Engines
│       └── routers/
│           └── aquasentinel_router.py   # REST API Endpoints
├── firmware/
│   └── buoy-node/
│       ├── platformio.ini              # Build specs and library deps
│       └── src/
│           └── main.cpp                # ESP32 C++ edge program
├── src/                                # Frontend UI pages
├── aquasentinel.db                     # SQLite Database
├── requirements.txt                    # Python library dependencies
└── README.md                           # This document
```

---

## 🧪 Calibration Guide

1. **pH Sensor**:
   - Immerse pH probe in standard pH 7.0 buffer solution. Read output voltage and set offset parameter (`cal_ph_offset`) so the sensor reports 7.0.
   - Place in pH 4.0 buffer solution to calculate the slope (`cal_ph_slope`).
2. **Turbidity Sensor**:
   - Calibrate in clear water. Set `cal_turbidity_factor` so output is exactly 0.0 NTU.
3. **Ultrasonic Water Level**:
   - Measure actual vertical height to target. Calibrate `cal_water_level_offset` to match true reference value.

Send a POST request to `/calibrate` on the ESP32 endpoint to update these configurations dynamically.

---

## 🚀 Deployment Guide

### Backend Configuration (Raspberry Pi)

1. Clone repository to your Raspberry Pi 4.
2. Install Python requirements:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the FastAPI server:
   ```bash
   uvicorn apps.api.main:app --host 0.0.0.0 --port 8000
   ```
   Swagger docs will be available at `http://<pi-ip>:8000/docs`.

### Edge Firmware Configuration (ESP32)

1. Open `firmware/buoy-node` in VS Code with PlatformIO.
2. Edit `main.cpp` and update `ssid`, `password`, and `api_endpoint` variables.
3. Upload firmware to your ESP32 DevKit V1.

---

## 🔬 Testing Guide

Verify ingestion and API compliance using curl or python:

```bash
# Telemetry Ingestion test
curl -X POST http://localhost:8000/api/sensor \
  -H "Content-Type: application/json" \
  -d '{
    "temp": 28.5,
    "turbidity": 12.4,
    "waterLevel": 185.0,
    "rain": 15.0,
    "pitch": 1.2,
    "roll": -0.8,
    "ax": 0.02,
    "ay": -0.01,
    "az": 0.98,
    "ph": 7.4,
    "tds": 240.0,
    "pressure": 1012.5,
    "lat": 13.0827,
    "lon": 80.2707,
    "device_id": "ESP32_DevKitV1_01"
  }'
```
