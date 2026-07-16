/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { LucideIcon } from 'lucide-react';
import { DataSource } from '../types';
import { SourceBadge } from './SourceBadge';

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  subtext?: string;
  trend?: {
    value: string | number;
    isPositive: boolean;
  };
  source: DataSource;
  status?: 'normal' | 'warning' | 'danger';
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  icon: Icon,
  subtext,
  trend,
  source,
  status = 'normal',
}) => {
  let statusBorder = 'border-slate-800';
  if (status === 'warning') statusBorder = 'border-amber-500/30 bg-amber-500/5';
  else if (status === 'danger') statusBorder = 'border-rose-500/30 bg-rose-500/5';

  return (
    <div className={`p-5 rounded-lg border bg-slate-900 flex flex-col justify-between shadow-md transition-all duration-200 hover:border-slate-700 ${statusBorder}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">{label}</p>
          <h3 className="text-2xl font-semibold text-white font-mono mt-1.5">{value}</h3>
        </div>
        <div className={`p-2 rounded ${status === 'danger' ? 'bg-rose-500/10 text-rose-400' : status === 'warning' ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-800 text-slate-400'}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-800">
        <div className="flex items-center gap-1.5">
          {trend && (
            <span className={`text-xs font-mono font-medium ${trend.isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
              {trend.isPositive ? '▲' : '▼'} {trend.value}
            </span>
          )}
          {subtext && <span className="text-xs text-slate-500">{subtext}</span>}
        </div>
        <SourceBadge source={source} />
      </div>
    </div>
  );
};
