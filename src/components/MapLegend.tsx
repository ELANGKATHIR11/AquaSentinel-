/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface MapLegendProps {
  satelliteLayer: boolean;
  onToggleSatellite: () => void;
  alertZonesLayer: boolean;
  onToggleAlertZones: () => void;
  heatmapLayer: boolean;
  onToggleHeatmap: () => void;
}

export const MapLegend: React.FC<MapLegendProps> = ({
  satelliteLayer,
  onToggleSatellite,
  alertZonesLayer,
  onToggleAlertZones,
  heatmapLayer,
  onToggleHeatmap,
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col gap-4 shadow-xl font-mono text-xs text-slate-300">
      <div>
        <h4 className="text-white font-bold mb-2 uppercase tracking-wider text-[10px]">Buoy Node Severities</h4>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500 border border-slate-950" />
            <span className="text-slate-400">Normal (Score &ge; 75)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-amber-500 border border-slate-950" />
            <span className="text-slate-400">Warning (Score 65-74)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-orange-500 border border-slate-950" />
            <span className="text-slate-400">High Risk (Score 40-64)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-rose-500 border border-slate-950 animate-pulse" />
            <span className="text-rose-400 font-semibold">Critical (Score &lt; 40)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-slate-600 border border-slate-950" />
            <span className="text-slate-500">Offline (&gt; 1 hr)</span>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-800 pt-3">
        <h4 className="text-white font-bold mb-2.5 uppercase tracking-wider text-[10px]">Layer Control Center</h4>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2.5 cursor-pointer text-slate-400 hover:text-slate-200">
            <input
              type="checkbox"
              checked={satelliteLayer}
              onChange={onToggleSatellite}
              className="accent-emerald-500 h-3.5 w-3.5 rounded border-slate-800 bg-slate-950"
            />
            <span>USGS Satellite Imagery</span>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer text-slate-400 hover:text-slate-200">
            <input
              type="checkbox"
              checked={alertZonesLayer}
              onChange={onToggleAlertZones}
              className="accent-emerald-500 h-3.5 w-3.5 rounded border-slate-800 bg-slate-950"
            />
            <span>River Basin Polygons</span>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer text-slate-400 hover:text-slate-200">
            <input
              type="checkbox"
              checked={heatmapLayer}
              onChange={onToggleHeatmap}
              className="accent-emerald-500 h-3.5 w-3.5 rounded border-slate-800 bg-slate-950"
            />
            <span>Contamination Plume (Heatmap)</span>
          </label>
        </div>
      </div>
    </div>
  );
};
