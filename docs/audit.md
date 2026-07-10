# AquaSentinel Platform Audit Report

**Date:** 2026-07-09  
**Auditor:** Principal AI/ML + IoT Architect & QA Lead  
**OS/Target Environment:** Windows 11 / Windows Server Native (No Docker)  

---

## 1. Executive Summary

This audit assesses the current state of the AquaSentinel GIS Command Dashboard. The repository contains a functional React GIS dashboard with mock-only operations, and an offline Python geospatial/GIS pipeline for river centerline extraction. There is no backend, database, MQTT ingestion broker/client, WebSockets service, machine learning inference service, security architecture, RBAC, or test suite. 

To transition this project to a production-grade system, we must implement a complete, robust stack running natively on Windows using Python 3.13, FastAPI, PostgreSQL (with PostGIS and standard/partitioned tables fallback for TimescaleDB), and standard MQTT integration.

---

## 2. Codebase Discovery & Current Gaps

### 2.1 React GIS Frontend
* **Package Configuration:** 
  * Named `react-example` instead of `aquasentinel-dashboard`.
  * Contains Express dependencies (`express`, `@types/express`) in `package.json` that are unused since there is no server-side Node.js environment.
* **Environment Variables:**
  * Uses untyped `(import.meta as any).env` inside `src/services/api.ts`.
  * Lacks TypeScript declarations for `ImportMetaEnv`.
* **State Management & Mock Data:**
  * `useDashboardStore.ts` starts with `mockMode: true` and contains local updates fallback.
  * All metrics (WQI, Flood Risk, Pollution Anomalies) are calculated on the frontend using simple sine waves and noise.
  * Data sources are hardcoded/simulated without a tracking flag (`source: "iot" | "manual" | "simulation" | "import" | "cached" | "offline"`).
* **Identity and Mapping Data:**
  * Hardcoded operator names like "Engineer Ram" and "Operator Lakshmi".
  * Gateways and sensor locations are hardcoded to Chennai coordinates (Adyar, Cooum, Chembarambakkam, Kosasthalaiyar, Buckingham Canal).

### 2.2 Python GIS Pipeline
* **File Structure:**
  * `01_discover_sources.py` through `06_validate_export.py` script files represent an Osm/HydroSHEDS GIS data downloader.
  * `run_pipeline.py` launches these scripts sequentially.
  * Hardcoded path for PROJ_LIB in `run_pipeline.py` pointing to a local Miniconda env: `C:\Users\elang\miniconda3\envs\dgpu-core\Library\share\proj`.
* **Database & Ingestion Gaps:**
  * There is no existing backend api database integration.
  * Lacks model definition (SQLAlchemy/Alembic) for storing GIS layers or IoT telemetry readings.

### 2.3 System Infrastructures (MQTT & Postgres)
* **PostgreSQL:**
  * Local instance `postgresql-x64-18` is running on Port 5432 with password `Akilaarasu1!`.
  * PostGIS 3.6.2 extension is available.
  * TimescaleDB extension is **NOT** available on this Windows PostgreSQL 18 environment.
* **MQTT:**
  * No Mosquitto MQTT broker is active or running locally.
  * Winget package manager is available (v1.29.280) to install Mosquitto if needed, or we can run/mimic a local MQTT broker.

---

## 3. Recommended Remediation & Architecture

We will implement the requested architecture in 5 structured, safe phases:

```text
ESP32 Buoy → LoRa → Gateway → MQTT/HTTP → FastAPI → PostgreSQL + PostGIS (TimescaleDB fallback)
→ validation → feature engineering → ML models → alerts → WebSockets → React GIS UI
```

### Remediation Checklist
* [ ] **A1:** Rename package, remove unused Express dependencies, and set up typed Vite environment variables.
* [ ] **A2:** Implement FastAPI API server in `apps/api` with full async SQLAlchemy and PostgreSQL support.
* [ ] **A3:** Address absence of TimescaleDB extension on PG18 by writing a fallback schema using declarative partitioning by time or indexed timestamps.
* [ ] **A4:** Implement MQTT gateway and packet validator using async gmqtt or asyncio-mqtt.
* [ ] **A5:** Implement a Python simulator and SQLite-backed LoRa gateway bridge.
* [ ] **A6:** Build real-time WebSocket communication channels with reconnects, heartbeats, and client state synching.
* [ ] **A7:** Build Random Forest flood model and Isolation Forest pollution model with scikit-learn.
* [ ] **A8:** Implement enterprise security, JWT, and RBAC roles.
* [ ] **A9:** Write native Windows startup PowerShell scripts for all platform processes.
* [ ] **A10:** Add full test suite (pytest, Vitest, contract, Playwright) with load tests.
