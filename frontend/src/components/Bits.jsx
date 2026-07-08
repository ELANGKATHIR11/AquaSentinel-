import { AlertTriangle, Loader2, Inbox, ShieldOff, RefreshCw } from "lucide-react";

const STATUS_STYLES = {
  online: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
  healthy: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
  ok: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
  offline: "text-slate-400 bg-slate-800 border-slate-700",
  provisioned: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  retired: "text-slate-500 bg-slate-800/60 border-slate-700",
  critical: "text-red-500 bg-red-500/10 border-red-500/20",
  high: "text-red-400 bg-red-500/10 border-red-500/20",
  warning: "text-amber-500 bg-amber-500/10 border-amber-500/20",
  moderate: "text-amber-500 bg-amber-500/10 border-amber-500/20",
  info: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  low: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
  normal: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
  open: "text-red-400 bg-red-500/10 border-red-500/20",
  acknowledged: "text-amber-500 bg-amber-500/10 border-amber-500/20",
  resolved: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
  sent: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  prototype: "text-amber-500 bg-amber-500/10 border-amber-500/20",
  mock_mode: "text-slate-400 bg-slate-800 border-slate-700",
  idle: "text-amber-500 bg-amber-500/10 border-amber-500/20",
};

export const StatusBadge = ({ value, testId }) => (
  <span data-testid={testId} className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium border uppercase tracking-wider ${STATUS_STYLES[value] || "text-slate-400 bg-slate-800 border-slate-700"}`}>
    {value || "unknown"}
  </span>
);

export const KpiCard = ({ label, value, sub, accent, testId }) => (
  <div data-testid={testId} className="panel p-4 rise">
    <div className="widget-title">{label}</div>
    <div className={`font-heading font-black tracking-tighter text-4xl mt-2 font-mono ${accent || "text-slate-50"}`}>{value ?? "—"}</div>
    {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
  </div>
);

export const LoadingState = ({ label = "Loading" }) => (
  <div data-testid="loading-state" className="flex items-center justify-center gap-3 py-16 text-slate-400">
    <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
    <span className="text-sm font-mono">{label}…</span>
  </div>
);

export const ErrorState = ({ message, onRetry }) => (
  <div data-testid="error-state" className="panel flex flex-col items-center gap-3 py-14 text-center">
    <AlertTriangle className="w-7 h-7 text-red-500" />
    <div className="text-sm text-slate-300 max-w-md">{message || "Failed to load data"}</div>
    {onRetry && (
      <button data-testid="retry-button" onClick={onRetry} className="inline-flex items-center gap-2 px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-sm text-white transition-colors">
        <RefreshCw className="w-3.5 h-3.5" /> Retry
      </button>
    )}
  </div>
);

export const EmptyState = ({ message = "No data available" }) => (
  <div data-testid="empty-state" className="flex flex-col items-center gap-2 py-14 text-slate-500">
    <Inbox className="w-7 h-7" />
    <span className="text-sm">{message}</span>
  </div>
);

export const DeniedState = () => (
  <div data-testid="permission-denied-state" className="panel flex flex-col items-center gap-2 py-16 text-slate-400">
    <ShieldOff className="w-7 h-7 text-amber-500" />
    <span className="text-sm">Your role does not have permission to view this module.</span>
  </div>
);

export const riskColor = (level) =>
  ({ critical: "#ef4444", high: "#f87171", moderate: "#f59e0b", low: "#10b981" }[level] || "#64748b");
