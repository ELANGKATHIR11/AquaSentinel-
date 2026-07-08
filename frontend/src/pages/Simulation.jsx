import { useState, useEffect, useCallback } from "react";
import { API, fmtErr } from "../lib/api";
import { LoadingState, ErrorState, StatusBadge, KpiCard } from "../components/Bits";
import { useAuth } from "../context/AuthContext";
import { toast } from "sonner";
import { Play, Square } from "lucide-react";

export default function Simulation() {
  const [status, setStatus] = useState(null);
  const [system, setSystem] = useState(null);
  const [error, setError] = useState("");
  const [nodeCount, setNodeCount] = useState(12);
  const [busy, setBusy] = useState(false);
  const { hasRole } = useAuth();
  const canControl = hasRole("operations_manager");

  const load = useCallback(() => {
    setError("");
    Promise.all([API.get("/simulation/status"), API.get("/health/system")])
      .then(([s, h]) => { setStatus(s.data); setSystem(h.data); })
      .catch((e) => setError(fmtErr(e)));
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]);

  const start = async () => {
    setBusy(true);
    try {
      const { data } = await API.post("/simulation/start", { node_count: Number(nodeCount) });
      toast.success(`Simulation ${data.status} · ${data.node_count ?? ""} nodes`);
      load();
    } catch (e) { toast.error(fmtErr(e)); } finally { setBusy(false); }
  };

  const stop = async () => {
    setBusy(true);
    try {
      await API.post("/simulation/stop");
      toast.info("Simulation stopped");
      load();
    } catch (e) { toast.error(fmtErr(e)); } finally { setBusy(false); }
  };

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!status) return <LoadingState label="Loading simulation control" />;

  return (
    <div data-testid="simulation-page" className="space-y-4">
      <div className="panel p-4">
        <div className="widget-title mb-3">Simulation Control</div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2">
            <StatusBadge value={status.running ? "online" : "offline"} testId="sim-status-badge" />
            <span className="font-mono text-xs text-slate-400">{status.run_id || "not running"} · {status.node_count} nodes · tick {status.interval_seconds}s</span>
          </div>
          {canControl && (
            <div className="ml-auto flex items-end gap-3">
              <div>
                <label className="widget-title block mb-1.5">Node Count (1–120)</label>
                <input data-testid="sim-node-count-input" type="number" min="1" max="120" value={nodeCount} onChange={(e) => setNodeCount(e.target.value)}
                  className="w-28 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500" />
              </div>
              <button data-testid="sim-start-btn" onClick={start} disabled={busy || status.running}
                className="inline-flex items-center gap-2 px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-sm text-white transition-colors">
                <Play className="w-3.5 h-3.5" /> Start
              </button>
              <button data-testid="sim-stop-btn" onClick={stop} disabled={busy || !status.running}
                className="inline-flex items-center gap-2 px-4 py-2 rounded bg-red-600 hover:bg-red-500 disabled:opacity-40 text-sm text-white transition-colors">
                <Square className="w-3.5 h-3.5" /> Stop
              </button>
            </div>
          )}
        </div>
        {!canControl && <div className="text-[11px] text-slate-500 mt-2">Simulation control requires operations_manager role or higher.</div>}
        <p className="text-[11px] text-slate-500 mt-3 border-t border-slate-800 pt-2">Simulated telemetry runs through the exact same ingestion, QC, ML and alert pipeline as real IoT data and is always labeled <span className="font-mono text-amber-400">data_source=simulation</span>. Scaling above the seeded fleet auto-provisions extra simulated nodes.</p>
      </div>

      {system && (
        <div className="panel p-4">
          <div className="widget-title mb-3">System Status</div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {[["API", system.api.status], ["Database", system.database.status], ["MQTT Broker", system.mqtt_broker.status],
              ["Ingestion", system.ingestion.status], ["ML Inference", system.ml_inference.status], ["WebSocket", system.websocket.status]].map(([label, st]) => (
              <div key={label} data-testid={`system-status-${label.toLowerCase().replace(" ", "-")}`} className="border border-slate-800 rounded p-3">
                <div className="widget-title mb-2">{label}</div>
                <StatusBadge value={st} />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <KpiCard label="Packets / 5m" value={system.ingestion.telemetry_5m} />
            <KpiCard label="WS Clients" value={system.websocket.clients} />
            <KpiCard label="Models Loaded" value={system.ml_inference.models_loaded} />
            <KpiCard label="Gateways" value={system.gateways?.length} />
          </div>
          <div className="text-[11px] font-mono text-slate-500 mt-3">{system.mqtt_broker.note}</div>
        </div>
      )}
    </div>
  );
}
