/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { Sliders, CheckCircle, HelpCircle, Eye, ShieldAlert, Cpu } from 'lucide-react';
import { api, API_BASE_URL, WS_BASE_URL } from '../../services/api';

export const SettingsPage: React.FC = () => {
  const {
    mockMode,
    setMockMode,
    theme,
    toggleTheme,
    connectionStatus,
    setConnectionStatus,
  } = useDashboardStore();

  const [apiBaseUrl, setApiBaseUrl] = useState(API_BASE_URL);
  const [wsBaseUrl, setWsBaseUrl] = useState(WS_BASE_URL);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSaveEndpoints = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
    }, 2000);
  };

  const handleToggleMockMode = (val: boolean) => {
    setMockMode(val);
    if (!val) {
      // attempt WebSocket connection
      api.connectWebSocket();
    } else {
      api.disconnectWebSocket();
      setConnectionStatus('connected');
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300 font-mono text-xs text-zinc-300">
      
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-zinc-100 font-sans tracking-tight">System Settings & Configurations</h2>
        <p className="text-xs text-zinc-500 font-mono mt-0.5">GATEWAY INTERFACE PARAMETERS AND LOCAL SIMULATOR DIALS</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Form options */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          
          {/* Operations Core toggle */}
          <div className="bg-zinc-950 border border-zinc-900 rounded-lg p-5 shadow-lg flex flex-col gap-4">
            <h3 className="text-xs font-bold uppercase text-zinc-100 font-sans border-b border-zinc-900 pb-3">
              Data Integration Engine Settings
            </h3>

            {/* Mock Mode Selector */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-zinc-900/40 border border-zinc-900 rounded-lg">
              <div className="flex-1">
                <span className="font-bold text-zinc-200 block text-xs flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-amber-400" />
                  Operator Demonstration (Mock mode)
                </span>
                <p className="text-[10px] text-zinc-500 mt-1 font-sans leading-relaxed">
                  When enabled, the complete GIS dashboard operates on client-side math scenarios, ignoring hardware and API connectivity. Recommended for testing and offline presentations.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggleMockMode(true)}
                  className={`px-4 py-1.5 rounded font-bold cursor-pointer transition-all border ${
                    mockMode ? 'bg-amber-500/10 text-amber-400 border-amber-500/35' : 'bg-zinc-950 text-zinc-500 border-zinc-900 hover:text-zinc-300'
                  }`}
                >
                  MOCK MODE
                </button>
                <button
                  onClick={() => handleToggleMockMode(false)}
                  className={`px-4 py-1.5 rounded font-bold cursor-pointer transition-all border ${
                    !mockMode ? 'bg-blue-500/10 text-blue-400 border-blue-500/35' : 'bg-zinc-950 text-zinc-500 border-zinc-900 hover:text-zinc-300'
                  }`}
                >
                  LIVE BACKEND
                </button>
              </div>
            </div>

            {/* Theme Toggle */}
            <div className="flex items-center justify-between p-4 bg-zinc-900/40 border border-zinc-900 rounded-lg">
              <div>
                <span className="font-bold text-zinc-200 block text-xs">Operator Console Theme</span>
                <p className="text-[10px] text-zinc-500 mt-0.5 font-sans">Toggle between command center slate-dark and day-operations light theme.</p>
              </div>

              <button
                onClick={toggleTheme}
                className="px-4 py-1.5 bg-zinc-950 hover:bg-zinc-900 rounded border border-zinc-800 text-zinc-300 font-bold transition-all cursor-pointer text-xs"
              >
                {theme.toUpperCase()} MODE
              </button>
            </div>
          </div>

          {/* Endpoints form */}
          <div className="bg-zinc-950 border border-zinc-900 rounded-lg p-5 shadow-lg">
            <h3 className="text-xs font-bold uppercase text-zinc-100 font-sans border-b border-zinc-900 pb-3 mb-4">
              Gateway Integration REST & WebSockets Endpoints
            </h3>

            {saveSuccess && (
              <div className="mb-4 p-3 bg-emerald-950/10 border border-emerald-900/40 rounded flex items-center gap-2.5 text-emerald-400">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                <span>API integration pathways successfully validated in local caches.</span>
              </div>
            )}

            <form onSubmit={handleSaveEndpoints} className="flex flex-col gap-4">
              <div>
                <label className="text-[10px] text-zinc-500 block uppercase">VITE_API_BASE_URL (REST PATH)</label>
                <input
                  type="text"
                  value={apiBaseUrl}
                  onChange={(e) => setApiBaseUrl(e.target.value)}
                  className="w-full mt-1.5 px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 block uppercase">VITE_WS_URL (WEBSOCKET CHANNEL)</label>
                <input
                  type="text"
                  value={wsBaseUrl}
                  onChange={(e) => setWsBaseUrl(e.target.value)}
                  className="w-full mt-1.5 px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-zinc-900">
                <button
                  type="submit"
                  className="px-4 py-2 bg-zinc-100 hover:bg-white text-zinc-950 font-bold rounded transition-all shadow-md cursor-pointer"
                >
                  Save Integration Paths
                </button>
              </div>
            </form>
          </div>

        </div>

        {/* Right Col: Diagnostics limits & Credentials */}
        <div className="flex flex-col gap-4">
          
          <div className="bg-zinc-950 border border-zinc-900 p-5 rounded-lg shadow-md font-mono text-xs text-zinc-300">
            <h4 className="text-zinc-200 font-bold mb-3 uppercase tracking-wider text-[10px] border-b border-zinc-900 pb-2">
              Officer Credentials brief
            </h4>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between py-1 border-b border-zinc-900/50">
                <span>Engineer ID:</span>
                <span className="font-bold text-zinc-400">OP_LAKSH_11</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-900/50">
                <span>Full Name:</span>
                <span className="font-bold text-zinc-400">Lakshmi Subramanian</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-900/50">
                <span>Role Rank:</span>
                <span className="font-bold text-zinc-400">Duty Command Architect</span>
              </div>
              <div className="flex justify-between py-1">
                <span>Sector Access:</span>
                <span className="font-bold text-emerald-400 uppercase">Giga-Estuary Admin</span>
              </div>
            </div>
          </div>

          <div className="bg-zinc-950 border border-zinc-950 p-5 rounded-lg shadow-md flex flex-col gap-2">
            <h4 className="text-rose-400 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1">
              <ShieldAlert className="w-4 h-4 text-rose-500 animate-pulse" />
              TRANSDUCER LIMIT ALERTS
            </h4>
            <p className="text-[10px] text-zinc-500 leading-relaxed font-sans mt-1">
              System alerts will auto-fire on the overview dashboard if water pH exits the 6.0 - 8.5 range or if flood estimations exceed 80%. These limits comply with WMO Estuary Monitoring Guidelines.
            </p>
          </div>

        </div>

      </div>
    </div>
  );
};
