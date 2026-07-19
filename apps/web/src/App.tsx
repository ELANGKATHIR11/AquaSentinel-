/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { useDashboardStore } from './stores/useDashboardStore';
import { api } from './services/api';

// Pages imports
import { OverviewPage } from './features/overview/OverviewPage';
import { LiveMapPage } from './features/map/LiveMapPage';
import { SensorsPage } from './features/sensors/SensorsPage';
import { SensorDetailsPage } from './features/sensors/SensorDetailsPage';
import { AnalyticsPage } from './features/analytics/AnalyticsPage';
import { AlertsPage } from './features/alerts/AlertsPage';
import { ManualInputPage } from './features/manual-input/ManualInputPage';
import { CalibrationPage } from './features/calibration/CalibrationPage';
import { SimulationPage } from './features/simulation/SimulationPage';
import { ReportsPage } from './features/reports/ReportsPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { IotGatewayPage } from './features/iot-gateway/IotGatewayPage';
import { ThingSpeakPage } from './features/thingspeak/ThingSpeakPage';

// Icon imports
import {
  LayoutDashboard,
  Map,
  Cpu,
  BarChart3,
  Bell,
  FileInput,
  Sliders,
  Activity,
  FileText,
  Settings,
  ShieldAlert,
  Clock,
  User,
  Radio,
  Sun,
  Moon,
  Cloud,
} from 'lucide-react';

const SidebarLink: React.FC<{
  to: string;
  icon: React.ComponentType<any>;
  label: string;
  badge?: number;
}> = ({ to, icon: Icon, label, badge }) => {
  const location = useLocation();
  const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));

  return (
    <Link
      id={`nav-link-${label.toLowerCase().replace(/\s+/g, '-')}`}
      to={to}
      className={`flex items-center justify-between px-3 py-2 rounded-lg font-mono text-[11px] font-bold tracking-wider uppercase transition-all border ${
        isActive
          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-sm'
          : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800'
      }`}
    >
      <div className="flex items-center gap-3">
        <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-500'}`} />
        <span>{label}</span>
      </div>
      {badge && badge > 0 ? (
        <span className="bg-rose-500 text-white text-[10px] px-1.5 rounded-full font-sans">
          {badge}
        </span>
      ) : null}
    </Link>
  );
};

const NavigationLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { connectionStatus, mockMode, alerts, theme, toggleTheme } = useDashboardStore();
  const [currentTime, setCurrentTime] = useState<string>('');

  // Synchronize HTML element theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Live clock ticker
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour12: false }) + ' UTC');
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const activeAlertsCount = alerts.filter((a) => a.status === 'active').length;

  return (
    <div className={`min-h-screen flex flex-col ${theme === 'dark' ? 'bg-slate-950 text-slate-200' : 'bg-slate-50 text-slate-900'}`}>
      
      {/* Top operational banner bar */}
      <header className="h-14 border-b border-slate-800 bg-slate-900 px-6 flex items-center justify-between shrink-0 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-emerald-500 rounded flex items-center justify-center shadow-md">
            <Activity className="w-5 h-5 text-slate-950" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-sm font-extrabold tracking-tight text-white font-sans">
              AquaSentinel <span className="text-slate-500 font-medium">Command Dashboard</span>
            </h1>
            <p className="text-[9px] text-slate-400 font-mono tracking-widest uppercase leading-none mt-0.5">
              ESTUARY RISK RADAR & SCENARIO MONITORING
            </p>
          </div>
        </div>

        {/* Diagnostic counters & clocks */}
        <div className="flex items-center gap-6 text-[11px] font-mono">
          
          {/* Connection status badge */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-slate-800 rounded-full border border-slate-700">
            <span className={`w-2 h-2 rounded-full ${
              mockMode ? 'bg-amber-400 animate-pulse' :
              connectionStatus === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400 animate-pulse'
            }`} />
            <span className={`text-[10px] font-mono font-semibold ${
              mockMode ? 'text-amber-400' :
              connectionStatus === 'connected' ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {mockMode ? 'LOCAL SIMULATOR' : `LIVE IOT CONNECTION`}
            </span>
          </div>

          {/* Current Live Time */}
          <div className="hidden md:flex flex-col text-right">
            <p className="text-[10px] uppercase tracking-widest leading-none text-slate-500">Server Time</p>
            <p className="text-sm font-mono text-slate-200">{currentTime}</p>
          </div>

          {/* Light/Dark Mode Switcher */}
          <button
            onClick={toggleTheme}
            className={`p-2 rounded-lg border transition-all cursor-pointer active:scale-95 flex items-center justify-center ${
              theme === 'dark'
                ? 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700'
                : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
            }`}
            title="Toggle Light/Dark Theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
          </button>

          {/* Duty Officer identifier */}
          <div className="flex items-center gap-3 pl-6 border-l border-slate-800">
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-widest leading-none text-slate-500">Operator</p>
              <p className="text-xs font-mono text-slate-300">{mockMode ? 'Demo Mode' : 'Signed Out'}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
              <User className="w-5 h-5 text-slate-400" />
            </div>
          </div>

        </div>
      </header>

      {/* Main app body: Sidebar navigation + center dashboard workspace */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Navigation Sidebar */}
        <aside className="w-56 border-r border-slate-800 bg-slate-900 p-4 hidden md:flex flex-col gap-1.5 shrink-0 justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2 px-3">
              Navigation
            </span>

            <SidebarLink to="/overview" icon={LayoutDashboard} label="Overview" />
            <SidebarLink to="/live-map" icon={Map} label="Live GIS Map" />
            <SidebarLink to="/sensors" icon={Cpu} label="Buoy Registry" />
            <SidebarLink to="/iot-gateway" icon={Radio} label="IoT Gateway" />
            <SidebarLink to="/analytics" icon={BarChart3} label="Analytics Center" />
            <SidebarLink to="/alerts" icon={Bell} label="Alerts Console" badge={activeAlertsCount} />
            
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-4 mb-2 px-3">
              Operations
            </span>

            <SidebarLink to="/manual-input" icon={FileInput} label="Manual Input" />
            <SidebarLink to="/calibration" icon={Sliders} label="Calibration" />
            <SidebarLink to="/simulation" icon={Activity} label="Simulation" />
            <SidebarLink to="/reports" icon={FileText} label="Reports" />
            <SidebarLink to="/thingspeak" icon={Cloud} label="ThingSpeak Live" />
            <SidebarLink to="/settings" icon={Settings} label="System Config" />
          </div>

          <div className="mt-auto pb-2">
            <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700">
              <p className="text-[10px] text-slate-500 mb-1 uppercase font-bold">System Status</p>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-300">
                  {mockMode ? 'Offline Demo' : connectionStatus === 'connected' ? 'API Connected' : 'Connecting...'}
                </span>
                <span className={`text-[10px] px-1.5 rounded ${
                  mockMode ? 'bg-amber-500/20 text-amber-400' :
                  connectionStatus === 'connected' ? 'bg-emerald-500/20 text-emerald-400' :
                  'bg-rose-500/20 text-rose-400'
                }`}>
                  {mockMode ? 'DEMO' : connectionStatus === 'connected' ? 'LIVE' : 'OFFLINE'}
                </span>
              </div>
            </div>
          </div>
        </aside>

        {/* Central Dashboard Workspace */}
        <main className="flex-1 overflow-y-auto p-6 bg-slate-950">
          {children}
        </main>

      </div>
    </div>
  );
};

export default function App() {
  const { mockMode } = useDashboardStore();

  // Establish connection to live REST/WebSocket upon boot
  useEffect(() => {
    api.connectWebSocket();

    if (!mockMode) {
      const loadInitialDbData = async () => {
        try {
          const fetchedSensors = await api.getSensors();
          // Load telemetry history from DB for each sensor
          const historyMap: Record<string, any[]> = {};
          for (const s of fetchedSensors) {
            try {
              const hist = await api.getTelemetry(s.sensor_id);
              historyMap[s.sensor_id] = hist;
            } catch (err) {
              historyMap[s.sensor_id] = [];
            }
          }
          // Fetch alerts too
          const fetchedAlerts = await api.getAlerts();
          
          useDashboardStore.setState({
            sensors: fetchedSensors,
            telemetryHistory: historyMap,
            alerts: fetchedAlerts
          });
        } catch (error) {
          console.error("Error loading startup DB records:", error);
        }
      };
      loadInitialDbData();
    }

    return () => {
      api.disconnectWebSocket();
    };
  }, [mockMode]);

  return (
    <BrowserRouter>
      <NavigationLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<OverviewPage />} />
          <Route path="/live-map" element={<LiveMapPage />} />
          <Route path="/sensors" element={<SensorsPage />} />
          <Route path="/sensor/:sensorId" element={<SensorDetailsPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/iot-gateway" element={<IotGatewayPage />} />
          <Route path="/manual-input" element={<ManualInputPage />} />
          <Route path="/calibration" element={<CalibrationPage />} />
          <Route path="/simulation" element={<SimulationPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/thingspeak" element={<ThingSpeakPage />} />
          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Routes>
      </NavigationLayout>
    </BrowserRouter>
  );
}
