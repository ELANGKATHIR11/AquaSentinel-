import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { API, fmtErr, fmtTime } from "../lib/api";
import { KpiCard, StatusBadge, LoadingState, ErrorState } from "../components/Bits";
import { useLive } from "../components/Layout";

export default function Overview() {
  const [data, setData] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState("");
  const [feed, setFeed] = useState([]);
  const { subscribe } = useLive();

  const load = useCallback(() => {
    setError("");
    Promise.all([API.get("/dashboard/overview"), API.get("/alerts?limit=6")])
      .then(([o, a]) => { setData(o.data); setAlerts(a.data); })
      .catch((e) => setError(fmtErr(e)));
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  useEffect(() => subscribe((evt) => {
    setFeed((f) => [{ ...evt, key: Math.random() }, ...f].slice(0, 30));
  }), [subscribe]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <LoadingState label="Loading executive overview" />;

  const riskAccent = data.max_flood_risk >= 0.75 ? "text-red-500" : data.max_flood_risk >= 0.5 ? "text-amber-500" : "text-emerald-500";

  return (
    <div data-testid="overview-page" className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard testId="kpi-max-flood-risk" label="Max Flood Risk" value={data.max_flood_risk != null ? data.max_flood_risk.toFixed(2) : "—"} sub="prototype ML estimate" accent={riskAccent} />
        <KpiCard testId="kpi-sensors-online" label="Sensors Online" value={`${data.sensors.online}/${data.sensors.total}`} sub={`${data.sensors.offline} offline`} accent={data.sensors.offline > 0 ? "text-amber-500" : "text-emerald-500"} />
        <KpiCard testId="kpi-open-alerts" label="Open Alerts" value={data.alerts.open} sub={`${data.alerts.critical} critical`} accent={data.alerts.critical > 0 ? "text-red-500" : undefined} />
        <KpiCard testId="kpi-gateways" label="Gateways" value={`${data.gateways.online}/${data.gateways.total}`} sub="LoRaWAN + 4G" />
        <KpiCard testId="kpi-telemetry-rate" label="Packets / 15m" value={data.telemetry_rate_15m} sub="validated ingestion" />
        <KpiCard testId="kpi-water-health" label="Avg Water Health" value={data.avg_water_health} sub="explainable score / 100" accent={data.avg_water_health < 60 ? "text-amber-500" : "text-emerald-500"} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="panel p-4 xl:col-span-1">
          <div className="widget-title mb-3">Site Flood Risk</div>
          <div className="space-y-3">
            {data.site_risk.map((s) => (
              <div key={s.site} data-testid={`site-risk-${s.site.replaceAll(" ", "-").toLowerCase()}`}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">{s.site}</span>
                  <span className="font-mono text-slate-400">{s.max_risk.toFixed(2)} · {s.sensors} nodes</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded overflow-hidden">
                  <div className={`h-full transition-all duration-700 ${s.max_risk >= 0.75 ? "bg-red-500" : s.max_risk >= 0.5 ? "bg-amber-500" : "bg-blue-500"}`} style={{ width: `${Math.max(s.max_risk * 100, 3)}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="widget-title mt-6 mb-2">Simulation</div>
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <StatusBadge value={data.simulation.running ? "online" : "offline"} />
            <span>{data.simulation.node_count} nodes · {data.simulation.run_id || "—"}</span>
          </div>
        </div>

        <div className="panel p-4">
          <div className="widget-title mb-3">Recent Alerts</div>
          {alerts.length === 0 ? <div className="text-sm text-slate-500 py-6 text-center">No alerts</div> : (
            <div className="space-y-2">
              {alerts.map((a) => (
                <Link to="/alerts" key={a.id} data-testid={`overview-alert-${a.alert_id}`} className="block border border-slate-800 rounded p-2.5 hover:border-slate-700 hover:bg-slate-900 transition-colors">
                  <div className="flex items-center gap-2">
                    <StatusBadge value={a.severity} />
                    <StatusBadge value={a.status} />
                    <span className="ml-auto text-[10px] font-mono text-slate-500">{fmtTime(a.created_at)}</span>
                  </div>
                  <div className="text-xs text-slate-300 mt-1.5 line-clamp-2">{a.message}</div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="panel p-4 flex flex-col">
          <div className="widget-title mb-3">Live Event Stream</div>
          <div data-testid="live-event-feed" className="flex-1 overflow-y-auto max-h-80 space-y-1.5 font-mono text-[11px]">
            {feed.length === 0 && <div className="text-slate-500 py-6 text-center">Waiting for events…</div>}
            {feed.map((e) => (
              <div key={e.key} className="flex gap-2 border-b border-slate-800/60 pb-1.5 rise">
                <span className="text-slate-500 shrink-0">{fmtTime(e.timestamp)}</span>
                <span className={e.event.startsWith("alert") ? "text-red-400" : e.event.startsWith("prediction") ? "text-amber-400" : "text-blue-400"}>{e.event}</span>
                <span className="text-slate-400 truncate">{e.data.sensor_name || e.data.sensor_id?.slice(0, 8) || ""} {e.data.water_level_cm ? `${e.data.water_level_cm}cm` : ""}{e.data.flood_risk_level || ""}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
