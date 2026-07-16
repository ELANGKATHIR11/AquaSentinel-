/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { FileText, Download, CheckCircle, Printer, Calendar, Database } from 'lucide-react';

export const ReportsPage: React.FC = () => {
  const { sensors, alerts } = useDashboardStore();
  const [reportType, setReportType] = useState<string>('water_quality');
  const [selectedSensor, setSelectedSensor] = useState<string>('AQ001');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleGenerateReport = () => {
    setSuccessMsg(null);
    setTimeout(() => {
      setSuccessMsg(`Operational brief successfully compiled in local sandbox. Downloading print-ready dataset.`);
      // Mock download file trigger
      const content = `AquaSentinel Operational Report Brief\nCompiled: ${new Date().toLocaleString()}\nReport Type: ${reportType.toUpperCase()}\nTarget Node: ${selectedSensor}\nStatus: Active\n\nNotes: Water conditions checked. All telemetry parameters within nominal ranges except flagged anomalies.`;
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `aquasentinel_${reportType}_brief_${selectedSensor}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }, 800);
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300 font-mono text-xs text-zinc-300">
      
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-zinc-100 font-sans tracking-tight">Analytical Reports Briefing</h2>
        <p className="text-xs text-zinc-500 font-mono mt-0.5">COMPILING PRINT-READY ENVIRONMENTAL MEMORANDUMS AND DISASTER RECORDS</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Form options */}
        <div className="lg:col-span-2 bg-zinc-950 border border-zinc-900 rounded-lg p-5 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 border-b border-zinc-900 pb-3 mb-5">
              <FileText className="w-4 h-4 text-zinc-400" />
              <h3 className="text-xs font-bold uppercase text-zinc-100 font-sans">Report Parameters Configuration</h3>
            </div>

            {successMsg && (
              <div className="mb-4 p-3 bg-emerald-950/10 border border-emerald-900/40 rounded flex items-center gap-2.5 text-emerald-400">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] text-zinc-500 block uppercase">Briefing Category</label>
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                  className="w-full mt-1.5 px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-300 focus:outline-none"
                >
                  <option value="water_quality">Water Health & pH Quality Index Summary</option>
                  <option value="flood_assessment">Flood-risk and Spillway Velocity Assessment</option>
                  <option value="rf_diagnostics">Node Telecommunication Link & Diagnostic Audit</option>
                  <option value="operations_overview">Operations Centre General Executive Briefing</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 block uppercase">Buoy Node Target Scope</label>
                <select
                  value={selectedSensor}
                  onChange={(e) => setSelectedSensor(e.target.value)}
                  className="w-full mt-1.5 px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-300 focus:outline-none"
                >
                  <option value="all">Global Scope (All Active Estuary Sensors)</option>
                  {sensors.map(s => <option key={s.sensor_id} value={s.sensor_id}>{s.sensor_id}: {s.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 block uppercase">Time scale window</label>
                <select className="w-full mt-1.5 px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-300 focus:outline-none">
                  <option>Previous 24 Hours</option>
                  <option>Previous 7 Days</option>
                  <option>Previous 30 Days (Extended)</option>
                  <option>Current monsoon cycle (Custom Range)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 block uppercase">Briefing format</label>
                <select className="w-full mt-1.5 px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-300 focus:outline-none">
                  <option>Print-Ready Plaintext Memorandum (WMO Standard)</option>
                  <option>Delimited CSV Matrix (Time-Series)</option>
                  <option>Raw JSON Telemetry Dump</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-zinc-900">
              <button
                onClick={handleGenerateReport}
                className="px-4 py-2 bg-zinc-100 hover:bg-white text-zinc-950 font-bold rounded transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                Compile print-ready Briefing
              </button>
            </div>
          </div>
        </div>

        {/* Right Col: Print Preview sandbox layout */}
        <div className="bg-zinc-950 border border-zinc-900 p-5 rounded-lg shadow-md flex flex-col font-mono text-[10px] text-zinc-500">
          <h4 className="text-zinc-300 font-bold uppercase tracking-wider text-[10px] mb-3">Live brief Compiler Preview</h4>
          
          <div className="flex-1 bg-zinc-900/40 border border-zinc-900 rounded p-4 flex flex-col gap-2 min-h-[220px]">
            <span className="text-zinc-400 font-bold text-center border-b border-zinc-900 pb-1">AQUASENTINEL COMMISSION SUMMARY BRIEF</span>
            <span>Date: {new Date().toLocaleDateString()}</span>
            <span>Estuary Sector: CHENNAI BASIN GATEWAY</span>
            <span>Active alerts under audit: {alerts.filter(a => a.status === 'active').length} incidents</span>
            <span>Quality control state: <b className="text-emerald-400 font-bold uppercase">Pass</b></span>
            <p className="mt-3 leading-relaxed border-t border-dashed border-zinc-900 pt-3">
              This digital briefing certifies that environmental sensors registered under Chennai Estuary systems have synchronized LoRa payloads within active thresholds.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
};
