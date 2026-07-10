"""
Unit tests for health, sensors, and telemetry API endpoints.
Uses in-memory SQLite + httpx.AsyncClient.
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient


class TestHealth:
    def test_health_endpoint(self, sync_client):
        resp = sync_client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "version" in data
        assert "timestamp" in data

    def test_health_has_no_db_call(self, sync_client):
        # Health should always return 200 even if DB is down
        resp = sync_client.get("/health")
        assert resp.status_code == 200


class TestSensors:
    @pytest.mark.asyncio
    async def test_list_sensors_empty(self, async_client: AsyncClient):
        resp = await async_client.get("/api/v1/sensors")
        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_sensor_not_found(self, async_client: AsyncClient):
        resp = await async_client.get("/api/v1/sensors/NOTEXIST")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_sensor_telemetry_not_found(self, async_client: AsyncClient):
        resp = await async_client.get("/api/v1/sensors/NOTEXIST/telemetry")
        assert resp.status_code == 404


class TestTelemetryIngest:
    def _make_payload(self, sensor_id: str = "AQ001") -> dict:
        return {
            "sensor_id": sensor_id,
            "gateway_id": "GW001",
            "sequence_no": 1,
            "timestamp": "2026-07-01T12:00:00+00:00",
            "latitude": 12.98,
            "longitude": 80.23,
            "water_level_cm": 150.0,
            "ph": 7.0,
            "turbidity_ntu": 10.0,
            "temperature_c": 28.0,
            "tilt_deg": 3.0,
            "turbulence_index": 0.05,
            "battery_voltage": 3.8,
            "rssi": -90,
            "snr": 7.0,
            "source": "simulation",
        }

    @pytest.mark.asyncio
    async def test_ingest_unknown_sensor_rejected(self, async_client: AsyncClient):
        """Ingest fails if sensor not registered."""
        resp = await async_client.post(
            "/api/v1/telemetry/ingest",
            json=self._make_payload("UNKNOWN"),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_ingest_invalid_ph_rejected(self, async_client: AsyncClient):
        """Ingest with invalid pH (>14) should fail validation."""
        payload = self._make_payload()
        payload["ph"] = 20.0
        resp = await async_client.post("/api/v1/telemetry/ingest", json=payload)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_manual_source_enforced(self, async_client: AsyncClient):
        """Manual endpoint should reject iot source and force manual."""
        payload = self._make_payload()
        payload["source"] = "iot"
        # Manual endpoint should 404 since sensor not in test DB
        resp = await async_client.post("/api/v1/telemetry/manual", json=payload)
        assert resp.status_code == 404


class TestAlerts:
    @pytest.mark.asyncio
    async def test_list_alerts_empty(self, async_client: AsyncClient):
        resp = await async_client.get("/api/v1/alerts")
        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_alert_not_found(self, async_client: AsyncClient):
        resp = await async_client.get("/api/v1/alerts/notexist")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_invalid_status_filter(self, async_client: AsyncClient):
        resp = await async_client.get("/api/v1/alerts?status=invalid_status")
        assert resp.status_code == 422


class TestGIS:
    @pytest.mark.asyncio
    async def test_gis_sensors_returns_feature_collection(self, async_client: AsyncClient):
        resp = await async_client.get("/api/v1/gis/sensors")
        assert resp.status_code == 200
        data = resp.json()
        assert data["type"] == "FeatureCollection"
        assert "features" in data

    @pytest.mark.asyncio
    async def test_gis_sites_returns_feature_collection(self, async_client: AsyncClient):
        resp = await async_client.get("/api/v1/gis/sites")
        assert resp.status_code == 200
        data = resp.json()
        assert data["type"] == "FeatureCollection"

    @pytest.mark.asyncio
    async def test_gis_sensor_not_found(self, async_client: AsyncClient):
        resp = await async_client.get("/api/v1/gis/sensors/NOTEXIST")
        assert resp.status_code == 404
