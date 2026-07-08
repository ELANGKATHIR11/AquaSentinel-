import { useState, useEffect, useCallback } from "react";
import { API, fmtErr, timeAgo } from "../lib/api";
import { LoadingState, ErrorState, EmptyState, StatusBadge } from "../components/Bits";
import { Router, HardDrive, Timer, RotateCcw } from "lucide-react";

export default function Gateways() {
  const [gateways, setGateways] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    API.get("/gateways").then((r) => setGateways(r.data)).catch((e) => setError(fmtErr(e)));
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!gateways) return <LoadingState label="Loading gateway fleet" />;
  if (gateways.length === 0) return <EmptyState message="No gateways registered" />;

  return (
    <div data-testid="gateways-page" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {gateways.map((g) => (
        <div key={g.id} data-testid={`gateway-card-${g.gateway_id}`} className="panel p-4 rise">
          <div className="flex items-center gap-2 mb-3">
            <Router className="w-4 h-4 text-blue-500" />
            <span className="font-mono text-sm text-blue-400">{g.gateway_id}</span>
            <span className="ml-auto"><StatusBadge value={g.gateway_status} /></span>
          </div>
          <div className="text-sm text-slate-300 mb-3">{g.name}</div>
          <div className="grid grid-cols-2 gap-y-2 text-xs font-mono text-slate-400">
            <div>Network</div><div className="text-slate-200 text-right">{g.network_type}</div>
            <div>Firmware</div><div className="text-slate-200 text-right">{g.firmware_version}</div>
            <div>Sensors</div><div className="text-slate-200 text-right">{g.sensor_count}</div>
            <div>Local queue</div><div className="text-slate-200 text-right">{g.queue_depth} pkts</div>
            <div>Storage used</div><div className="text-slate-200 text-right">{g.local_storage_usage_percent}%</div>
            <div>Uptime</div><div className="text-slate-200 text-right">{Math.floor(g.uptime_seconds / 86400)}d {Math.floor((g.uptime_seconds % 86400) / 3600)}h</div>
            <div>Restarts</div><div className="text-slate-200 text-right">{g.restart_count}</div>
            <div>Watchdog</div><div className="text-slate-200 text-right">{g.watchdog_events}</div>
            <div>Last seen</div><div className="text-slate-200 text-right">{timeAgo(g.last_seen)}</div>
          </div>
          <div className="mt-3 h-1.5 bg-slate-800 rounded overflow-hidden">
            <div className="h-full bg-blue-500" style={{ width: `${g.local_storage_usage_percent}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
