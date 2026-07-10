"""
AquaSentinel IoT Telemetry Simulator
=====================================
Generates realistic canonical telemetry payloads and sends them to the FastAPI
backend via HTTP POST to /api/v1/telemetry/ingest every 5 seconds.

Usage:
  python -m apps.api.scripts.simulator [--interval 5] [--sensors AQ001,AQ002,AQ003]

Canonical payload format (matches ESP32 LoRa output):
  {"sensor_id":"AQ001","gateway_id":"GW001","sequence_no":1,"timestamp":"...","latitude":...}

All simulated readings are tagged source='simulation'.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

# Ensure project root on sys.path
sys.path.insert(0, str(Path(__file__).parents[3]))


# ---------------------------------------------------------------------------
# Sensor baseline configuration
# ---------------------------------------------------------------------------

SENSOR_BASELINES: dict[str, dict[str, Any]] = {
    "AQ001": {
        "name": "Adyar Bypass Bridge",
        "gateway_id": "GW002",
        "lat": 12.9812, "lon": 80.2321,
        "water_level_cm": 190.5, "ph": 6.8, "turbidity_ntu": 12.0,
        "temperature_c": 28.5, "battery_voltage": 3.82, "rssi": -95, "snr": 4.2,
    },
    "AQ002": {
        "name": "Cooum Napier Bridge",
        "gateway_id": "GW001",
        "lat": 13.0694, "lon": 80.2831,
        "water_level_cm": 80.2, "ph": 7.4, "turbidity_ntu": 4.2,
        "temperature_c": 27.0, "battery_voltage": 4.12, "rssi": -82, "snr": 9.8,
    },
    "AQ003": {
        "name": "Chembarambakkam Spillway",
        "gateway_id": "GW002",
        "lat": 13.0084, "lon": 80.0612,
        "water_level_cm": 340.0, "ph": 7.0, "turbidity_ntu": 6.1,
        "temperature_c": 28.0, "battery_voltage": 3.95, "rssi": -91, "snr": 7.1,
    },
    "AQ004": {
        "name": "Kosasthalaiyar Ennore",
        "gateway_id": "GW001",
        "lat": 13.2163, "lon": 80.3151,
        "water_level_cm": 110.0, "ph": 6.2, "turbidity_ntu": 18.0,
        "temperature_c": 27.5, "battery_voltage": 3.21, "rssi": -121, "snr": -12.5,
    },
    "AQ005": {
        "name": "Buckingham Canal Mylapore",
        "gateway_id": "GW002",
        "lat": 13.0291, "lon": 80.2643,
        "water_level_cm": 145.0, "ph": 5.1, "turbidity_ntu": 34.5,
        "temperature_c": 28.2, "battery_voltage": 3.42, "rssi": -108, "snr": -2.3,
    },
}

_sequence_counters: dict[str, int] = {k: 0 for k in SENSOR_BASELINES}
_tick = 0


def _generate_payload(sensor_id: str) -> dict[str, Any]:
    """Generate a single realistic telemetry payload for the given sensor."""
    global _tick
    base = SENSOR_BASELINES[sensor_id]
    t = _tick / 120.0  # slow drift cycle

    # Smooth random walk on top of a sinusoidal tide cycle
    water_level = max(10.0, base["water_level_cm"]
                      + 12 * math.sin(t * math.pi)
                      + random.gauss(0, 2.5))
    ph = min(14.0, max(0.0, base["ph"] + 0.1 * math.sin(t * 0.5) + random.gauss(0, 0.04)))
    turbidity = max(0.1, base["turbidity_ntu"] + 2 * abs(math.sin(t)) + random.gauss(0, 0.8))
    temperature = base["temperature_c"] + 1.5 * math.sin(t / 2) + random.gauss(0, 0.2)
    tilt = max(0.0, 2.5 + random.gauss(0, 1.5))
    turbulence = max(0.0, min(1.0, 0.05 + 0.03 * abs(math.sin(t)) + random.gauss(0, 0.01)))
    battery = max(3.0, base["battery_voltage"] - _tick * 0.0001)
    solar = round(random.uniform(4.8, 5.5), 2)
    rssi = base["rssi"] + random.randint(-4, 4)
    snr = base["snr"] + random.gauss(0, 1.2)
    fish_idx = round(max(0.0, min(1.0, 0.5 + 0.2 * math.sin(t / 3) + random.gauss(0, 0.05))), 2)

    _sequence_counters[sensor_id] += 1

    return {
        "sensor_id": sensor_id,
        "gateway_id": base["gateway_id"],
        "sequence_no": _sequence_counters[sensor_id],
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "latitude": round(base["lat"] + random.gauss(0, 0.00005), 6),
        "longitude": round(base["lon"] + random.gauss(0, 0.00005), 6),
        "water_level_cm": round(water_level, 1),
        "ph": round(ph, 2),
        "turbidity_ntu": round(turbidity, 1),
        "temperature_c": round(temperature, 1),
        "tilt_deg": round(tilt, 1),
        "turbulence_index": round(turbulence, 3),
        "battery_voltage": round(battery, 2),
        "solar_voltage": solar,
        "rssi": rssi,
        "snr": round(snr, 1),
        "fish_activity_index": fish_idx,
        "source": "simulation",
    }


def run_simulator(
    api_url: str = "http://localhost:8000",
    sensor_ids: list[str] | None = None,
    interval_sec: float = 5.0,
    verbose: bool = True,
) -> None:
    """Main simulator loop — sends telemetry every `interval_sec` seconds."""
    global _tick
    if sensor_ids is None:
        sensor_ids = list(SENSOR_BASELINES.keys())

    print(f"=== AquaSentinel Telemetry Simulator ===")
    print(f"API: {api_url}")
    print(f"Sensors: {', '.join(sensor_ids)}")
    print(f"Interval: {interval_sec}s")
    print("Press Ctrl+C to stop\n")

    client = httpx.Client(timeout=10.0)

    try:
        while True:
            _tick += 1
            for sensor_id in sensor_ids:
                if sensor_id not in SENSOR_BASELINES:
                    print(f"  WARNING: Unknown sensor_id '{sensor_id}', skipping")
                    continue

                payload = _generate_payload(sensor_id)

                try:
                    resp = client.post(
                        f"{api_url}/api/v1/telemetry/ingest",
                        json=payload,
                        headers={"X-Gateway-Id": payload["gateway_id"]},
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        if verbose:
                            print(f"  [{sensor_id}] seq={payload['sequence_no']} "
                                  f"wl={payload['water_level_cm']}cm "
                                  f"ph={payload['ph']} → {data['status']}")
                    else:
                        print(f"  [{sensor_id}] HTTP {resp.status_code}: {resp.text[:100]}")
                except httpx.ConnectError:
                    print(f"  [{sensor_id}] Cannot connect to {api_url} — is the API running?")
                except Exception as exc:
                    print(f"  [{sensor_id}] Error: {exc}")

            time.sleep(interval_sec)
    except KeyboardInterrupt:
        print("\nSimulator stopped.")
    finally:
        client.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AquaSentinel Telemetry Simulator")
    parser.add_argument("--api", default="http://localhost:8000", help="API base URL")
    parser.add_argument(
        "--sensors",
        default=",".join(SENSOR_BASELINES.keys()),
        help="Comma-separated sensor IDs to simulate",
    )
    parser.add_argument("--interval", type=float, default=5.0, help="Send interval in seconds")
    parser.add_argument("--quiet", action="store_true", help="Suppress per-packet output")
    parser.add_argument("--load", action="store_true", help="Generate 100 concurrent load nodes")
    args = parser.parse_args()

    s_ids = [s.strip() for s in args.sensors.split(",")]

    if args.load:
        print("[Simulator] Generating 100-node load test configuration...")
        for i in range(100):
            sensor_name = f"AQ{100 + i}"
            SENSOR_BASELINES[sensor_name] = {
                "name": f"Load Node {100 + i}",
                "gateway_id": f"GW00{1 + (i % 3)}",
                "lat": 13.0 + random.uniform(-0.5, 0.5),
                "lon": 80.1 + random.uniform(-0.5, 0.5),
                "water_level_cm": 150.0 + random.uniform(-50, 50),
                "ph": 7.0 + random.uniform(-1, 1),
                "turbidity_ntu": 15.0 + random.uniform(-10, 20),
                "temperature_c": 28.0 + random.uniform(-2, 2),
                "battery_voltage": 3.7 + random.uniform(-0.5, 0.5),
                "rssi": -90 + random.randint(-10, 10),
                "snr": 5.0 + random.uniform(-5, 5),
            }
            _sequence_counters[sensor_name] = 0
        s_ids = [f"AQ{100 + i}" for i in range(100)]

    run_simulator(
        api_url=args.api,
        sensor_ids=s_ids,
        interval_sec=args.interval,
        verbose=not args.quiet,
    )
