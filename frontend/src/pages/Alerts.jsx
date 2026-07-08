import { useState, useEffect, useCallback } from "react";
import { API, fmtErr, fmtTime } from "../lib/api";
import { LoadingState, ErrorState, EmptyState, StatusBadge } from "../components/Bits";
import { useLive } from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import { toast } from "sonner";
import { Check, CheckCheck, ChevronDown, ChevronUp } from "lucide-react";

export default function Alerts() {
  const [alerts, setAlerts] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("all");
  const [expanded, setExpanded] = useState(null);
  const [notes, setNotes] = useState("");
  const { subscribe } = useLive();
  const { hasRole } = useAuth();
  const canAct = hasRole("field_engineer");

  const load = useCallback(() => {
    setError("");
    API.get(`/alerts?limit=200${status !== "all" ? `&status=${status}` : ""}`)
      .then((r) => setAlerts(r.data)).catch((e) => setError(fmtErr(e)));
  }, [status]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => subscribe((evt) => {
    if (evt.event === "alert.created") setAlerts((prev) => prev ? [evt.data, ...prev] : prev);
    if (evt.event === "alert.updated") setAlerts((prev) => prev?.map((a) => (a.id === evt.data.id ? evt.data : a)));
  }), [subscribe]);

  const act = async (id, action) => {
    try {
      const { data } = await API.post(`/alerts/${id}/${action}`, { notes: notes || null });
      setAlerts((prev) => prev.map((a) => (a.id === id ? data : a)));
      setNotes("");
      toast.success(`Alert ${action}d`);
    } catch (e) { toast.error(fmtErr(e)); }
  };

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!alerts) return <LoadingState label="Loading alert operations" />;

  return (
    <div data-testid="alerts-page" className="space-y-4">
      <div className="flex items-center gap-2">
        {["all", "open", "acknowledged", "resolved"].map((f) => (
          <button key={f} data-testid={`alert-filter-${f}`} onClick={() => setStatus(f)}
            className={`px-3 py-1.5 rounded text-xs font-mono uppercase tracking-wider border transition-colors ${status === f ? "bg-blue-600 border-blue-600 text-white" : "border-slate-700 text-slate-400 hover:text-white"}`}>
            {f}
          </button>
        ))}
        <span className="ml-auto text-xs font-mono text-slate-500">{alerts.length} alerts · history is immutable (timeline preserved)</span>
      </div>

      {alerts.length === 0 ? <EmptyState message="No alerts in this state" /> : (
        <div className="space-y-2">
          {alerts.map((a) => (
            <div key={a.id} data-testid={`alert-card-${a.alert_id}`} className="panel p-3 rise">
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge value={a.severity} />
                <StatusBadge value={a.status} />
                <span className="font-mono text-xs text-blue-400">{a.alert_id}</span>
                <span className="font-mono text-xs text-slate-500">{a.alert_type}</span>
                <span className="text-xs text-slate-500 ml-auto font-mono">{new Date(a.created_at).toLocaleString()}</span>
                <button data-testid={`alert-expand-${a.alert_id}`} onClick={() => setExpanded(expanded === a.id ? null : a.id)} className="text-slate-400 hover:text-white">
                  {expanded === a.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
              <div className="text-sm text-slate-200 mt-2">{a.message}</div>
              <div className="text-[11px] font-mono text-slate-500 mt-1">{a.sensor_name} · {a.site_name} · source: {a.source}{a.acknowledged_by ? ` · ack by ${a.acknowledged_by}` : ""}</div>

              {expanded === a.id && (
                <div className="mt-3 border-t border-slate-800 pt-3 space-y-3">
                  <div>
                    <div className="widget-title mb-2">Incident Timeline</div>
                    {a.incident_timeline?.map((ev, i) => (
                      <div key={i} className="flex gap-3 text-xs font-mono py-1">
                        <span className="text-slate-500 shrink-0">{fmtTime(ev.timestamp)}</span>
                        <span className="text-blue-400">{ev.event}</span>
                        <span className="text-slate-400">{ev.by || ""} {ev.detail || ""}</span>
                      </div>
                    ))}
                  </div>
                  {canAct && a.status !== "resolved" && (
                    <div className="flex gap-2">
                      <input data-testid="alert-notes-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="operator notes…"
                        className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs focus:outline-none focus:border-blue-500" />
                      {a.status === "open" && (
                        <button data-testid={`alert-ack-btn-${a.alert_id}`} onClick={() => act(a.id, "acknowledge")} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-xs text-white transition-colors">
                          <Check className="w-3.5 h-3.5" /> Acknowledge
                        </button>
                      )}
                      <button data-testid={`alert-resolve-btn-${a.alert_id}`} onClick={() => act(a.id, "resolve")} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-xs text-white transition-colors">
                        <CheckCheck className="w-3.5 h-3.5" /> Resolve
                      </button>
                    </div>
                  )}
                  {!canAct && <div className="text-[11px] text-slate-500">Your role can view alerts but not act on them (requires field_engineer+).</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
