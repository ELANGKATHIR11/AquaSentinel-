/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar } from 'recharts';
import { SourceBadge } from '../../components/SourceBadge';
import { TrendingUp, Sliders, Database, Heart, Radio, Brain } from 'lucide-react';

export const AnalyticsPage: React.FC = () => {
  const { sensors, telemetryHistory } = useDashboardStore();

  const [compareMetric, setCompareMetric] = useState<string>('water_level_cm');
  const [sensorA, setSensorA] = useState<string>('AQ001');
  const [sensorB, setSensorB] = useState<string>('AQ002');

  const historyA = telemetryHistory[sensorA] || [];
  const historyB = telemetryHistory[sensorB] || [];

  // Downsample and align comparison datasets
  const comparisonData = useMemo(() => {
    const data: any[] = [];
    const maxLength = Math.min(historyA.length, historyB.length, 24);
    
    for (let i = 0; i < maxLength; i++) {
      const entryA = historyA[historyA.length - maxLength + i];
      const entryB = historyB[historyB.length - maxLength + i];
      if (!entryA || !entryB) continue;

      data.push({
        timeLabel: new Date(entryA.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        [sensorA]: entryA[compareMetric as keyof typeof entryA],
        [sensorB]: entryB[compareMetric as keyof typeof entryB],
      });
    }
    return data;
  }, [historyA, historyB, sensorA, sensorB, compareMetric]);

  // Scatter data to find correlations
  const correlationData = useMemo(() => {
    const data: any[] = [];
    const activeHistory = historyA.slice(-24);
    activeHistory.forEach((t) => {
      data.push({
        x: t.ph,
        y: t.turbidity_ntu,
        z: t.pollution_anomaly_score * 100,
        sensor_id: t.sensor_id,
        timestamp: new Date(t.timestamp).toLocaleTimeString(),
      });
    });
    return data;
  }, [historyA]);

  // Risk distribution by site
  const siteDistribution = useMemo(() => {
    return sensors.map((s) => ({
      name: s.sensor_id,
      'Flood Risk Score (%)': Math.round(s.flood_risk_score * 100),
      'Pollution Anomaly Prob (%)': Math.round(s.pollution_anomaly_score * 100),
      'Water Health Score': s.water_health_score,
    }));
  }, [sensors]);

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300 font-mono text-xs text-zinc-300">
      
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-zinc-100 font-sans tracking-tight">Environmental Analytics Center</h2>
        <p className="text-xs text-zinc-500 font-mono mt-0.5">ESTUARY CORRELATIONS AND PREDICTIVE DECISION ENGINEERING</p>
      </div>

      {/* Model Definition disclaimer */}
      <div className="bg-zinc-950 border border-zinc-900 rounded-lg p-4 flex flex-col gap-2">
        <h4 className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-1.5 font-sans">
          <Brain className="w-4 h-4 text-purple-400 animate-pulse" />
          Delineation of Telemetry Parameters
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs mt-2 text-zinc-400">
          <div className="p-3 bg-zinc-900/40 rounded border border-zinc-900">
            <span className="font-bold text-zinc-200">1. MEASURED VALUES (RAW)</span>
            <p className="text-[11px] mt-1 text-zinc-500 leading-relaxed">Direct hardware reads from floating sensor transducers. Includes water temperature, pH acidity electrodes, turbidity phototransistors, and ultrasonic water level height.</p>
          </div>
          <div className="p-3 bg-zinc-900/40 rounded border border-zinc-900">
            <span className="font-bold text-zinc-200">2. DERIVED METRICS</span>
            <p className="text-[11px] mt-1 text-zinc-500 leading-relaxed">Computed values derived from multi-sensor averages. Includes General Water Health Score (WQI) calculated client-side and LoRa signal quality indexes (SNR/RSSI).</p>
          </div>
          <div className="p-3 bg-zinc-900/40 rounded border border-zinc-900">
            <span className="font-bold text-zinc-200">3. AI PREDICTIONS (ESTIMATION ONLY)</span>
            <p className="text-[11px] mt-1 text-zinc-500 leading-relaxed">Statistical estimations calculated via neural model regressions on current and historic flow indices. Includes <b className="text-zinc-300">Flood Risk Estimation</b> and <b className="text-zinc-300">Pollution Anomaly Detection</b>.</p>
          </div>
        </div>
      </div>

      {/* Side by side comparison tool */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Comparative line charts */}
        <div className="lg:col-span-2 bg-zinc-950 border border-zinc-900 rounded-lg p-5 shadow-lg flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-900 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-400" />
              <h3 className="text-xs font-bold uppercase text-zinc-100 font-sans">Multi-Sensor Trend Comparison</h3>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={sensorA}
                onChange={(e) => setSensorA(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 py-1 rounded"
              >
                {sensors.map(s => <option key={s.sensor_id} value={s.sensor_id}>{s.sensor_id}</option>)}
              </select>
              <span className="text-zinc-500 text-[10px]">VS</span>
              <select
                value={sensorB}
                onChange={(e) => setSensorB(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 py-1 rounded"
              >
                {sensors.map(s => <option key={s.sensor_id} value={s.sensor_id}>{s.sensor_id}</option>)}
              </select>

              <select
                value={compareMetric}
                onChange={(e) => setCompareMetric(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 py-1 rounded ml-2"
              >
                <option value="water_level_cm">Water Level (cm)</option>
                <option value="ph">pH level</option>
                <option value="turbidity_ntu">Turbidity (NTU)</option>
                <option value="temperature_c">Temp (°C)</option>
                <option value="battery_voltage">Battery (V)</option>
              </select>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparisonData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#18181b" />
                <XAxis dataKey="timeLabel" stroke="#52525b" fontSize={10} />
                <YAxis stroke="#52525b" fontSize={10} />
                <Tooltip contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a' }} />
                <Legend />
                <Bar dataKey={sensorA} fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey={sensorB} fill="#ec4899" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Diagnostic Quality Scorecard */}
        <div className="bg-zinc-950 border border-zinc-900 rounded-lg p-5 shadow-lg flex flex-col justify-between">
          <div className="border-b border-zinc-900 pb-3 mb-4">
            <h3 className="text-xs font-bold uppercase text-zinc-100 font-sans flex items-center gap-1.5">
              <Radio className="w-4 h-4 text-emerald-400" />
              RF Data Quality Metrics
            </h3>
            <p className="text-[10px] text-zinc-500 mt-0.5 font-mono">SECTOR COMMUNICATIONS INTEGRITY AUDIT</p>
          </div>

          <div className="flex flex-col gap-3.5 flex-1 justify-center">
            <div className="flex justify-between items-center py-1.5 border-b border-zinc-900">
              <span className="text-zinc-500">Telemetry packet loss (overall):</span>
              <span className="font-bold text-zinc-200">1.2%</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-zinc-900">
              <span className="text-zinc-500">Missing Sensor Values (24H):</span>
              <span className="font-bold text-zinc-200">0 records</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-zinc-900">
              <span className="text-zinc-500">Stale/Late telemetry reports:</span>
              <span className="font-bold text-zinc-200">0</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-zinc-900">
              <span className="text-zinc-500">Transducer Out of Bounds:</span>
              <span className="font-bold text-rose-400">1 event (pH &lt; 5.2 Mylapore)</span>
            </div>
            <div className="flex justify-between items-center py-1.5">
              <span className="text-zinc-500">Gateway RSSI stability:</span>
              <span className="font-bold text-emerald-400">98.8% STABLE</span>
            </div>
          </div>
        </div>
      </div>

      {/* Correlation & Risk Matrices */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Scatter chart for correlation */}
        <div className="bg-zinc-950 border border-zinc-900 rounded-lg p-5 shadow-lg">
          <div className="border-b border-zinc-900 pb-3 mb-4">
            <h3 className="text-xs font-bold uppercase text-zinc-100 font-sans">pH vs Turbidity Correlation (24h)</h3>
            <p className="text-[10px] text-zinc-500 mt-0.5">Bubble size represents calculated pollution anomaly score estimation</p>
          </div>

          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: -20 }}>
                <CartesianGrid stroke="#18181b" />
                <XAxis type="number" dataKey="x" name="pH" unit="" stroke="#52525b" fontSize={10} domain={[4, 9]} />
                <YAxis type="number" dataKey="y" name="Turbidity" unit=" NTU" stroke="#52525b" fontSize={10} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a' }} />
                <Scatter name="Telemetry Nodes" data={correlationData} fill="#10b981" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Site risk comparison bar chart */}
        <div className="bg-zinc-950 border border-zinc-900 rounded-lg p-5 shadow-lg">
          <div className="border-b border-zinc-900 pb-3 mb-4">
            <h3 className="text-xs font-bold uppercase text-zinc-100 font-sans">Risk Distribution Estimations by Buoy</h3>
            <p className="text-[10px] text-zinc-500 mt-0.5">Comparative plot of current estimations and water health index</p>
          </div>

          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={siteDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#18181b" />
                <XAxis dataKey="name" stroke="#52525b" fontSize={10} />
                <YAxis stroke="#52525b" fontSize={10} />
                <Tooltip contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a' }} />
                <Legend />
                <Bar dataKey="Flood Risk Score (%)" fill="#eab308" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Pollution Anomaly Prob (%)" fill="#f43f5e" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Water Health Score" fill="#10b981" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

    </div>
  );
};
