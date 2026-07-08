import { useState, useEffect, createContext, useContext, useCallback, useRef } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLiveEvents } from "../lib/ws";
import { API, timeAgo } from "../lib/api";
import { toast } from "sonner";
import {
  LayoutDashboard, Map, Radio, Router, LineChart, Bell, TerminalSquare,
  BrainCircuit, PlayCircle, ScrollText, Users, LogOut, ChevronsLeft, ChevronsRight, Waves, BellDot,
} from "lucide-react";

const NAV = [
  { to: "/overview", label: "Overview", icon: LayoutDashboard },
  { to: "/live-map", label: "Live Map", icon: Map },
  { to: "/sensors", label: "Sensors", icon: Radio },
  { to: "/gateways", label: "Gateways", icon: Router },
  { to: "/telemetry-explorer", label: "Telemetry Explorer", icon: LineChart },
  { to: "/alerts", label: "Alerts", icon: Bell },
  { to: "/device-commands", label: "Device Commands", icon: TerminalSquare },
  { to: "/ml-operations", label: "ML Operations", icon: BrainCircuit },
  { to: "/simulation", label: "Simulation", icon: PlayCircle },
  { to: "/audit-logs", label: "Audit Logs", icon: ScrollText, minRole: "operations_manager" },
  { to: "/admin", label: "Admin", icon: Users, minRole: "organization_admin" },
];

const LiveContext = createContext({ lastEvent: null, connected: false, subscribe: () => () => {} });
export const useLive = () => useContext(LiveContext);

export default function Layout({ children }) {
  const { user, logout, hasRole } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);
  const [unread, setUnread] = useState(0);
  const subsRef = useRef(new Set());
  const location = useLocation();
  const navigate = useNavigate();

  const onEvent = useCallback((evt) => {
    setLastEvent(evt);
    subsRef.current.forEach((fn) => fn(evt));
    if (evt.event === "alert.created") {
      setUnread((u) => u + 1);
      toast.error(`${evt.data.severity?.toUpperCase()}: ${evt.data.message}`, { duration: 6000 });
    }
  }, []);
  const connected = useLiveEvents(onEvent);

  const subscribe = useCallback((fn) => {
    subsRef.current.add(fn);
    return () => subsRef.current.delete(fn);
  }, []);

  useEffect(() => {
    API.get("/notifications").then((r) => setUnread(r.data.filter((n) => !n.read).length)).catch(() => {});
  }, []);

  const pageTitle = NAV.find((n) => location.pathname.startsWith(n.to))?.label || "AquaSentinel";

  return (
    <LiveContext.Provider value={{ lastEvent, connected, subscribe }}>
      <div className="flex h-screen overflow-hidden bg-slate-950">
        <aside data-testid="sidebar" className={`${collapsed ? "w-14" : "w-56"} shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-200`}>
          <div className="flex items-center gap-2 px-3 h-14 border-b border-slate-800">
            <Waves className="w-6 h-6 text-blue-500 shrink-0" />
            {!collapsed && <span className="font-heading font-black tracking-tight text-lg">AQUA<span className="text-blue-500">SENTINEL</span></span>}
          </div>
          <nav className="flex-1 overflow-y-auto py-2">
            {NAV.filter((n) => !n.minRole || hasRole(n.minRole)).map((n) => (
              <NavLink key={n.to} to={n.to} data-testid={`sidebar-nav-${n.to.slice(1)}`}
                className={({ isActive }) => `flex items-center gap-3 px-4 py-2.5 text-sm border-l-2 transition-colors ${isActive ? "border-blue-500 bg-blue-500/10 text-blue-400" : "border-transparent text-slate-400 hover:text-white hover:bg-slate-800"}`}>
                <n.icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span>{n.label}</span>}
              </NavLink>
            ))}
          </nav>
          <button data-testid="sidebar-collapse-btn" onClick={() => setCollapsed(!collapsed)} className="h-10 border-t border-slate-800 flex items-center justify-center text-slate-500 hover:text-white transition-colors">
            {collapsed ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
          </button>
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 shrink-0 border-b border-slate-800 bg-slate-900/60 flex items-center px-5 gap-4">
            <h1 data-testid="page-title" className="font-heading font-bold tracking-tight text-lg">{pageTitle}</h1>
            <div className="ml-auto flex items-center gap-4">
              <div data-testid="live-indicator" className="flex items-center gap-2 text-xs font-mono">
                <span className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-500 live-dot" : "bg-red-500"}`} />
                <span className={connected ? "text-emerald-500" : "text-red-400"}>{connected ? "LIVE" : "RECONNECTING"}</span>
              </div>
              <button data-testid="notifications-btn" onClick={() => { navigate("/alerts"); setUnread(0); API.post("/notifications/mark-read").catch(() => {}); }} className="relative text-slate-400 hover:text-white transition-colors">
                <BellDot className="w-5 h-5" />
                {unread > 0 && <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-mono rounded-full px-1 min-w-[16px] text-center">{unread}</span>}
              </button>
              <div className="text-right">
                <div className="text-xs text-slate-300">{user?.name}</div>
                <div className="text-[10px] font-mono text-blue-400 uppercase">{user?.role}</div>
              </div>
              <button data-testid="logout-btn" onClick={logout} className="text-slate-400 hover:text-red-400 transition-colors"><LogOut className="w-4 h-4" /></button>
            </div>
          </header>
          <main className="flex-1 overflow-y-auto p-5">{children}</main>
        </div>
      </div>
    </LiveContext.Provider>
  );
}
