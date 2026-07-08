import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { API, fmtErr, timeAgo, fmtTime } from "../lib/api";
import { LoadingState, ErrorState, StatusBadge, KpiCard } from "../components/Bits";
import { useLive } from "../components/Layout";
import { ArrowLeft, BatteryCharging, Signal, Cpu } from "lucide-react";

const chartTooltip = { contentStyle: { background: "#0f172a", border: "1px solid #1e293b", borderRadius: 6, fontSize: 11, fontFamily: "JetBrains Mono" } };

function Chart({ data, dataKey, color, label, unit }) {
  return (
    <div className="panel p-4">
      <div className="widget-title mb-2">{label}</div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data}>
          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
          <XAxis dataKey="t" tick={{ fill: "#64748b", fontSize: 10, fontFamily: "JetBrains Mono" }} interval="preserveStartEnd" />
          <YAxis tick={{ fill: "#64748b", fontSize: 10, fontFamily: "JetBrains Mono" }} width={44} domain={["auto", "auto"]} unit={unit} />
          <Tooltip {...chartTooltip} />
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.8} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function SensorDetail() {
  const { sensorId } = useParams();
  const [sensor, setSensor] = useState(null);
  const [series, setSeries] = useState([]);
  const [prediction, setPrediction] = useState(null);
  const [error, setError] = useState("");
  const { subscribe } = useLive();

  const load = useCallback(() => {
    setError("");
    Promise.all([
      API.get(`/sensors/${sensorId}`),
      API.get(`/telemetry?sensor_id=${sensorId}&hours=2&limit=200`),
      API.get(`/predictions?sensor_id=${sensorId}&hours=2&limit=1`),
    ]).then(([s, t, p]) => {
      setSensor(s.data);
      setSeries(t.data.map((r) => ({ ...r, t: fmtTime(r.timestamp) })));
      setPrediction(p.data[p.data.length - 1] || null);
    }).catch((e) => setError(fmtErr(e)));
  }, [sensorId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => subscribe((evt) => {
    if (evt.data.sensor_id !== sensorId) return;
    if (evt.event === "telemetry.created") {
      setSeries((prev) => [...prev.slice(-199), { ...evt.data, t: fmtTime(evt.data.timestamp) }]);
      setSensor((s) => s ? { ...s, last_seen: evt.timestamp, device_status: "online", battery_percent: evt.data.battery_percent ?? s.battery_percent } : s);
    }
    if (evt.event === "prediction.created") setPrediction((p) => ({ ...p, ...evt.data }));
  }), [subscribe, sensorId]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!sensor) return <LoadingState label="Loading digital twin" />;

  return (
    <div data-testid="sensor-detail-page" className="space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/sensors" data-testid="back-to-sensors" className="text-slate-400 hover:text-white"><ArrowLeft className="w-4 h-4" /></Link>
        <h2 className="font-heading font-black text-2xl tracking-tight">{sensor.name}</h2>
        <StatusBadge value={sensor.device_status} testId="sensor-status-badge" />
        <span className="text-xs font-mono text-slate-500">{sensor.site_name} · fw {sensor.firmware_version} · {sensor.hardware_revision} · seen {timeAgo(sensor.last_seen)}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
        <KpiCard testId="twin-flood-risk" label="Flood Risk" value={prediction?.flood_risk_score?.toFixed(2) ?? "—"} sub={prediction?.flood_risk_level || "no prediction"} accent={prediction?.flood_risk_score >= 0.5 ? "text-red-500" : "text-emerald-500"} />
        <KpiCard testId="twin-health" label="Water Health" value={prediction?.water_health_score ?? "—"} sub="/ 100 explainable" />
        <KpiCard testId="twin-forecast" label="Forecast +60m" value={prediction?.water_level_forecast_60m ? `${prediction.water_level_forecast_60m}` : "—"} sub="cm, prototype GBR" />
        <KpiCard testId="twin-pollution" label="Pollution" value={prediction?.pollution_anomaly_level ?? "—"} sub={`score ${prediction?.pollution_anomaly_score?.toFixed(2) ?? "—"}`} accent={prediction?.pollution_anomaly_level === "high" ? "text-amber-500" : undefined} />
        <KpiCard testId="twin-battery" label="Battery" value={sensor.battery_percent != null ? `${Math.round(sensor.battery_percent)}%` : "—"} sub={`${sensor.battery_voltage ?? "—"} V · solar`} />
        <KpiCard testId="twin-signal" label="Signal" value={sensor.rssi ?? "—"} sub={`RSSI dBm · SNR ${sensor.snr ?? "—"}`} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <Chart data={series} dataKey="water_level_cm" color="#3b82f6" label="Water Level (cm)" />
        <Chart data={series} dataKey="ph_calibrated" color="#10b981" label="pH (calibrated)" />
        <Chart data={series} dataKey="turbidity_ntu" color="#f59e0b" label="Turbidity (NTU)" />
        <Chart data={series} dataKey="temperature_c" color="#f87171" label="Water Temp (°C)" />
        <Chart data={series} dataKey="water_level_slope" color="#818cf8" label="Level Slope (cm/reading)" />
        <Chart data={series} dataKey="battery_percent" color="#22d3ee" label="Battery (%)" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="panel p-4">
          <div className="widget-title mb-3">Model Explainability</div>
          {prediction?.feature_contributions ? Object.entries(prediction.feature_contributions).map(([k, v]) => (
            <div key={k} className="mb-2">
              <div className="flex justify-between text-xs mb-1"><span className="font-mono text-slate-300">{k}</span><span className="font-mono text-slate-400">{v}</span></div>
              <div className="h-1 bg-slate-800 rounded"><div className="h-full bg-blue-500 rounded" style={{ width: `${v * 100}%` }} /></div>
            </div>
          )) : <div className="text-xs text-slate-500">No prediction yet</div>}
          <div className="text-[10px] text-slate-500 mt-3 border-t border-slate-800 pt-2">{prediction?.model_confidence || "prototype models — synthetic training data"}</div>
        </div>
        <div className="panel p-4">
          <div className="widget-title mb-3">Device Configuration</div>
          <div className="text-xs font-mono space-y-1.5 text-slate-400">
            <div className="flex justify-between"><span>sensor_id</span><span className="text-slate-200">{sensor.sensor_id}</span></div>
            <div className="flex justify-between"><span>gateway_id</span><span className="text-slate-200">{sensor.gateway_id?.slice(0, 8)}…</span></div>
            <div className="flex justify-between"><span>sampling_interval</span><span className="text-slate-200">{sensor.sampling_interval_seconds}s</span></div>
            <div className="flex justify-between"><span>transmission_interval</span><span className="text-slate-200">{sensor.transmission_interval_seconds}s</span></div>
            <div className="flex justify-between"><span>calibration_profile</span><span className="text-slate-200">{sensor.calibration_profile_version}</span></div>
            <div className="flex justify-between"><span>config_version</span><span className="text-slate-200">{sensor.configuration_version}</span></div>
            <div className="flex justify-between"><span>data_source</span><span className="text-amber-400">{sensor.data_source}</span></div>
            <div className="flex justify-between"><span>gps</span><span className="text-slate-200">{sensor.location?.coordinates?.[1]?.toFixed(4)}, {sensor.location?.coordinates?.[0]?.toFixed(4)}</span></div>
            <div className="flex justify-between"><span>health_score</span><span className="text-slate-200">{sensor.device_health_score ?? "—"}</span></div>
          </div>
        </div>
        <div className="panel overflow-hidden">
          <img src="https://images.unsplash.com/photo-1638734255280-8bae834f8297?crop=entropy&cs=srgb&fm=jpg&q=85&w=800" alt="sensor hardware" className="w-full h-full object-cover min-h-[200px] opacity-80" />
        </div>
      </div>
    </div>
  );
}
