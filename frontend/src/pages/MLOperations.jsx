import { useState, useEffect, useCallback } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { API, fmtErr } from "../lib/api";
import { LoadingState, ErrorState, StatusBadge, KpiCard, riskColor } from "../components/Bits";
import { BrainCircuit, AlertTriangle } from "lucide-react";

export default function MLOperations() {
  const [models, setModels] = useState(null);
  const [perf, setPerf] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    Promise.all([API.get("/ml/models"), API.get("/ml/performance")])
      .then(([m, p]) => { setModels(m.data); setPerf(p.data); })
      .catch((e) => setError(fmtErr(e)));
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!models || !perf) return <LoadingState label="Loading model registry" />;

  return (
    <div data-testid="ml-operations-page" className="space-y-4">
      <div className="panel p-3 flex items-center gap-3 border-amber-500/30">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
        <p className="text-xs text-slate-400">All models are in <span className="text-amber-400 font-mono">prototype</span> state — trained on synthetic seed data. Outputs are <span className="text-slate-200">Flood Risk Estimation</span> and <span className="text-slate-200">Pollution Anomaly Detection</span>, never guaranteed predictions or confirmed pollution. Automatic retraining on unreviewed live telemetry is disabled by design.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard testId="ml-kpi-predictions" label="Predictions 24h" value={perf.predictions_24h} sub="inference runs" />
        <KpiCard testId="ml-kpi-telemetry" label="Telemetry 24h" value={perf.telemetry_24h} sub="validated packets" />
        <KpiCard testId="ml-kpi-anomalies" label="Pollution Flags 24h" value={perf.pollution_anomalies_24h} sub="isolation forest" accent={perf.pollution_anomalies_24h > 0 ? "text-amber-500" : undefined} />
        <KpiCard testId="ml-kpi-qc" label="QC Flagged 24h" value={perf.qc_flagged_24h} sub="range violations" />
        <KpiCard testId="ml-kpi-quality" label="Data Quality" value={perf.data_quality_rate != null ? `${(perf.data_quality_rate * 100).toFixed(1)}%` : "—"} sub="clean packet rate" accent="text-emerald-500" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="panel p-4">
          <div className="widget-title mb-2">Risk Distribution (24h)</div>
          {perf.risk_distribution.length === 0 ? <div className="text-xs text-slate-500 py-10 text-center">No predictions yet</div> : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={perf.risk_distribution} dataKey="count" nameKey="level" innerRadius={55} outerRadius={85} paddingAngle={3}>
                  {perf.risk_distribution.map((d) => <Cell key={d.level} fill={riskColor(d.level)} stroke="none" />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 6, fontSize: 11, fontFamily: "JetBrains Mono" }} />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="flex flex-wrap gap-3 justify-center">
            {perf.risk_distribution.map((d) => (
              <span key={d.level} className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: riskColor(d.level) }} />{d.level}: {d.count}
              </span>
            ))}
          </div>
        </div>

        <div className="xl:col-span-2 space-y-3">
          {models.map((m) => (
            <div key={m.id} data-testid={`model-card-${m.model_name}`} className="panel p-4">
              <div className="flex items-center gap-2 flex-wrap">
                <BrainCircuit className="w-4 h-4 text-blue-500" />
                <span className="font-mono text-sm text-blue-400">{m.model_name}</span>
                <span className="font-mono text-xs text-slate-500">v{m.model_version} · {m.algorithm}</span>
                <span className="ml-auto"><StatusBadge value={m.state} /></span>
                <StatusBadge value={m.approved ? "ok" : "warning"} />
              </div>
              <div className="text-sm text-slate-300 mt-1.5">{m.task}</div>
              <div className="text-[11px] text-amber-400/80 font-mono mt-1">{m.confidence_label}</div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-[11px] font-mono text-slate-400">
                <span>features: {m.features.join(", ")}</span>
                {Object.entries(m.metrics).map(([k, v]) => <span key={k}>{k}: <span className="text-slate-200">{v}</span></span>)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1.5">Approval: {m.approval_note}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
