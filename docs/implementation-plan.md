# AquaSentinel Upgrade Implementation Plan

This document outlines the step-by-step upgrade plan to implement a production-grade, Windows-native AI/ML + IoT river intelligence platform.

---

## Phase 1: Foundation (Database & API Shell)
* Rename package to `aquasentinel-dashboard` and remove unused Express dependencies.
* Replace `(import.meta as any).env` with typed environment variables (`vite-env.d.ts`).
* Set up a FastAPI backend in `apps/api/` featuring:
  * Database connection with PostgreSQL + PostGIS (with standard indexed tables fallback for TimescaleDB).
  * CORS config, structured JSON logs, request IDs, and `/health` / `/ready` endpoints.
* Create PostgreSQL migrations/schema:
  * Tables: `users`, `roles`, `organizations`, `river_sites`, `sensor_nodes`, `gateways`, `telemetry_readings` (partitioned/indexed), `telemetry_features`, `ml_predictions`, `alerts`, `calibration_profiles`, `audit_logs`.
* Seed Tamil Nadu river sites, gateway profiles, sensors (AQ001–AQ003), and demo data.
* Wire the frontend REST client to consume real endpoints when `VITE_MOCK_MODE=false`.

## Phase 2: Real IoT & WebSocket Communication
* Configure Mosquitto/MQTT broker on Windows.
* Implement MQTT subscription client in FastAPI consuming `aquasentinel/{org}/{gateway}/telemetry`, `status`, etc.
* Write a Python gateway bridge featuring a compact LoRa binary decoder, SQLite offline queuing, and packet replay.
* Implement `POST /api/v1/telemetry/ingest` endpoint with packet deduplication, gateway authentication, out-of-order handling, and quality flags.
* Implement a realistic Python telemetry simulator sending payloads every 5s.
* Establish WebSockets endpoints (`/ws/dashboard`, `/ws/telemetry`, `/ws/alerts`, `/ws/device-health`) with reconnection, heartbeat, and subscription buffers.
* Connect React frontend to WebSocket server.

## Phase 3: Operational APIs & UI Updates
* Build REST endpoints and UI modals for manual data entry, telemetry CSV imports, and calibration profile adjustments.
* Implement a Device Health monitoring service (tilt, low battery, stale node, packet loss).
* Implement downlink command lifecycle (request reading, reboot, change interval).
* Ensure manual, simulation, and import sources are marked correctly and never overwrite raw IoT data.

## Phase 4: AI/ML Engineering & Analytics
* Create a transparent Water Health Score calculator.
* Train a scikit-learn `RandomForestRegressor` for Flood Risk Estimation and save as versioned joblib file.
* Train an `IsolationForest` model for Pollution Anomaly Detection.
* Implement a local model registry and inference pipeline.
* Integrate ML model outputs into real-time telemetry pipelines and UI indicators.

## Phase 5: Security, GIS, & Enterprise Quality
* Implement JWT authentication, token refresh, and RBAC middleware (super_admin, org_admin, operator, analyst, viewer).
* Hash gateway API keys and implement rate limits.
* Set up PostGIS spatial queries returning valid GeoJSON for sites and nodes.
* Build a PDF/CSV/GeoJSON report export service.
* Create PowerShell scripts for one-click setup, running services, and testing.
* Implement the QA testing suite (pytest, Vitest, contract, Playwright, load tests).

---

## Verification Plan
* Validate database connection and table layout.
* Test REST endpoint responses using Postman/curl.
* Test MQTT pub/sub flow using the simulator.
* Verify WebSocket real-time updates on Leaflet map and Recharts panels.
* Run QA checks: mypy type checking, ruff linting, pytest, and Vitest.
