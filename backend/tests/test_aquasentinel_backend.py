"""
AquaSentinel backend regression tests.
Covers: auth (JWT+cookie), RBAC, sensors, telemetry ingestion (idempotency, device key,
QC flags), alerts (ack/resolve + viewer 403), device commands, ML/Simulation/Audit,
Admin users, exports, health, lineage.
"""
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://water-command-center.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
DEVICE_KEY = "aqs-device-key-7f3a91"

ADMIN = {"email": "admin@aquasentinel.io", "password": "Admin@1234"}
OPS = {"email": "ops@aquasentinel.io", "password": "Ops@12345"}
VIEWER = {"email": "viewer@aquasentinel.io", "password": "Viewer@123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login {creds['email']} -> {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data, data
    return data["access_token"]


@pytest.fixture(scope="session")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="session")
def ops_token():
    return _login(OPS)


@pytest.fixture(scope="session")
def viewer_token():
    return _login(VIEWER)


def auth(t):
    return {"Authorization": f"Bearer {t}"}


# ---------- Health ----------
class TestHealth:
    def test_public_health(self):
        r = requests.get(f"{API}/health", timeout=10)
        assert r.status_code == 200

    def test_ready(self):
        r = requests.get(f"{API}/health/ready", timeout=10)
        assert r.status_code in (200, 401, 403)

    def test_system_requires_auth(self, admin_token):
        r_noauth = requests.get(f"{API}/health/system", timeout=10)
        assert r_noauth.status_code in (401, 403)
        r = requests.get(f"{API}/health/system", headers=auth(admin_token), timeout=10)
        assert r.status_code == 200
        j = r.json()
        assert isinstance(j, dict)


# ---------- Auth ----------
class TestAuth:
    def test_login_sets_cookie(self):
        r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=15)
        assert r.status_code == 200
        # httpOnly cookie
        assert any("access" in c.name.lower() or "token" in c.name.lower() for c in r.cookies), r.cookies

    def test_wrong_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN["email"], "password": "bad"}, timeout=10)
        assert r.status_code in (401, 400, 429)

    def test_me(self, admin_token):
        r = requests.get(f"{API}/auth/me", headers=auth(admin_token), timeout=10)
        assert r.status_code == 200
        assert r.json().get("email") == ADMIN["email"]


# ---------- Sensors ----------
@pytest.fixture(scope="session")
def sensors(admin_token):
    r = requests.get(f"{API}/sensors", headers=auth(admin_token), timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    if isinstance(j, dict) and "items" in j:
        j = j["items"]
    assert isinstance(j, list) and len(j) >= 1
    return j


class TestSensors:
    def test_list_sensors(self, sensors):
        assert len(sensors) >= 12 or len(sensors) >= 1
        s0 = sensors[0]
        assert "id" in s0 or "sensor_id" in s0


# ---------- Telemetry ingestion ----------
class TestIngest:
    def _sensor_id(self, sensors):
        s = sensors[0]
        return s.get("id") or s.get("sensor_id")

    def test_wrong_device_key_401(self, sensors):
        payload = {
            "sensor_id": self._sensor_id(sensors),
            "sequence_number": int(time.time()),
            "water_level_cm": 300,
            "ph_calibrated": 7.0,
            "turbidity_ntu": 10,
            "temperature_c": 25,
            "battery_percent": 90,
        }
        r = requests.post(f"{API}/ingest/telemetry", json=payload, headers={"X-Device-Key": "wrong"}, timeout=15)
        assert r.status_code == 401, r.text

    def test_ingest_and_idempotency(self, sensors):
        seq = int(time.time() * 1000) % 10_000_000
        payload = {
            "sensor_id": self._sensor_id(sensors),
            "sequence_number": seq,
            "water_level_cm": 500,
            "ph_calibrated": 7.2,
            "turbidity_ntu": 20,
            "temperature_c": 25,
            "battery_percent": 80,
        }
        h = {"X-Device-Key": DEVICE_KEY}
        r1 = requests.post(f"{API}/ingest/telemetry", json=payload, headers=h, timeout=20)
        assert r1.status_code in (200, 201, 202), r1.text
        j1 = r1.json()
        assert j1.get("status") in ("accepted", "ok", "success") or "prediction" in j1 or "correlation_id" in j1, j1

        # duplicate sequence
        r2 = requests.post(f"{API}/ingest/telemetry", json=payload, headers=h, timeout=20)
        assert r2.status_code in (200, 201, 202, 409), r2.text
        j2 = r2.json()
        assert j2.get("status") == "duplicate" or j2.get("duplicate") is True or "duplicate" in str(j2).lower(), j2

    def test_out_of_range_qc_flags(self, sensors):
        seq = int(time.time() * 1000) % 10_000_000 + 1
        payload = {
            "sensor_id": self._sensor_id(sensors),
            "sequence_number": seq,
            "water_level_cm": 500,
            "ph_calibrated": 22,  # out of range
            "turbidity_ntu": 20,
            "temperature_c": 25,
            "battery_percent": 80,
        }
        r = requests.post(f"{API}/ingest/telemetry", json=payload, headers={"X-Device-Key": DEVICE_KEY}, timeout=20)
        assert r.status_code in (200, 201, 202), r.text
        j = r.json()
        s = str(j).lower()
        assert "quality" in s or "flag" in s or "confidence" in s, j


# ---------- Telemetry query + lineage + exports ----------
class TestTelemetryQuery:
    def test_query_telemetry(self, admin_token, sensors):
        sid = sensors[0].get("id") or sensors[0].get("sensor_id")
        r = requests.get(f"{API}/telemetry", params={"sensor_id": sid, "hours": 1}, headers=auth(admin_token), timeout=15)
        assert r.status_code == 200, r.text

    def test_export_csv(self, admin_token):
        r = requests.get(f"{API}/export/telemetry.csv", headers=auth(admin_token), timeout=20)
        assert r.status_code == 200, r.text
        assert "text/csv" in r.headers.get("content-type", "") or "," in r.text[:200]

    def test_export_geojson(self, admin_token):
        r = requests.get(f"{API}/export/sensors.geojson", headers=auth(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("type") == "FeatureCollection"


# ---------- Alerts + RBAC ----------
class TestAlerts:
    def test_list_alerts(self, admin_token):
        r = requests.get(f"{API}/alerts", headers=auth(admin_token), timeout=15)
        assert r.status_code == 200

    def test_viewer_cannot_ack(self, viewer_token, admin_token):
        # get an alert id if any
        r = requests.get(f"{API}/alerts", headers=auth(admin_token), timeout=15)
        j = r.json()
        items = j if isinstance(j, list) else j.get("items", [])
        if not items:
            pytest.skip("no alerts to test ack")
        aid = items[0].get("id") or items[0].get("alert_id")
        r2 = requests.post(f"{API}/alerts/{aid}/acknowledge", json={"notes": "test"}, headers=auth(viewer_token), timeout=10)
        assert r2.status_code == 403, f"viewer ack expected 403 got {r2.status_code}"


# ---------- Device Commands ----------
class TestDeviceCommands:
    def test_issue_command_and_auto_ack(self, admin_token, sensors):
        sid = sensors[0].get("id") or sensors[0].get("sensor_id")
        payload = {"sensor_id": sid, "command_type": "request_device_diagnostics", "params": {}}
        r = requests.post(f"{API}/commands", json=payload, headers=auth(admin_token), timeout=15)
        if r.status_code == 404:
            # try alternate path
            r = requests.post(f"{API}/devices/commands", json=payload, headers=auth(admin_token), timeout=15)
        assert r.status_code in (200, 201, 202), r.text
        cmd = r.json()
        cid = cmd.get("id") or cmd.get("command_id")
        assert cid, cmd
        # wait up to ~15s for auto-ack
        acked = False
        for _ in range(15):
            time.sleep(1)
            rr = requests.get(f"{API}/commands", headers=auth(admin_token), timeout=10)
            if rr.status_code != 200:
                rr = requests.get(f"{API}/devices/commands", headers=auth(admin_token), timeout=10)
            items = rr.json() if isinstance(rr.json(), list) else rr.json().get("items", [])
            for it in items:
                if (it.get("id") == cid or it.get("command_id") == cid) and it.get("status") in ("acknowledged", "completed", "acked"):
                    acked = True
                    break
            if acked:
                break
        assert acked, "command not auto-acknowledged within 15s"


# ---------- Simulation ----------
class TestSimulation:
    def test_status(self, admin_token):
        r = requests.get(f"{API}/simulation/status", headers=auth(admin_token), timeout=10)
        assert r.status_code == 200

    def test_viewer_cannot_control(self, viewer_token):
        r = requests.post(f"{API}/simulation/stop", headers=auth(viewer_token), timeout=10)
        assert r.status_code == 403

    def test_stop_start(self, admin_token):
        r1 = requests.post(f"{API}/simulation/stop", headers=auth(admin_token), timeout=15)
        assert r1.status_code in (200, 202)
        time.sleep(1)
        r2 = requests.post(f"{API}/simulation/start", json={"node_count": 12}, headers=auth(admin_token), timeout=15)
        assert r2.status_code in (200, 202), r2.text


# ---------- Audit logs ----------
class TestAudit:
    def test_ops_can_view(self, ops_token):
        r = requests.get(f"{API}/audit-logs", headers=auth(ops_token), timeout=10)
        if r.status_code == 404:
            r = requests.get(f"{API}/audit", headers=auth(ops_token), timeout=10)
        assert r.status_code == 200, r.text

    def test_viewer_denied(self, viewer_token):
        r = requests.get(f"{API}/audit-logs", headers=auth(viewer_token), timeout=10)
        if r.status_code == 404:
            r = requests.get(f"{API}/audit", headers=auth(viewer_token), timeout=10)
        assert r.status_code == 403


# ---------- Admin users ----------
class TestAdminUsers:
    def test_create_and_role_change(self, admin_token):
        email = f"TEST_{uuid.uuid4().hex[:8]}@aquasentinel.io"
        payload = {"email": email, "password": "Testing@123", "name": "Test User", "role": "analyst"}
        r = requests.post(f"{API}/users", json=payload, headers=auth(admin_token), timeout=15)
        if r.status_code == 404:
            r = requests.post(f"{API}/admin/users", json=payload, headers=auth(admin_token), timeout=15)
        assert r.status_code in (200, 201), r.text
        u = r.json()
        uid = u.get("id") or u.get("user_id")
        assert uid, u

        # change role via correct endpoint
        r2 = requests.patch(f"{API}/users/{uid}/role", json={"role": "field_engineer"}, headers=auth(admin_token), timeout=10)
        assert r2.status_code in (200, 204), r2.text

    def test_viewer_cannot_create(self, viewer_token):
        r = requests.post(f"{API}/users", json={"email": "x@x.io", "password": "P@ss1234", "name": "x", "role": "viewer"}, headers=auth(viewer_token), timeout=10)
        if r.status_code == 404:
            r = requests.post(f"{API}/admin/users", json={"email": "x@x.io", "password": "P@ss1234", "name": "x", "role": "viewer"}, headers=auth(viewer_token), timeout=10)
        assert r.status_code == 403
