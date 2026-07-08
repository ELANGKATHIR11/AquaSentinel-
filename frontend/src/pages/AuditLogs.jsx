import { useState, useEffect, useCallback } from "react";
import { API, fmtErr } from "../lib/api";
import { LoadingState, ErrorState, EmptyState, DeniedState } from "../components/Bits";
import { useAuth } from "../context/AuthContext";

export default function AuditLogs() {
  const [logs, setLogs] = useState(null);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);
  const [filter, setFilter] = useState("");
  const { hasRole } = useAuth();

  const load = useCallback(() => {
    setError("");
    API.get(`/audit-logs?limit=200${filter ? `&action=${encodeURIComponent(filter)}` : ""}`)
      .then((r) => setLogs(r.data))
      .catch((e) => {
        if (e?.response?.status === 403) setDenied(true);
        else setError(fmtErr(e));
      });
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  if (!hasRole("operations_manager") || denied) return <DeniedState />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!logs) return <LoadingState label="Loading audit trail" />;

  return (
    <div data-testid="audit-logs-page" className="space-y-4">
      <input data-testid="audit-filter-input" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by action (e.g. alert, command, login)…"
        className="w-full max-w-md bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500" />
      {logs.length === 0 ? <EmptyState message="No audit events match" /> : (
        <div className="panel overflow-x-auto">
          <table data-testid="audit-logs-table" className="w-full text-xs font-mono">
            <thead>
              <tr className="text-left border-b border-slate-800">
                {["Timestamp", "Action", "Actor", "Role", "Resource", "Details", "IP"].map((h) => <th key={h} className="widget-title px-3 py-2.5">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-slate-800/50 text-slate-300">
                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{new Date(l.timestamp).toLocaleString()}</td>
                  <td className="px-3 py-2 text-blue-400">{l.action}</td>
                  <td className="px-3 py-2">{l.actor_email}</td>
                  <td className="px-3 py-2 text-slate-500">{l.actor_role}</td>
                  <td className="px-3 py-2 text-slate-500">{l.resource_type || "—"}</td>
                  <td className="px-3 py-2 text-slate-500 max-w-[320px] truncate">{Object.keys(l.details || {}).length ? JSON.stringify(l.details) : "—"}</td>
                  <td className="px-3 py-2 text-slate-500">{l.ip || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
