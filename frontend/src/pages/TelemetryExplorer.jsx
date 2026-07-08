import { useState, useEffect, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { API, fmtErr, fmtTime } from "../lib/api";
import { LoadingState, ErrorState, EmptyState, StatusBadge } from "../components/Bits";
import { Download, Search } from "lucide-react";
import { toast } from "sonner";

const METRICS = [
  { key: "water_level_cm", label: "Water Level (cm)", color: "#3b82f6" },
  { key: "ph_calibrated", label: "pH", color: "#10b981" },
  { key: "turbidity_ntu", label: "Turbidity (NTU)", color: "#f59e0b" },
  { key: "temperature_c", label: "Temp (°C)", color: "#f87171" },
  { key: "dissolved_oxygen_mg_l", label: "DO (mg/L)", color: "#22d3ee" },
  { key: "tds_ppm", label: "TDS (ppm)", color: "#a3e635" },
];

export default function TelemetryExplorer() {
  const [sensors, setSensors] = useState([]);
  const [sensorId, setSensorId] = useState("");
  const [hours, setHours] = useState(2);
  const [metric, setMetric] = useState("water_level_cm");
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [lineage, setLineage] = useState(null);
  const [lineageId, setLineageId] = useState("");

  useEffect(() => {
    API.get("/sensors").then((r) => {
      setSensors(r.data);
      if (r.data[0]) setSensorId(r.data[0].id);
    }).catch((e) => setError(fmtErr(e)));
  }, []);

  const load = useCallback(() => {
    if (!sensorId) return;
    setError("");
    setRows(null);
    API.get(`/telemetry?sensor_id=${sensorId}&hours=${hours}&limit=500`)
      .then((r) => setRows(r.data)).catch((e) => setError(fmtErr(e)));
  }, [sensorId, hours]);

  useEffect(() => { load(); }, [load]);

  const exportCsv = async () => {
    try {
      const res = await API.get(`/export/telemetry.csv?sensor_id=${sensorId}&hours=${hours}`, { responseType: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(res.data);
      a.download = "aquasentinel_telemetry.csv";
      a.click();
    } catch (e) { toast.error(fmtErr(e)); }
  };

  const lookupLineage = async () => {
    try {
      setLineage(null);
      const { data } = await API.get(`/telemetry/raw/${lineageId.trim()}`);
      setLineage(data.lineage);
    } catch (e) { toast.error(fmtErr(e)); }
  };

  const m = METRICS.find((x) => x.key === metric);
  const chartData = (rows || []).map((r) => ({ ...r, t: fmtTime(r.timestamp) }));

  return (
    <div data-testid="telemetry-explorer-page" className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select data-testid="explorer-sensor-select" value={sensorId} onChange={(e) => setSensorId(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500">
          {sensors.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.site_name}</option>)}
        </select>
        <select data-testid="explorer-hours-select" value={hours} onChange={(e) => setHours(Number(e.target.value))}
          className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500">
          {[1, 2, 6, 12, 24, 72].map((h) => <option key={h} value={h}>Last {h}h</option>)}
        </select>
        <div className="flex gap-1">
          {METRICS.map((mm) => (
            <button key={mm.key} data-testid={`metric-btn-${mm.key}`} onClick={() => setMetric(mm.key)}
              className={`px-2.5 py-1.5 rounded text-[11px] font-mono border transition-colors ${metric === mm.key ? "bg-blue-600 border-blue-600 text-white" : "border-slate-700 text-slate-400 hover:text-white"}`}>
              {mm.label}
            </button>
          ))}
        </div>
        <button data-testid="export-csv-btn" onClick={exportCsv} className="ml-auto inline-flex items-center gap-2 px-3 py-2 rounded border border-slate-700 text-xs text-slate-300 hover:bg-slate-800 transition-colors">
          <Download className="w-3.5 h-3.5" /> CSV Export
        </button>
      </div>

      {error ? <ErrorState message={error} onRetry={load} /> : !rows ? <LoadingState label="Querying time-series store" /> : rows.length === 0 ? <EmptyState message="No telemetry in this window" /> : (
        <>
          <div className="panel p-4">
            <div className="widget-title mb-2">{m.label}</div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="t" tick={{ fill: "#64748b", fontSize: 10, fontFamily: "JetBrains Mono" }} interval="preserveStartEnd" />
                <YAxis tick={{ fill: "#64748b", fontSize: 10, fontFamily: "JetBrains Mono" }} width={50} domain={["auto", "auto"]} />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 6, fontSize: 11, fontFamily: "JetBrains Mono" }} />
                <Line type="monotone" dataKey={metric} stroke={m.color} strokeWidth={1.8} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="panel overflow-x-auto max-h-80 overflow-y-auto">
            <table data-testid="telemetry-table" className="w-full text-xs font-mono">
              <thead className="sticky top-0 bg-slate-900">
                <tr className="text-left border-b border-slate-800">
                  {["Time", "Level", "pH", "NTU", "Temp", "Slope", "Confidence", "QC Flags", "Source", "Correlation ID"].map((h) => (
                    <th key={h} className="widget-title px-3 py-2 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...rows].reverse().slice(0, 100).map((r) => (
                  <tr key={r.id} className="border-b border-slate-800/50 text-slate-300">
                    <td className="px-3 py-1.5 whitespace-nowrap">{fmtTime(r.timestamp)}</td>
                    <td className="px-3 py-1.5">{r.water_level_cm}</td>
                    <td className="px-3 py-1.5">{r.ph_calibrated}</td>
                    <td className="px-3 py-1.5">{r.turbidity_ntu}</td>
                    <td className="px-3 py-1.5">{r.temperature_c}</td>
                    <td className="px-3 py-1.5">{r.water_level_slope}</td>
                    <td className={`px-3 py-1.5 ${r.data_confidence_score < 0.75 ? "text-amber-400" : "text-emerald-500"}`}>{r.data_confidence_score}</td>
                    <td className="px-3 py-1.5 text-amber-400">{r.quality_flags?.join(", ") || "—"}</td>
                    <td className="px-3 py-1.5"><StatusBadge value={r.data_source === "simulation" ? "warning" : "ok"} />{" "}<span className="text-slate-500">{r.data_source}</span></td>
                    <td className="px-3 py-1.5 text-slate-500 cursor-pointer hover:text-blue-400" onClick={() => setLineageId(r.correlation_id)}>{r.correlation_id?.slice(0, 18)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="panel p-4">
        <div className="widget-title mb-2">Data Lineage Lookup (raw → validated → prediction)</div>
        <div className="flex gap-2">
          <input data-testid="lineage-input" value={lineageId} onChange={(e) => setLineageId(e.target.value)} placeholder="correlation_id"
            className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs font-mono focus:outline-none focus:border-blue-500" />
          <button data-testid="lineage-lookup-btn" onClick={lookupLineage} className="inline-flex items-center gap-2 px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-xs text-white transition-colors">
            <Search className="w-3.5 h-3.5" /> Trace
          </button>
        </div>
        {lineage && (
          <pre data-testid="lineage-result" className="mt-3 bg-slate-950 border border-slate-800 rounded p-3 text-[10px] font-mono text-slate-400 overflow-auto max-h-72">{JSON.stringify(lineage, null, 2)}</pre>
        )}
      </div>
    </div>
  );
}
