import { useState, useEffect, useCallback } from "react";
import { API, fmtErr, fmtTime } from "../lib/api";
import { LoadingState, ErrorState, EmptyState, StatusBadge, DeniedState } from "../components/Bits";
import { useLive } from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import { toast } from "sonner";
import { Send } from "lucide-react";

const COMMANDS = ["change_sampling_interval", "change_transmission_interval", "request_immediate_reading", "restart_device",
  "enable_debug_mode", "disable_debug_mode", "update_calibration_profile", "enable_camera_activity", "disable_camera_activity", "request_device_diagnostics"];

export default function DeviceCommands() {
  const [sensors, setSensors] = useState([]);
  const [commands, setCommands] = useState(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ sensor_id: "", command_type: "request_device_diagnostics", interval: 60 });
  const [busy, setBusy] = useState(false);
  const { subscribe } = useLive();
  const { hasRole } = useAuth();
  const canIssue = hasRole("field_engineer");

  const load = useCallback(() => {
    setError("");
    Promise.all([API.get("/sensors"), API.get("/commands")])
      .then(([s, c]) => {
        setSensors(s.data);
        setCommands(c.data);
        setForm((f) => ({ ...f, sensor_id: f.sensor_id || s.data[0]?.id || "" }));
      }).catch((e) => setError(fmtErr(e)));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => subscribe((evt) => {
    if (evt.event === "command.sent") setCommands((prev) => prev && !prev.find((c) => c.id === evt.data.id) ? [evt.data, ...prev] : prev);
    if (evt.event === "command.acknowledged") {
      setCommands((prev) => prev?.map((c) => (c.id === evt.data.command_id ? { ...c, status: "acknowledged", response_payload: evt.data.response_payload, acknowledged_at: evt.timestamp } : c)));
      toast.success(`Command acknowledged: ${evt.data.command_type}`);
    }
  }), [subscribe]);

  const issue = async () => {
    setBusy(true);
    try {
      const params = form.command_type.includes("interval") ? { interval_seconds: Number(form.interval) } : {};
      const { data } = await API.post("/commands", { sensor_id: form.sensor_id, command_type: form.command_type, params });
      setCommands((prev) => [data, ...(prev || []).filter((c) => c.id !== data.id)]);
      toast.info(`Command ${data.command_id} sent`);
    } catch (e) { toast.error(fmtErr(e)); } finally { setBusy(false); }
  };

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!commands) return <LoadingState label="Loading command console" />;

  return (
    <div data-testid="device-commands-page" className="space-y-4">
      {canIssue ? (
        <div className="panel p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="widget-title block mb-1.5">Target Device</label>
            <select data-testid="command-sensor-select" value={form.sensor_id} onChange={(e) => setForm({ ...form, sensor_id: e.target.value })}
              className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500">
              {sensors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="widget-title block mb-1.5">Command</label>
            <select data-testid="command-type-select" value={form.command_type} onChange={(e) => setForm({ ...form, command_type: e.target.value })}
              className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500">
              {COMMANDS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {form.command_type.includes("interval") && (
            <div>
              <label className="widget-title block mb-1.5">Interval (s)</label>
              <input data-testid="command-interval-input" type="number" min="5" value={form.interval} onChange={(e) => setForm({ ...form, interval: e.target.value })}
                className="w-24 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500" />
            </div>
          )}
          <button data-testid="command-send-btn" onClick={issue} disabled={busy || !form.sensor_id}
            className="inline-flex items-center gap-2 px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm text-white transition-colors">
            <Send className="w-3.5 h-3.5" /> Issue Command
          </button>
        </div>
      ) : <div className="panel p-3 text-xs text-slate-500">Issuing commands requires field_engineer role or higher.</div>}

      {commands.length === 0 ? <EmptyState message="No commands issued yet" /> : (
        <div className="panel overflow-x-auto">
          <table data-testid="commands-table" className="w-full text-xs font-mono">
            <thead>
              <tr className="text-left border-b border-slate-800">
                {["Command ID", "Device", "Type", "Issued By", "Issued At", "Status", "Response"].map((h) => <th key={h} className="widget-title px-3 py-2.5">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {commands.map((c) => (
                <tr key={c.id} data-testid={`command-row-${c.command_id}`} className="border-b border-slate-800/50 text-slate-300">
                  <td className="px-3 py-2 text-blue-400">{c.command_id}</td>
                  <td className="px-3 py-2">{c.sensor_name}</td>
                  <td className="px-3 py-2">{c.command_type}</td>
                  <td className="px-3 py-2 text-slate-500">{c.issued_by}</td>
                  <td className="px-3 py-2 text-slate-500">{fmtTime(c.issued_at)}</td>
                  <td className="px-3 py-2"><StatusBadge value={c.status} /></td>
                  <td className="px-3 py-2 text-slate-500 max-w-[280px] truncate">{c.response_payload ? JSON.stringify(c.response_payload) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
