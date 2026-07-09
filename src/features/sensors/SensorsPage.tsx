/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { DataTable } from '../../components/DataTable';
import { StatusBadge } from '../../components/StatusBadge';
import { SourceBadge } from '../../components/SourceBadge';
import { Eye, Sliders, Battery, Signal, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Sensor } from '../../types';

export const SensorsPage: React.FC = () => {
  const { sensors, setSelectedSensorId } = useDashboardStore();

  const columns = [
    {
      key: 'sensor_id',
      header: 'ID',
      sortable: true,
      render: (item: Sensor) => (
        <span className="font-mono font-bold text-zinc-100">{item.sensor_id}</span>
      ),
    },
    {
      key: 'name',
      header: 'Location / Site Name',
      sortable: true,
      render: (item: Sensor) => (
        <div className="flex flex-col">
          <span className="font-medium text-zinc-200">{item.name}</span>
          <span className="text-[10px] text-zinc-500 font-mono">
            {item.latitude.toFixed(4)}°, {item.longitude.toFixed(4)}°
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status Code',
      sortable: true,
      render: (item: Sensor) => <StatusBadge status={item.status} />,
    },
    {
      key: 'water_health_score',
      header: 'Water Health Score',
      sortable: true,
      render: (item: Sensor) => (
        <div className="flex items-center gap-2">
          <div className="w-12 bg-zinc-900 h-2 rounded overflow-hidden border border-zinc-800 p-[1px]">
            <div
              className={`h-full rounded-full ${
                item.water_health_score >= 75 ? 'bg-emerald-500' :
                item.water_health_score >= 60 ? 'bg-amber-500' : 'bg-rose-500'
              }`}
              style={{ width: `${item.water_health_score}%` }}
            />
          </div>
          <span className="font-mono text-xs font-bold text-zinc-300">{item.water_health_score}/100</span>
        </div>
      ),
    },
    {
      key: 'flood_risk_score',
      header: 'Flood Risk Estimation',
      sortable: true,
      render: (item: Sensor) => (
        <span className="font-mono text-xs font-semibold text-zinc-300">
          {Math.round(item.flood_risk_score * 100)}%
        </span>
      ),
    },
    {
      key: 'pollution_anomaly_score',
      header: 'Pollution Anomaly Prob.',
      sortable: true,
      render: (item: Sensor) => (
        <span className="font-mono text-xs text-zinc-400">
          {Math.round(item.pollution_anomaly_score * 100)}%
        </span>
      ),
    },
    {
      key: 'battery_voltage',
      header: 'Battery / Diagnostic',
      sortable: true,
      render: (item: Sensor) => (
        <div className="flex items-center gap-1 text-zinc-300 font-mono text-xs">
          <Battery className={`w-3.5 h-3.5 ${item.battery_voltage < 3.5 ? 'text-rose-400' : 'text-zinc-500'}`} />
          <span>{item.battery_voltage.toFixed(2)} V</span>
        </div>
      ),
    },
    {
      key: 'rssi',
      header: 'LoRa RSSI / SNR',
      sortable: true,
      render: (item: Sensor) => (
        <div className="flex items-center gap-1 text-zinc-400 font-mono text-xs">
          <Signal className="w-3.5 h-3.5 text-zinc-500" />
          <span>{item.rssi} dBm / {item.snr}</span>
        </div>
      ),
    },
    {
      key: 'source',
      header: 'Source tag',
      sortable: true,
      render: (item: Sensor) => <SourceBadge source={item.source} />,
    },
    {
      key: 'actions',
      header: 'Operations',
      sortable: false,
      render: (item: Sensor) => (
        <div className="flex items-center gap-2">
          <Link
            to={`/sensor/${item.sensor_id}`}
            onClick={() => setSelectedSensorId(item.sensor_id)}
            className="p-1 px-2.5 bg-zinc-900 hover:bg-zinc-800 text-[11px] font-semibold text-zinc-300 rounded border border-zinc-800 hover:text-white transition-all flex items-center gap-1 font-mono"
          >
            <Eye className="w-3.5 h-3.5" />
            INSPECT
          </Link>
          <Link
            to="/calibration"
            className="p-1 px-2 bg-zinc-900 hover:bg-zinc-800 text-[11px] font-semibold text-zinc-400 hover:text-zinc-200 rounded border border-zinc-800 transition-all flex items-center gap-1 font-mono"
          >
            <Sliders className="w-3 h-3" />
            CAL
          </Link>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-xl font-bold text-zinc-100 font-sans tracking-tight">Active River Buoy Registry</h2>
        <p className="text-xs text-zinc-500 font-mono mt-0.5">ESP32 FLOATING MONITORING SENSOR REGISTRATION AND LOCO-DIAGNOSTICS</p>
      </div>

      <div className="bg-zinc-950 border border-zinc-900 rounded-lg p-5 shadow-lg">
        <DataTable<Sensor>
          columns={columns}
          data={sensors}
          searchPlaceholder="Search buoys by ID, coordinate, or site..."
          searchKeys={['sensor_id', 'name', 'status']}
          paginationSize={10}
        />
      </div>
    </div>
  );
};
