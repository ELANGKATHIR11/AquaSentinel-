import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { MapContainer, TileLayer, CircleMarker, Circle, Popup, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { API, fmtErr, timeAgo } from "../lib/api";
import { LoadingState, ErrorState, StatusBadge, riskColor } from "../components/Bits";
import { useLive } from "../components/Layout";

export default function LiveMap() {
  const [sensors, setSensors] = useState(null);
  const [sites, setSites] = useState([]);
  const [error, setError] = useState("");
  const [showCoverage, setShowCoverage] = useState(true);
  const { subscribe } = useLive();

  const load = useCallback(() => {
    setError("");
    Promise.all([API.get("/sensors"), API.get("/sites")])
      .then(([s, st]) => { setSensors(s.data); setSites(st.data); })
      .catch((e) => setError(fmtErr(e)));
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => subscribe((evt) => {
    if (evt.event === "prediction.created" || evt.event === "telemetry.created") {
      setSensors((prev) => prev?.map((s) => s.id === evt.data.sensor_id
        ? { ...s, device_status: "online", latest: { ...s.latest, ...evt.data } } : s));
    }
  }), [subscribe]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!sensors) return <LoadingState label="Loading GIS layers" />;

  const counts = { critical: 0, high: 0, moderate: 0, low: 0 };
  sensors.forEach((s) => { const l = s.latest?.flood_risk_level; if (counts[l] != null) counts[l] += 1; });

  return (
    <div data-testid="live-map-page" className="relative h-[calc(100vh-7.5rem)] rounded-lg overflow-hidden border border-slate-800">
      <MapContainer center={[27.2, 80.5]} zoom={6} className="h-full w-full" zoomControl={false}>
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution="&copy; OpenStreetMap &copy; CARTO" />
        {sites.map((site) => (
          <CircleMarker key={site.id} center={[site.location.coordinates[1], site.location.coordinates[0]]} radius={4}
            pathOptions={{ color: "#334155", fillColor: "#334155", fillOpacity: 0.9 }}>
            <Tooltip direction="top"><span className="font-mono text-xs">{site.name} · {site.river_name}</span></Tooltip>
          </CircleMarker>
        ))}
        {sensors.filter((s) => s.location).map((s) => {
          const [lon, lat] = s.location.coordinates;
          const color = s.device_status === "offline" ? "#64748b" : riskColor(s.latest?.flood_risk_level);
          return (
            <div key={s.id}>
              {showCoverage && <Circle center={[lat, lon]} radius={2500} pathOptions={{ color, weight: 0.6, fillColor: color, fillOpacity: 0.05 }} />}
              <CircleMarker center={[lat, lon]} radius={7} pathOptions={{ color, fillColor: color, fillOpacity: 0.85, weight: 1.5 }}>
                <Popup>
                  <div className="font-mono text-xs space-y-1 min-w-[180px]">
                    <div className="font-bold text-sm">{s.name}</div>
                    <div className="text-slate-400">{s.site_name}</div>
                    <div>Status: {s.device_status}</div>
                    <div>Level: {s.latest?.water_level_cm ?? "—"} cm</div>
                    <div>Risk: {s.latest?.flood_risk_level ?? "—"} ({s.latest?.flood_risk_score?.toFixed(2) ?? "—"})</div>
                    <div>Pollution: {s.latest?.pollution_anomaly_level ?? "—"}</div>
                    <div>Battery: {s.battery_percent ?? "—"}%</div>
                    <Link to={`/sensor/${s.id}`} className="text-blue-400 underline">Open digital twin →</Link>
                  </div>
                </Popup>
              </CircleMarker>
            </div>
          );
        })}
      </MapContainer>

      <div data-testid="map-legend-panel" className="absolute top-4 left-4 z-[1000] glass rounded-lg p-4 w-60">
        <div className="widget-title mb-3">Flood Risk Layer</div>
        {Object.entries(counts).map(([level, count]) => (
          <div key={level} className="flex items-center gap-2 text-xs py-0.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: riskColor(level) }} />
            <span className="capitalize text-slate-300">{level}</span>
            <span className="ml-auto font-mono text-slate-400">{count}</span>
          </div>
        ))}
        <label className="flex items-center gap-2 text-xs text-slate-400 mt-3 cursor-pointer">
          <input data-testid="toggle-coverage" type="checkbox" checked={showCoverage} onChange={(e) => setShowCoverage(e.target.checked)} className="accent-blue-500" />
          Coverage radius (2.5 km)
        </label>
        <div className="text-[10px] text-slate-500 mt-3 border-t border-slate-800 pt-2">Risk = prototype ML Flood Risk Estimation, not a guaranteed prediction.</div>
      </div>

      <div className="absolute bottom-4 left-4 z-[1000] glass rounded-lg px-4 py-2 text-xs font-mono text-slate-400">
        {sensors.filter((s) => s.device_status === "online").length} online / {sensors.length} sensors · live via WebSocket
      </div>
    </div>
  );
}
