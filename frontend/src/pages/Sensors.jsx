import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API, fmtErr, timeAgo } from "../lib/api";
import { LoadingState, ErrorState, EmptyState, StatusBadge } from "../components/Bits";
import { useLive } from "../components/Layout";
import { Download } from "lucide-react";

export default function Sensors() {
  const [sensors, setSensors] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const navigate = useNavigate();
  const { subscribe } = useLive();

  const load = useCallback(() => {
    setError("");
    API.get("/sensors").then((r) => setSensors(r.data)).catch((e) => setError(fmtErr(e)));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => subscribe((evt) => {
    if (evt.event === "prediction.created" || evt.event === "telemetry.created" || evt.event === "sensor.status_changed") {
      setSensors((prev) => prev?.map((s) => s.id === evt.data.sensor_id
        ? { ...s, device_status: evt.data.device_status || "online", battery_percent: evt.data.battery_percent ?? s.battery_percent, latest: { ...s.latest, ...evt.data }, last_seen: evt.timestamp }
        : s));
    }
  }), [subscribe]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!sensors) return <LoadingState label="Loading sensor fleet" />;

  const filtered = filter === "all" ? sensors : sensors.filter((s) => s.device_status === filter);

  const exportGeo = async () => {
    const { data } = await API.get("/export/sensors.geojson");
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/geo+json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "aquasentinel_sensors.geojson";
    a.click();
  };

  return (
    <div data-testid="sensors-page" className="space-y-4">
      <div className="flex items-center gap-2">
        {["all", "online", "offline", "provisioned", "retired"].map((f) => (
          <button key={f} data-testid={`sensor-filter-${f}`} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded text-xs font-mono uppercase tracking-wider border transition-colors ${filter === f ? "bg-blue-600 border-blue-600 text-white" : "border-slate-700 text-slate-400 hover:text-white"}`}>
            {f}
          </button>
        ))}
        <button data-testid="export-geojson-btn" onClick={exportGeo} className="ml-auto inline-flex items-center gap-2 px-3 py-1.5 rounded border border-slate-700 text-xs text-slate-300 hover:bg-slate-800 transition-colors">
          <Download className="w-3.5 h-3.5" /> GeoJSON
        </button>
      </div>

      {filtered.length === 0 ? <EmptyState message="No sensors match this filter" /> : (
        <div className="panel overflow-x-auto">
          <table data-testid="sensor-fleet-table" className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-slate-800">
                {["Sensor", "Site", "Status", "Level (cm)", "pH", "Turbidity", "Risk", "Health", "Battery", "Last Seen"].map((h) => (
                  <th key={h} className="widget-title px-3 py-2.5 font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} data-testid={`sensor-row-${s.name}`} onClick={() => navigate(`/sensor/${s.id}`)}
                  className="border-b border-slate-800/60 hover:bg-slate-900 cursor-pointer transition-colors">
                  <td className="px-3 py-2 font-mono text-blue-400">{s.name}</td>
                  <td className="px-3 py-2 text-slate-300">{s.site_name}</td>
                  <td className="px-3 py-2"><StatusBadge value={s.device_status} /></td>
                  <td className="px-3 py-2 font-mono">{s.latest?.water_level_cm ?? "—"}</td>
                  <td className="px-3 py-2 font-mono">{s.latest?.ph_calibrated ?? "—"}</td>
                  <td className="px-3 py-2 font-mono">{s.latest?.turbidity_ntu ?? "—"}</td>
                  <td className="px-3 py-2"><StatusBadge value={s.latest?.flood_risk_level || "—"} /></td>
                  <td className="px-3 py-2 font-mono">{s.latest?.water_health_score ?? "—"}</td>
                  <td className="px-3 py-2 font-mono">{s.battery_percent != null ? `${s.battery_percent}%` : "—"}</td>
                  <td className="px-3 py-2 font-mono text-slate-500 whitespace-nowrap">{timeAgo(s.last_seen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
