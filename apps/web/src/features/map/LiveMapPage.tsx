/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { MapProvider } from './components/MapProvider';
import { MapLegend } from '../../components/MapLegend';
import { SourceBadge } from '../../components/SourceBadge';
import { StatusBadge } from '../../components/StatusBadge';
import {
  Compass,
  Database,
  Eye,
  Info,
  Layers,
  MapPin,
  RefreshCw,
  Search,
  Sliders,
  TrendingUp,
} from 'lucide-react';
import { Link } from 'react-router-dom';

export const LiveMapPage: React.FC = () => {
  const {
    sensors,
    selectedSensorId,
    setSelectedSensorId,
    selectedSiteId,
    setSelectedSiteId,
    mapCenter,
    mapZoom,
    satelliteLayer,
    alertZonesLayer,
    heatmapLayer,
    telemetryHistory,
    mockMode,
  } = useDashboardStore();

  // Local UI layer controls
  const store = useDashboardStore();
  const [localSearch, setLocalSearch] = useState('');

  const filteredSensors = sensors.filter((s) => {
    const term = localSearch.toLowerCase();
    return s.sensor_id.toLowerCase().includes(term) || s.name.toLowerCase().includes(term);
  });

  const selectedSensorObj = sensors.find((s) => s.sensor_id === selectedSensorId);
  const selectedHistory = selectedSensorId ? telemetryHistory[selectedSensorId] || [] : [];
  const latestTel = selectedHistory[selectedHistory.length - 1];

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col md:flex-row gap-5 animate-in fade-in duration-300">
      
      {/* Left side: Search, Legends, Layer Controls, and Node list */}
      <div className="w-full md:w-80 flex flex-col gap-4 overflow-y-auto pr-1">
        
        {/* Node search filter */}
        <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-lg shadow-md">
          <h3 className="text-xs font-bold uppercase text-zinc-300 mb-2.5 flex items-center gap-1.5 font-mono">
            <Search className="w-4 h-4 text-zinc-500" />
            Find Buoy Nodes
          </h3>
          <input
            type="text"
            placeholder="Filter by ID or site..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-700 font-mono"
          />

          <div className="mt-4 max-h-48 overflow-y-auto flex flex-col gap-1.5">
            {filteredSensors.map((s) => (
              <button
                key={s.sensor_id}
                onClick={() => setSelectedSensorId(s.sensor_id)}
                className={`w-full text-left px-2.5 py-2 rounded text-xs font-mono flex items-center justify-between border cursor-pointer transition-all ${
                  selectedSensorId === s.sensor_id
                    ? 'bg-zinc-900 border-zinc-700 text-zinc-100'
                    : 'bg-zinc-950 border-zinc-900 text-zinc-400 hover:bg-zinc-900/40 hover:text-zinc-200'
                }`}
              >
                <div className="flex flex-col">
                  <span className="font-bold text-[11px]">{s.sensor_id}</span>
                  <span className="text-[9px] text-zinc-500 truncate max-w-[140px]">{s.name}</span>
                </div>
                <StatusBadge status={s.status} />
              </button>
            ))}
          </div>
        </div>

        {/* Map Legend Panel and Layer Controllers */}
        <MapLegend
          satelliteLayer={satelliteLayer}
          onToggleSatellite={() => store.setSatelliteLayer(!satelliteLayer)}
          alertZonesLayer={alertZonesLayer}
          onToggleAlertZones={() => store.setAlertZonesLayer(!alertZonesLayer)}
          heatmapLayer={heatmapLayer}
          onToggleHeatmap={() => store.setHeatmapLayer(!heatmapLayer)}
        />

        {/* Site Sector Selection */}
        <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-lg shadow-md font-mono text-xs">
          <h4 className="text-zinc-300 font-bold uppercase tracking-wider text-[10px] mb-2">Focus River Basin Sector</h4>
          <select
            value={selectedSiteId}
            onChange={(e) => setSelectedSiteId(e.target.value)}
            className="w-full px-2 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-300"
            title="Focus River Basin Sector"
          >
            <option value="all">ALL SECTORS (OVERVIEW)</option>
            <option value="site_adyar">Adyar River Basin</option>
            <option value="site_cooum">Cooum River Central</option>
            <option value="site_chembar">Chembarambakkam Spillway</option>
            <option value="site_kosas">Kosasthalaiyar Estuary</option>
            <option value="site_buckingham">Buckingham Canal</option>
            <option value="site_thoothukudi">Thoothukudi Estuary (Raster/Vector Dev)</option>
          </select>
        </div>
      </div>

      {/* Center: The Leaflet GIS Canvas (Full height layout) */}
      <div className="flex-1 h-full min-h-[300px] relative">
        <MapProvider
          sensors={sensors}
          selectedSensorId={selectedSensorId}
          onSelectSensor={setSelectedSensorId}
          center={mapCenter}
          zoom={mapZoom}
          satelliteLayer={satelliteLayer}
          alertZonesLayer={alertZonesLayer}
          heatmapLayer={heatmapLayer}
        />
      </div>

      {/* Right side: Detailed Inspection Drawer */}
      {selectedSensorObj && (
        <div className="w-full md:w-80 flex flex-col gap-4 border border-zinc-900 bg-zinc-950 p-5 rounded-lg shadow-2xl overflow-y-auto font-mono text-xs">
          <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
            <div>
              <p className="text-[10px] text-zinc-500 font-bold uppercase">BUOY METRIC TELEMETRY</p>
              <h3 className="text-sm font-extrabold text-zinc-100 font-sans mt-0.5">{selectedSensorObj.sensor_id}</h3>
            </div>
            <button
              onClick={() => setSelectedSensorId(null)}
              className="text-zinc-500 hover:text-zinc-300 cursor-pointer text-xs"
            >
              CLOSE [X]
            </button>
          </div>

          <div className="p-3 bg-zinc-900/50 rounded border border-zinc-900/80 flex flex-col gap-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-zinc-500">Node Identifier:</span>
              <span className="text-zinc-200 font-bold">{selectedSensorObj.sensor_id}</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-zinc-500">River Site Name:</span>
              <span className="text-zinc-300 text-right truncate max-w-[150px]">{selectedSensorObj.name}</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-zinc-500">Coordinates:</span>
              <span className="text-zinc-300 text-[10px]">{selectedSensorObj.latitude.toFixed(4)}°, {selectedSensorObj.longitude.toFixed(4)}°</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-zinc-500">Status state:</span>
              <StatusBadge status={selectedSensorObj.status} />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h4 className="text-[10px] text-zinc-500 font-bold uppercase border-b border-zinc-900 pb-1 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" />
              Live Sensor Readings
            </h4>
            
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-2.5 bg-zinc-900/30 rounded border border-zinc-900/60">
                <span className="text-[9px] text-zinc-500 block uppercase">Water Level</span>
                <span className="text-sm font-semibold text-zinc-100">{latestTel?.water_level_cm || 'N/A'} <span className="text-[10px] text-zinc-500">cm</span></span>
              </div>
              <div className="p-2.5 bg-zinc-900/30 rounded border border-zinc-900/60">
                <span className="text-[9px] text-zinc-500 block uppercase">pH Acidity</span>
                <span className="text-sm font-semibold text-zinc-100">{latestTel?.ph || 'N/A'}</span>
              </div>
              <div className="p-2.5 bg-zinc-900/30 rounded border border-zinc-900/60">
                <span className="text-[9px] text-zinc-500 block uppercase">Turbidity</span>
                <span className="text-sm font-semibold text-zinc-100">{latestTel?.turbidity_ntu || 'N/A'} <span className="text-[10px] text-zinc-500">NTU</span></span>
              </div>
              <div className="p-2.5 bg-zinc-900/30 rounded border border-zinc-900/60">
                <span className="text-[9px] text-zinc-500 block uppercase">Temperature</span>
                <span className="text-sm font-semibold text-zinc-100">{latestTel?.temperature_c || 'N/A'} <span className="text-[10px] text-zinc-500">°C</span></span>
              </div>
            </div>
          </div>

          <div className="p-3.5 bg-zinc-900/40 border border-zinc-900 rounded">
            <span className="text-[9px] text-zinc-500 block uppercase mb-1">Environmental Estimations</span>
            <div className="flex flex-col gap-1.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span>Flood Risk Score:</span>
                <span className="text-zinc-200 font-bold">{Math.round((selectedSensorObj.flood_risk_score) * 100)}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Pollution Anomaly:</span>
                <span className="text-zinc-200 font-bold">{Math.round((selectedSensorObj.pollution_anomaly_score) * 100)}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Avg Water Health:</span>
                <span className="text-zinc-200 font-bold">{selectedSensorObj.water_health_score}/100</span>
              </div>
            </div>
          </div>

          <div className="mt-auto flex flex-col gap-2 pt-4 border-t border-zinc-900">
            <Link
              to={`/sensor/${selectedSensorObj.sensor_id}`}
              className="w-full text-center py-2 bg-zinc-100 hover:bg-white text-zinc-950 font-bold text-xs rounded transition-all shadow-md flex items-center justify-center gap-1.5"
            >
              <Info className="w-3.5 h-3.5" />
              Analyze Historical Data
            </Link>
            <Link
              to="/calibration"
              className="w-full text-center py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-semibold text-xs rounded transition-all border border-zinc-800"
            >
              Perform pH Calibration
            </Link>
          </div>
        </div>
      )}

    </div>
  );
};
