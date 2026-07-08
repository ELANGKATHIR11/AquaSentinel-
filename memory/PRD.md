# AquaSentinel — River Intelligence Platform PRD

## Original Problem Statement
Build AquaSentinel as an enterprise-grade River Intelligence Platform: real-time IoT ingestion, historical data management, GIS intelligence, AI/ML decision support (Flood Risk Estimation, Pollution Anomaly Detection, water-level forecasting), alert operations, device lifecycle management, RBAC security, auditability, reporting, integrations, offline resilience. Full data lifecycle: sensors → gateway → ingestion → validation/QC → storage → features → ML → alerts → WebSocket → dashboard → exports/audit.

## User Choices / Constraints
- User skipped clarification → defaults chosen: MongoDB (env constraint; PostgreSQL/TimescaleDB/PostGIS not available — equivalent patterns: time-series collections, 2dsphere geo index, raw JSON packet storage), JWT custom auth + 6 RBAC roles, realistic simulator feeding the REAL pipeline (data_source=simulation), prototype-labeled sklearn models trained on synthetic seed data, phased build.

## Architecture
- Backend: FastAPI (`/app/backend`) — core.py (auth/RBAC/audit/WS manager), pipeline.py (ingest→QC→derived→ML→alerts→broadcast), ml_engine.py (RandomForest flood risk, GradientBoosting forecast, IsolationForest pollution; joblib in models_store/), simulator.py (auto-starts 12 nodes, scalable to 120, auto-acks commands), seed.py (org, 3 users, 5 Indian river sites, 5 gateways, 12 sensors, model registry), routes_{auth,devices,telemetry,ops}.py, server.py (WS /api/ws, offline monitor).
- Frontend: React 19 + Tailwind, dark "control room" theme (Chivo/IBM Plex Sans/JetBrains Mono), react-leaflet v5 (NOTE: v4 breaks with React 19), recharts, sonner. Pages: Overview, LiveMap, Sensors, SensorDetail (digital twin), Gateways, TelemetryExplorer (+lineage trace), Alerts, DeviceCommands, MLOperations, Simulation (+system status), AuditLogs, AdminUsers.
- Collections: users, organizations, river_sites, sensors, gateways, telemetry_raw (unique sensor_id+sequence_number → idempotency), telemetry, predictions, alerts, notifications, device_commands, audit_logs, model_registry, login_attempts.
- Credentials in /app/memory/test_credentials.md. Device ingest key: X-Device-Key header (env DEVICE_INGEST_KEY).

## Implemented (2026-06 — Phase 1, tested: iteration_1.json 23/23 backend, frontend pass after LiveMap fix)
- JWT auth (cookies+Bearer), 6 RBAC roles, brute-force lockout, admin seeding
- HTTP ingestion with idempotency/dedup, QC range validation, confidence scores, derived features (slope, rolling mean/std, turbulence)
- ML inference on every packet (prototype-labeled), explainable water health score, feature contributions
- Alert engine (thresholds + ML), ack/resolve with immutable incident timeline, in-app notifications
- WebSocket live events (telemetry/prediction/alert/command/sensor status/simulation) + reconnect w/ backoff
- Live GIS map (dark tiles, risk-colored markers, coverage radius, site markers), digital twin page w/ 6 live charts
- Device commands (10 types) with ack tracking; gateway fleet health; simulation control (1–120 nodes)
- Data lineage raw→validated→prediction by correlation_id; CSV + GeoJSON exports; audit logs; user admin
- Health/ready/system endpoints; request-ID middleware

## Backlog (P0/P1/P2)
- P0: /incidents module (separate from alerts), /manual-input, /csv-import, /calibration + /maintenance modules with tickets
- P1: PDF reports + scheduled reports, /data-catalog, /analytics comparative charts, /settings, email/SMS/webhook adapters (mock mode), weather API adapter, geofencing/alert zones layers, historical map playback + time slider
- P1: Real MQTT broker integration (currently mock mode — HTTP ingestion is the real path), gateway SQLite store-and-forward reference implementation, OTA placeholder
- P2: Feature store/dataset registry UIs, model approval workflow UI, drift detection jobs, load/chaos test suites, CI pipeline, runbooks docs, object storage adapter, Redis caching, satellite flood extent adapter

## Next Tasks
1. Incidents + maintenance/calibration modules
2. Reports (PDF) + notification adapters
3. Historical playback on map
