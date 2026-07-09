/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface StatusBadgeProps {
  status: 'normal' | 'warning' | 'high_risk' | 'critical' | 'offline' | string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  let bg = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  let label = 'Normal';
  let dot = 'bg-emerald-400';

  if (status === 'warning') {
    bg = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    label = 'Warning';
    dot = 'bg-amber-400';
  } else if (status === 'high_risk' || status === 'high') {
    bg = 'bg-orange-500/10 text-orange-400 border-orange-500/20';
    label = 'High Risk';
    dot = 'bg-orange-400';
  } else if (status === 'critical') {
    bg = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    label = 'Critical';
    dot = 'bg-rose-400';
  } else if (status === 'offline') {
    bg = 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    label = 'Offline';
    dot = 'bg-slate-400';
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot} animate-pulse`} />
      {label}
    </span>
  );
};
