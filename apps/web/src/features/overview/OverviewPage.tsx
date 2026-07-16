/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { MetricCard } from '../../components/MetricCard';
import { ChartPanel } from '../../components/ChartPanel';
import { MapProvider } from '../map/components/MapProvider';
import { StatusBadge } from '../../components/StatusBadge';
import { SourceBadge } from '../../components/SourceBadge';
import {
  Activity,
  AlertTriangle,
  Battery,
  Calendar,
  Compass,
  Cpu,
  Droplets,
  Radio,
  RefreshCw,
  Signal,
  Waves,
} from 'lucide-react';

export const OverviewPage: React.FC = () => {
  const {
    sensors,
    alerts,
    telemetryHistory,
    selectedSensorId,
    setSelectedSensorId,
    tickSimulation,
    mockMode,
  } = useDashboardStore();

  // Pick a sensor to display trends or fallback
  const displaySensorId = selectedSensorId || sensors[0]?.sensor_id || 'AQ001';
  const sensorTelemetry = telemetryHistory[displaySensorId] || [];
  const latestTelemetry = sensorTelemetry[sensorTelemetry.length - 1];

  // Computations
  const activeBuoysCount = sensors.filter(s => s.status !== 'offline').length;
  const onlineGateways = 4; // Mock status
  const floodNodesCount = sensors.filter(s => s.status === 'high_risk' || s.status === 'critical').length;
  const activeAlertsCount = alerts.filter(a => a.status === 'active').length;

  const averageWaterHealth = useMemo(() => {
    const activeSensors = sensors.filter(s => s.status !== 'offline');
    if (activeSensors.length === 0) return 0;
    const sum = activeSensors.reduce((acc, curr) => acc + curr.water_health_score, 0);
    return Math.round(sum / activeSensors.length);
  }, [sensors]);

  const lastTelemetryTime = useMemo(() => {
    const activeSensors = sensors.filter(s => s.status !== 'offline');
    if (activeSensors.length === 0) return 'N/A';
    const dates = activeSensors.map(s => new Date(s.last_seen).getTime());
    const maxDate = Math.max(...dates);
    return new Date(maxDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }, [sensors]);

  // Source deduction
  const generalSource = mockMode ? 'simulation' : 'iot';

  // Selected sensor detail values
  const activeSensorObj = sensors.find(s => s.sensor_id === displaySensorId) || sensors[0];

  // Flood estimation level
  const floodScore = activeSensorObj?.flood_risk_score || 0;
  let floodLevel = 'LOW';
  let floodColor = 'text-emerald-400';
  let floodProgressBg = 'bg-emerald-500';
  if (floodScore >= 0.8) {
    floodLevel = 'CRITICAL';
    floodColor = 'text-rose-500 font-bold';
    floodProgressBg = 'bg-rose-500';
  } else if (floodScore >= 0.6) {
    floodLevel = 'HIGH';
    floodColor = 'text-orange-400 font-semibold';
    floodProgressBg = 'bg-orange-500';
  } else if (floodScore >= 0.35) {
    floodLevel = 'MODERATE';
    floodColor = 'text-amber-400';
    floodProgressBg = 'bg-amber-500';
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      {/* Title block */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-zinc-100 font-sans tracking-tight">Environmental Control Dashboard</h2>
          <p className="text-xs text-zinc-500 font-mono mt-0.5">ESTUARY AND FLOOD BASIN OPERATIONS CENTER</p>
        </div>
        <div className="flex items-center gap-3">
          {mockMode && (
            <button
              onClick={tickSimulation}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-xs font-semibold rounded text-amber-300 cursor-pointer transition-all active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Force Sim Tick
            </button>
          )}
          <span className="text-xs text-zinc-400 bg-zinc-950 border border-zinc-900 px-3 py-1.5 rounded flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-zinc-500" />
            <span className="font-mono">{new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </span>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <MetricCard
          label="Active Buoys"
          value={`${activeBuoysCount} / ${sensors.length}`}
          icon={Cpu}
          subtext="Telemetry Online"
          source={generalSource}
          status="normal"
        />
        <MetricCard
          label="Online Gateways"
          value={onlineGateways}
          icon={Radio}
          subtext="LoRa Sector Gateways"
          source="iot"
          status="normal"
        />
        <MetricCard
          label="Flood Risk Nodes"
          value={floodNodesCount}
          icon={Waves}
          subtext="Over Warning Level"
          source={generalSource}
          status={floodNodesCount > 0 ? 'warning' : 'normal'}
        />
        <MetricCard
          label="Pollution Alerts"
          value={activeAlertsCount}
          icon={AlertTriangle}
          subtext="Active Anomalies"
          source={generalSource}
          status={activeAlertsCount > 0 ? 'danger' : 'normal'}
        />
        <MetricCard
          label="Avg Water Health"
          value={`${averageWaterHealth}/100`}
          icon={Droplets}
          subtext="Water Quality Index"
          source={generalSource}
          status={averageWaterHealth < 60 ? 'danger' : averageWaterHealth < 75 ? 'warning' : 'normal'}
        />
        <MetricCard
          label="Last Telemetry"
          value={lastTelemetryTime}
          icon={Activity}
          subtext="Live Packet Received"
          source={generalSource}
          status="normal"
        />
      </div>

      {/* Primary Dashboard Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Map & Main charts */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          
          {/* Map Preview */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md flex flex-col h-[400px]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Live River GIS Command Map</h3>
              </div>
              <SourceBadge source={generalSource} />
            </div>
            <div className="flex-1 w-full h-full relative">
              <MapProvider
                sensors={sensors}
                selectedSensorId={displaySensorId}
                onSelectSensor={setSelectedSensorId}
                center={[13.04, 80.20]}
                zoom={11}
                satelliteLayer={false}
                alertZonesLayer={true}
                heatmapLayer={false}
              />
            </div>
          </div>

          {/* Time Series Analytics for selected sensor */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ChartPanel
              title="Water Level trend"
              data={sensorTelemetry}
              metric="water_level_cm"
              color="#3b82f6"
              gradientColor="#3b82f6"
              unit="cm"
            />
            <ChartPanel
              title="pH Levels"
              data={sensorTelemetry}
              metric="ph"
              color="#10b981"
              gradientColor="#10b981"
              unit="pH"
            />
          </div>
        </div>

        {/* Right Col: Operations sidebar panel */}
        <div className="flex flex-col gap-6">
          
          {/* Selected Buoy Analytics summary */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-md flex flex-col justify-between">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div>
                <p className="text-[10px] text-slate-500 font-mono">SELECTED BUOY SNAPSHOT</p>
                <h3 className="text-sm font-bold text-white font-mono mt-0.5">{activeSensorObj?.sensor_id}: {activeSensorObj?.name}</h3>
              </div>
              <SourceBadge source={activeSensorObj?.source || 'iot'} />
            </div>

            {/* Quick selectors */}
            <div className="mb-4">
              <label className="text-[10px] text-slate-500 font-mono uppercase">Quick Select Node</label>
              <select
                value={displaySensorId}
                onChange={(e) => setSelectedSensorId(e.target.value)}
                className="w-full mt-1.5 px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {sensors.map(s => (
                  <option key={s.sensor_id} value={s.sensor_id}>
                    {s.sensor_id} - {s.name} ({s.status.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            {/* Flood Estimation Gauge */}
            <div className="p-4 bg-slate-950/40 rounded-lg border border-slate-800 mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] text-slate-400 font-mono">Flood Risk Estimation</span>
                <span className={`text-xs font-bold ${floodColor}`}>{floodLevel}</span>
              </div>
              <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800 p-[1px]">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${floodProgressBg}`}
                  style={{ width: `${floodScore * 100}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[9px] font-mono text-slate-500 mt-1">
                <span>0% RISK</span>
                <span>SCORE: {Math.round(floodScore * 100)}%</span>
                <span>100% FLOOD</span>
              </div>
            </div>

            {/* Water Health scorecard details */}
            <div className="p-4 bg-slate-950/40 rounded-lg border border-slate-800 mb-4 flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <span className="text-[10px] text-slate-400 font-mono">Water Health Score</span>
                <span className="text-xs font-bold font-mono text-slate-200">{activeSensorObj?.water_health_score} / 100</span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-500">pH level</span>
                  <span className="font-semibold text-slate-300">{latestTelemetry?.ph || '7.1'}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-500">Turbidity</span>
                  <span className="font-semibold text-slate-300">{latestTelemetry?.turbidity_ntu || '4.5'} NTU</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-500">Temperature</span>
                  <span className="font-semibold text-slate-300">{latestTelemetry?.temperature_c || '27.9'} °C</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-500">Pollution Anomaly</span>
                  <span className="font-semibold text-slate-300">{Math.round((latestTelemetry?.pollution_anomaly_score || 0) * 100)}% Prob.</span>
                </div>
              </div>
            </div>

            {/* Device RF metrics list */}
            <div className="flex flex-col gap-2">
              <span className="text-[10px] text-slate-500 font-mono uppercase">Node Diagnostic Health</span>
              <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
                <div className="p-2 bg-slate-950/50 rounded-lg border border-slate-800 text-center flex flex-col items-center">
                  <Battery className="w-3.5 h-3.5 text-slate-500 mb-1" />
                  <span className="text-slate-500">BATTERY</span>
                  <span className="text-slate-200 font-semibold mt-0.5">{activeSensorObj?.battery_voltage || '3.9'}V</span>
                </div>
                <div className="p-2 bg-slate-950/50 rounded-lg border border-slate-800 text-center flex flex-col items-center">
                  <Signal className="w-3.5 h-3.5 text-slate-500 mb-1" />
                  <span className="text-slate-500">RSSI</span>
                  <span className="text-slate-200 font-semibold mt-0.5">{activeSensorObj?.rssi || '-90'} dBm</span>
                </div>
                <div className="p-2 bg-slate-950/50 rounded-lg border border-slate-800 text-center flex flex-col items-center">
                  <Compass className="w-3.5 h-3.5 text-slate-500 mb-1" />
                  <span className="text-slate-500">TILT</span>
                  <span className="text-slate-200 font-semibold mt-0.5">{latestTelemetry?.tilt_deg || '1.5'}°</span>
                </div>
              </div>
            </div>

          </div>

          {/* Recent alerts log list timeline */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-md flex-1 flex flex-col">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-4 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              Recent Operations Alerts
            </h4>
            <div className="flex flex-col gap-3 overflow-y-auto max-h-[280px] pr-1 flex-1">
              {alerts.slice(0, 4).map((alert) => (
                <div
                  key={alert.id}
                  className={`p-3 rounded-lg border text-xs flex flex-col gap-1 ${
                    alert.severity === 'critical' ? 'bg-rose-950/10 border-rose-900/40 text-rose-300' :
                    alert.severity === 'high' ? 'bg-orange-950/10 border-orange-900/40 text-orange-300' :
                    'bg-slate-950 border-slate-800/60 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-[10px]">{alert.sensor_id} - {alert.type.toUpperCase()}</span>
                    <span className="text-[9px] text-slate-500">{new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="text-[11px] leading-relaxed mt-0.5">{alert.summary}</p>
                  <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-slate-800/40 text-[9px] text-slate-500 font-mono">
                    <span>Status: <b className="capitalize text-slate-400">{alert.status}</b></span>
                    <span>Source: {alert.source.toUpperCase()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
