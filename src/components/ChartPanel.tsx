/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
} from 'recharts';
import { Telemetry } from '../types';
import { SourceBadge } from './SourceBadge';

interface ChartPanelProps {
  title: string;
  data: Telemetry[];
  metric: keyof Telemetry;
  color?: string;
  gradientColor?: string;
  unit?: string;
  type?: 'area' | 'line';
  showGrid?: boolean;
}

export const ChartPanel: React.FC<ChartPanelProps> = ({
  title,
  data,
  metric,
  color = '#3b82f6', // default blue
  gradientColor = '#3b82f6',
  unit = '',
  type = 'area',
  showGrid = true,
}) => {
  // Format and downsample data to keep the interface fast
  const formattedData = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Sort chronologically
    const sorted = [...data].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Downsample if data length is huge (e.g., > 48 items) for frontend rendering efficiency
    const downsampled = [];
    const step = Math.max(1, Math.ceil(sorted.length / 48));

    for (let i = 0; i < sorted.length; i += step) {
      const item = sorted[i];
      const timeStr = new Date(item.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      const dateStr = new Date(item.timestamp).toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
      });

      downsampled.push({
        ...item,
        timeLabel: timeStr,
        dateLabel: dateStr,
        displayVal: typeof item[metric] === 'number' ? parseFloat((item[metric] as number).toFixed(2)) : item[metric],
      });
    }

    return downsampled;
  }, [data, metric]);

  const sourceTag = data.length > 0 ? data[data.length - 1].source : 'iot';

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const pData = payload[0].payload;
      return (
        <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg shadow-xl text-xs font-mono text-slate-200">
          <p className="text-slate-400 font-semibold mb-1">{pData.dateLabel} - {pData.timeLabel}</p>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-slate-300 uppercase">{title}:</span>
            <span className="text-white font-bold">
              {payload[0].value} {unit}
            </span>
          </div>
          {pData.source && (
            <p className="text-[10px] text-slate-500 mt-1.5 pt-1 border-t border-slate-800">
              Source: <span className="capitalize">{pData.source}</span>
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  if (formattedData.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 border border-slate-800 bg-slate-900/40 rounded-xl text-xs font-mono text-slate-500">
        NO SENSOR HISTORICAL TELEMETRY FOUND
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col justify-between shadow-md">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title} ({unit})</h4>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-500 font-mono">Current: <b className="text-slate-300">{formattedData[formattedData.length - 1].displayVal} {unit}</b></span>
          <SourceBadge source={sourceTag} />
        </div>
      </div>

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {type === 'area' ? (
            <AreaChart data={formattedData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <defs>
                <linearGradient id={`gradient-${metric}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={gradientColor} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={gradientColor} stopOpacity={0.0} />
                </linearGradient>
              </defs>
              {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />}
              <XAxis
                dataKey="timeLabel"
                stroke="#475569"
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#475569"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                domain={['auto', 'auto']}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="displayVal"
                stroke={color}
                strokeWidth={1.5}
                fillOpacity={1}
                fill={`url(#gradient-${metric})`}
              />
            </AreaChart>
          ) : (
            <LineChart data={formattedData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />}
              <XAxis
                dataKey="timeLabel"
                stroke="#475569"
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#475569"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                domain={['auto', 'auto']}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="displayVal"
                stroke={color}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
};
