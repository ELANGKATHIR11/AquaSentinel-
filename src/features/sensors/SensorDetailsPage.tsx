/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { ChartPanel } from '../../components/ChartPanel';
import { StatusBadge } from '../../components/StatusBadge';
import { SourceBadge } from '../../components/SourceBadge';
import { DataTable } from '../../components/DataTable';
import {
  ArrowLeft,
  Download,
  Sliders,
  AlertTriangle,
  Cpu,
  Wifi,
  Battery,
  ShieldAlert,
  Terminal,
} from 'lucide-react';
import { Telemetry } from '../../types';

export const SensorDetailsPage: React.FC = () => {
  const { sensorId } = useParams<{ sensorId: string }>();
  const {
    sensors,
    telemetryHistory,
    calibrationProfiles,
    alerts,
  } = useDashboardStore();

  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d'>('24h');
  const [activeTab, setActiveTab] = useState<'table' | 'calibration' | 'json'>('table');

  const sensorObj = useMemo(() => {
    return sensors.find(s => s.sensor_id === sensorId) || sensors[0];
  }, [sensors, sensorId]);

  const targetId = sensorObj?.sensor_id || 'AQ001';

  // Filter telemetry history based on time range
  const rawHistory = telemetryHistory[targetId] || [];
  const filteredHistory = useMemo(() => {
    if (rawHistory.length === 0) return [];
    
    // In our mock environment we've generated 24 hours of data.
    // Let's filter client-side based on mock limits to emulate actual rolling queries.
    const now = Date.now();
    if (timeRange === '1h') {
      const oneHourAgo = now - 60 * 60 * 1000;
      return rawHistory.filter(t => new Date(t.timestamp).getTime() >= oneHourAgo);
    }
    if (timeRange === '7d') {
      // Return everything (simulates extended history)
      return rawHistory;
    }
    // 24h default (return last 24 items or last 24h)
    const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
    return rawHistory.filter(t => new Date(t.timestamp).getTime() >= twentyFourHoursAgo);
  }, [rawHistory, timeRange]);

  const latestTelemetry = rawHistory[rawHistory.length - 1];

  const calProfile = calibrationProfiles.find(p => p.sensor_id === targetId);
  const sensorAlerts = alerts.filter(a => a.sensor_id === targetId);

  // CSV Exporter
  const handleExportCSV = () => {
    if (filteredHistory.length === 0) return;
    
    // Create CSV headers
    const headers = [
      'Sensor ID', 'Timestamp', 'Latitude', 'Longitude', 'Water Level (cm)',
      'pH', 'Turbidity (NTU)', 'Temperature (C)', 'Tilt (deg)', 'Turbulence Index',
      'Battery (V)', 'RSSI (dBm)', 'SNR', 'Water Health Score', 'Flood Risk Score', 'Pollution Anomaly Score', 'Source'
    ];

    const rows = filteredHistory.map(t => [
      t.sensor_id, t.timestamp, t.latitude, t.longitude, t.water_level_cm,
      t.ph, t.turbidity_ntu, t.temperature_c, t.tilt_deg, t.turbulence_index,
      t.battery_voltage, t.rssi, t.snr, t.water_health_score, t.flood_risk_score, t.pollution_anomaly_score, t.source
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${targetId}_telemetry_${timeRange}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Table columns for bottom history tab
  const tableColumns = [
    {
      key: 'timestamp',
      header: 'Time',
      sortable: true,
      render: (item: Telemetry) => (
        <span className="font-mono text-zinc-400">{new Date(item.timestamp).toLocaleString()}</span>
      ),
    },
    {
      key: 'water_level_cm',
      header: 'Water Level',
      sortable: true,
      render: (item: Telemetry) => <span className="font-mono font-semibold">{item.water_level_cm} cm</span>,
    },
    {
      key: 'ph',
      header: 'pH',
      sortable: true,
      render: (item: Telemetry) => <span className="font-mono font-semibold">{item.ph}</span>,
    },
    {
      key: 'turbidity_ntu',
      header: 'Turbidity',
      sortable: true,
      render: (item: Telemetry) => <span className="font-mono">{item.turbidity_ntu} NTU</span>,
    },
    {
      key: 'temperature_c',
      header: 'Temp',
      sortable: true,
      render: (item: Telemetry) => <span className="font-mono">{item.temperature_c} °C</span>,
    },
    {
      key: 'tilt_deg',
      header: 'Tilt',
      sortable: true,
      render: (item: Telemetry) => <span className="font-mono">{item.tilt_deg}°</span>,
    },
    {
      key: 'battery_voltage',
      header: 'Battery',
      sortable: true,
      render: (item: Telemetry) => <span className="font-mono">{item.battery_voltage}V</span>,
    },
    {
      key: 'source',
      header: 'Source',
      sortable: true,
      render: (item: Telemetry) => <SourceBadge source={item.source} />,
    },
  ];

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      
      {/* Detail Header breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-900 pb-5">
        <div className="flex items-center gap-3">
          <Link
            to="/sensors"
            className="p-2 bg-zinc-900 hover:bg-zinc-800 rounded border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-zinc-100 font-mono tracking-tight">{targetId} Details</h2>
              <StatusBadge status={sensorObj?.status} />
              <SourceBadge source={sensorObj?.source || 'iot'} />
            </div>
            <p className="text-xs text-zinc-500 font-mono mt-0.5">{sensorObj?.name} - ESTUARY DIAGNOSTICS CONTROL</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-semibold rounded text-zinc-300 cursor-pointer transition-all"
          >
            <Download className="w-4 h-4" />
            Export CSV Dataset
          </button>
          <Link
            to="/calibration"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-white border border-transparent text-xs font-semibold rounded text-zinc-950 transition-all shadow-md"
          >
            <Sliders className="w-4 h-4" />
            Recalibrate Buoy
          </Link>
        </div>
      </div>

      {/* Date Filters & Diagnostic Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-zinc-950 border border-zinc-900 p-4 rounded-lg">
        <div className="flex items-center gap-1.5 font-mono text-xs text-zinc-400">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Last Telemetry Sync: <b>{latestTelemetry ? new Date(latestTelemetry.timestamp).toLocaleTimeString() : 'N/A'}</b></span>
        </div>

        {/* Rolling filter tabs */}
        <div className="flex items-center bg-zinc-900 p-1 rounded-md border border-zinc-800 font-mono text-xs">
          <button
            onClick={() => setTimeRange('1h')}
            className={`px-3 py-1 rounded cursor-pointer transition-all ${timeRange === '1h' ? 'bg-zinc-850 text-zinc-100 font-bold' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Rolling 1 Hr
          </button>
          <button
            onClick={() => setTimeRange('24h')}
            className={`px-3 py-1 rounded cursor-pointer transition-all ${timeRange === '24h' ? 'bg-zinc-850 text-zinc-100 font-bold' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            24 Hours
          </button>
          <button
            onClick={() => setTimeRange('7d')}
            className={`px-3 py-1 rounded cursor-pointer transition-all ${timeRange === '7d' ? 'bg-zinc-850 text-zinc-100 font-bold' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            7 Days
          </button>
        </div>
      </div>

      {/* Sensor-health diagnostic panel */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-lg font-mono text-xs">
          <div className="flex items-center gap-1.5 text-zinc-500 font-bold uppercase tracking-wider text-[10px] mb-2">
            <Cpu className="w-4 h-4 text-zinc-400" />
            Core Microprocessor
          </div>
          <div className="text-zinc-200 text-sm font-semibold">ESP32-WROOM-32E</div>
          <p className="text-[10px] text-zinc-500 mt-1">Dual-Core 240MHz, 4MB Flash</p>
        </div>
        <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-lg font-mono text-xs">
          <div className="flex items-center gap-1.5 text-zinc-500 font-bold uppercase tracking-wider text-[10px] mb-2">
            <Wifi className="w-4 h-4 text-zinc-400" />
            RF LoRa Link Info
          </div>
          <div className="text-zinc-200 text-sm font-semibold">RSSI: {latestTelemetry?.rssi || -90} dBm</div>
          <p className="text-[10px] text-zinc-500 mt-1">SNR: {latestTelemetry?.snr || 8.0} dB | SF: 7, BW: 125kHz</p>
        </div>
        <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-lg font-mono text-xs">
          <div className="flex items-center gap-1.5 text-zinc-500 font-bold uppercase tracking-wider text-[10px] mb-2">
            <Battery className="w-4 h-4 text-zinc-400" />
            Solar & Battery status
          </div>
          <div className="text-zinc-200 text-sm font-semibold">{latestTelemetry?.battery_voltage || 3.9} V</div>
          <p className="text-[10px] text-zinc-500 mt-1">Charging: LiFePO4 Cell nominal</p>
        </div>
        <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-lg font-mono text-xs">
          <div className="flex items-center gap-1.5 text-zinc-500 font-bold uppercase tracking-wider text-[10px] mb-2">
            <ShieldAlert className="w-4 h-4 text-zinc-400" />
            Tilt Safety diagnostics
          </div>
          <div className="text-zinc-200 text-sm font-semibold">TILT: {latestTelemetry?.tilt_deg || 2.0}°</div>
          <p className="text-[10px] text-zinc-500 mt-1">Orientation limit: &le; 45° alert</p>
        </div>
      </div>

      {/* 8 Charts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <ChartPanel
          title="Water Level (cm)"
          data={filteredHistory}
          metric="water_level_cm"
          color="#3b82f6"
          gradientColor="#3b82f6"
          unit="cm"
        />
        <ChartPanel
          title="pH Level"
          data={filteredHistory}
          metric="ph"
          color="#10b981"
          gradientColor="#10b981"
          unit="pH"
        />
        <ChartPanel
          title="Turbidity (NTU)"
          data={filteredHistory}
          metric="turbidity_ntu"
          color="#eab308"
          gradientColor="#eab308"
          unit="NTU"
        />
        <ChartPanel
          title="Water Temp (°C)"
          data={filteredHistory}
          metric="temperature_c"
          color="#ec4899"
          gradientColor="#ec4899"
          unit="°C"
        />
        <ChartPanel
          title="Buoy Battery Voltage"
          data={filteredHistory}
          metric="battery_voltage"
          color="#a855f7"
          gradientColor="#a855f7"
          unit="V"
          type="line"
        />
        <ChartPanel
          title="Turbulence Index"
          data={filteredHistory}
          metric="turbulence_index"
          color="#f97316"
          gradientColor="#f97316"
          unit="Idx"
        />
        <ChartPanel
          title="Flood Risk Estimation"
          data={filteredHistory}
          metric="flood_risk_score"
          color="#06b6d4"
          gradientColor="#06b6d4"
          unit="Score"
        />
        <ChartPanel
          title="Pollution Anomaly Detection"
          data={filteredHistory}
          metric="pollution_anomaly_score"
          color="#f43f5e"
          gradientColor="#f43f5e"
          unit="Score"
        />
      </div>

      {/* Historical Telemetry Inspector Tabs */}
      <div className="bg-zinc-950 border border-zinc-900 rounded-lg p-5 shadow-lg">
        <div className="flex border-b border-zinc-900 mb-4 font-mono text-xs">
          <button
            onClick={() => setActiveTab('table')}
            className={`px-4 py-2 border-b-2 font-semibold cursor-pointer transition-all ${activeTab === 'table' ? 'border-zinc-300 text-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
          >
            Telemetry Log Table
          </button>
          <button
            onClick={() => setActiveTab('calibration')}
            className={`px-4 py-2 border-b-2 font-semibold cursor-pointer transition-all ${activeTab === 'calibration' ? 'border-zinc-300 text-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
          >
            Current Calibration Profile
          </button>
          <button
            onClick={() => setActiveTab('json')}
            className={`px-4 py-2 border-b-2 font-semibold cursor-pointer transition-all ${activeTab === 'json' ? 'border-zinc-300 text-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
          >
            Raw JSON API Payload Inspector
          </button>
        </div>

        {activeTab === 'table' && (
          <DataTable<Telemetry>
            columns={tableColumns}
            data={filteredHistory}
            paginationSize={10}
          />
        )}

        {activeTab === 'calibration' && (
          <div className="p-4 bg-zinc-900/30 rounded border border-zinc-900 font-mono text-xs text-zinc-300 max-w-xl flex flex-col gap-3">
            <div className="flex items-center gap-2 text-zinc-200 font-bold mb-1">
              <Sliders className="w-4 h-4 text-blue-400" />
              ACTIVE CALIBRATION COEFFICIENTS
            </div>
            <div className="flex justify-between py-1 border-b border-zinc-900">
              <span>pH sensor offset coefficient:</span>
              <span className="font-bold text-zinc-100">{calProfile?.ph_offset || '0.00'}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-zinc-900">
              <span>pH sensor curve slope:</span>
              <span className="font-bold text-zinc-100">{calProfile?.ph_slope || '1.00'}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-zinc-900">
              <span>Turbidity distilled calibration (zero offset):</span>
              <span className="font-bold text-zinc-100">{calProfile?.turbidity_zero_offset || '0.0'} NTU</span>
            </div>
            <div className="flex justify-between py-1 border-b border-zinc-900">
              <span>Water Level Ultrasonic offset:</span>
              <span className="font-bold text-zinc-100">{calProfile?.water_level_offset_cm || '0.0'} cm</span>
            </div>
            <div className="flex justify-between py-1 border-b border-zinc-900">
              <span>Last Calibration Date:</span>
              <span className="font-bold text-zinc-100">{calProfile ? new Date(calProfile.last_calibrated).toLocaleString() : 'System default'}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-zinc-900">
              <span>Responsible Operator:</span>
              <span className="font-bold text-zinc-100">{calProfile?.operator || 'N/A'}</span>
            </div>
            <div className="flex justify-between py-1">
              <span>Validity Status:</span>
              <span className={`font-bold capitalize ${
                calProfile?.validity_status === 'valid' ? 'text-emerald-400' : 'text-amber-400'
              }`}>{calProfile?.validity_status || 'Uncalibrated'}</span>
            </div>
          </div>
        )}

        {activeTab === 'json' && (
          <div className="relative font-mono text-xs">
            <div className="absolute top-2 right-2 bg-zinc-900 px-2 py-1 rounded text-[10px] text-zinc-500 uppercase tracking-widest border border-zinc-800 flex items-center gap-1">
              <Terminal className="w-3.5 h-3.5 text-zinc-400" />
              ws frame payload
            </div>
            <pre className="p-4 bg-zinc-950 border border-zinc-900 rounded text-emerald-400 overflow-x-auto select-all max-h-[350px]">
              {JSON.stringify(latestTelemetry || { error: 'No live telemetry frame cached in buffer' }, null, 2)}
            </pre>
          </div>
        )}
      </div>

    </div>
  );
};
