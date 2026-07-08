import asyncio
import random
import logging
from core import db, ws_manager, new_id, utcnow_iso
from pipeline import process_telemetry

logger = logging.getLogger("simulator")


class Simulator:
    def __init__(self):
        self.running = False
        self.task = None
        self.run_id = None
        self.interval = 5
        self.states = {}

    async def start(self, node_count=None, started_by="system"):
        if self.running:
            return {"status": "already_running", "run_id": self.run_id}
        sensors = await db.sensors.find({"data_source": "simulation", "device_status": {"$ne": "retired"}}, {"_id": 0}).to_list(200)
        if node_count and node_count > len(sensors):
            await self._provision_extra(node_count - len(sensors))
            sensors = await db.sensors.find({"data_source": "simulation", "device_status": {"$ne": "retired"}}, {"_id": 0}).to_list(500)
        elif node_count:
            sensors = sensors[:node_count]
        self.run_id = f"SIM-{new_id()[:8].upper()}"
        for s in sensors:
            self.states[s["id"]] = self._init_state(s)
        self.running = True
        self.task = asyncio.create_task(self._loop())
        await ws_manager.broadcast("simulation.started", {"simulation_run_id": self.run_id, "node_count": len(sensors), "started_by": started_by})
        return {"status": "started", "run_id": self.run_id, "node_count": len(sensors)}

    async def stop(self):
        self.running = False
        if self.task:
            self.task.cancel()
            self.task = None
        rid = self.run_id
        await ws_manager.broadcast("simulation.completed", {"simulation_run_id": rid})
        return {"status": "stopped", "run_id": rid}

    def status(self):
        return {"running": self.running, "run_id": self.run_id, "node_count": len(self.states), "interval_seconds": self.interval}

    def _init_state(self, sensor):
        return {"seq": (sensor.get("last_sequence_number") or 0) + 1, "level": random.uniform(120, 280), "ph": random.uniform(7.0, 7.8),
                "turb": random.uniform(8, 30), "temp": random.uniform(20, 28), "battery": random.uniform(55, 98),
                "rain_event": 0, "pollution_event": 0, "sampling_interval": sensor.get("sampling_interval_seconds", 60)}

    async def _provision_extra(self, count):
        sites = await db.river_sites.find({}, {"_id": 0}).to_list(50)
        gws = await db.gateways.find({}, {"_id": 0}).to_list(50)
        base = await db.sensors.count_documents({})
        docs = []
        for i in range(count):
            site = random.choice(sites)
            gw = next((g for g in gws if g["river_site_id"] == site["id"]), random.choice(gws))
            lat = site["location"]["coordinates"][1] + random.uniform(-0.02, 0.02)
            lon = site["location"]["coordinates"][0] + random.uniform(-0.02, 0.02)
            docs.append({"id": new_id(), "name": f"AQS-{base + i + 1:04d}", "sensor_id": f"AQS-{base + i + 1:04d}",
                         "gateway_id": gw["id"], "organization_id": site["organization_id"], "river_site_id": site["id"],
                         "site_name": site["name"], "firmware_version": "1.4.2", "hardware_revision": "rev-C",
                         "device_status": "provisioned", "last_seen": None, "sampling_interval_seconds": 60,
                         "transmission_interval_seconds": 60, "location": {"type": "Point", "coordinates": [lon, lat]},
                         "data_source": "simulation", "battery_percent": None, "device_health_score": None,
                         "calibration_profile_version": "cal-1.0", "configuration_version": "cfg-1.0",
                         "created_at": utcnow_iso(), "latest": {}})
        if docs:
            await db.sensors.insert_many([dict(d) for d in docs])

    def _gen_packet(self, sensor, st):
        if st["rain_event"] > 0:
            st["rain_event"] -= 1
            st["level"] += random.uniform(4, 14)
            rain_1h = random.uniform(20, 55)
        else:
            st["level"] += random.uniform(-3, 3.2)
            rain_1h = random.uniform(0, 4)
            if random.random() < 0.004:
                st["rain_event"] = random.randint(10, 25)
        st["level"] = max(40, min(650, st["level"]))
        if st["pollution_event"] > 0:
            st["pollution_event"] -= 1
            st["ph"] += random.uniform(-0.25, 0.05)
            st["turb"] += random.uniform(5, 20)
        else:
            st["ph"] += random.uniform(-0.05, 0.05)
            st["turb"] += random.uniform(-2, 2)
            if random.random() < 0.003:
                st["pollution_event"] = random.randint(8, 15)
        st["ph"] = max(5.5, min(9.2, st["ph"]))
        st["turb"] = max(1, min(400, st["turb"]))
        st["temp"] += random.uniform(-0.2, 0.2)
        st["battery"] = max(5, st["battery"] - random.uniform(0, 0.03))
        seq = st["seq"]
        st["seq"] += 1
        coords = sensor.get("location", {}).get("coordinates", [78.0, 27.0])
        return {
            "sensor_id": sensor["id"], "gateway_id": sensor.get("gateway_id"), "sequence_number": seq,
            "timestamp": utcnow_iso(), "payload_version": "1.0",
            "water_level_cm": round(st["level"], 1), "water_level_distance_cm": round(700 - st["level"], 1),
            "ph_raw": round(st["ph"] + 0.12, 2), "ph_calibrated": round(st["ph"], 2),
            "turbidity_raw": round(st["turb"] * 10.2, 1), "turbidity_ntu": round(st["turb"], 1),
            "temperature_c": round(st["temp"], 1), "dissolved_oxygen_mg_l": round(random.uniform(5.2, 8.8), 2),
            "electrical_conductivity_us_cm": round(random.uniform(250, 600), 1), "tds_ppm": round(random.uniform(180, 420), 1),
            "rainfall_mm": round(rain_1h / 4, 1), "rainfall_1hour": round(rain_1h, 1),
            "flow_velocity_m_s": round(0.4 + st["level"] / 400, 2),
            "tilt_deg": round(random.uniform(0, 6), 1), "acceleration_x": round(random.uniform(-0.4, 0.4), 3),
            "acceleration_y": round(random.uniform(-0.4, 0.4), 3), "acceleration_z": round(random.uniform(0.8, 1.1), 3),
            "gps_latitude": coords[1], "gps_longitude": coords[0], "gps_accuracy_m": round(random.uniform(2, 8), 1),
            "battery_voltage": round(3.2 + st["battery"] / 100 * 1.0, 2), "battery_percent": round(st["battery"], 1),
            "solar_voltage": round(random.uniform(4.5, 6.2), 2), "solar_current": round(random.uniform(0.05, 0.4), 3),
            "device_temperature_c": round(st["temp"] + random.uniform(2, 8), 1),
            "rssi": random.randint(-118, -62), "snr": round(random.uniform(-5, 12), 1),
            "packet_loss_percent": round(random.uniform(0, 4), 1),
        }

    async def _ack_commands(self):
        cmds = await db.device_commands.find({"status": "sent"}, {"_id": 0}).to_list(50)
        for cmd in cmds:
            if cmd["sensor_id"] not in self.states:
                continue
            response = {"result": "ok"}
            if cmd["command_type"] == "change_sampling_interval":
                iv = cmd.get("params", {}).get("interval_seconds", 60)
                self.states[cmd["sensor_id"]]["sampling_interval"] = iv
                await db.sensors.update_one({"id": cmd["sensor_id"]}, {"$set": {"sampling_interval_seconds": iv}})
                response = {"result": "ok", "applied_interval_seconds": iv}
            elif cmd["command_type"] == "request_device_diagnostics":
                response = {"result": "ok", "uptime_seconds": random.randint(10000, 900000), "restart_count": random.randint(0, 4), "free_memory_kb": random.randint(80, 220)}
            await db.device_commands.update_one({"id": cmd["id"]}, {"$set": {"status": "acknowledged", "acknowledged_at": utcnow_iso(), "response_payload": response}})
            await ws_manager.broadcast("command.acknowledged", {"command_id": cmd["id"], "sensor_id": cmd["sensor_id"], "command_type": cmd["command_type"], "response_payload": response})

    async def _loop(self):
        gateways_tick = 0
        while self.running:
            try:
                sensors = await db.sensors.find({"id": {"$in": list(self.states.keys())}}, {"_id": 0}).to_list(500)
                for sensor in sensors:
                    st = self.states.get(sensor["id"])
                    if not st:
                        continue
                    packet = self._gen_packet(sensor, st)
                    await process_telemetry(packet, data_source="simulation", correlation_id=f"{self.run_id}-{packet['sequence_number']}-{sensor['id'][:8]}")
                await self._ack_commands()
                gateways_tick += 1
                if gateways_tick % 4 == 0:
                    await db.gateways.update_many({}, {"$set": {"last_seen": utcnow_iso(), "gateway_status": "online"}})
                await asyncio.sleep(self.interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.exception("simulator loop error: %s", e)
                await asyncio.sleep(self.interval)


simulator = Simulator()
