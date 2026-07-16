/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { DataSource } from '../types';

interface SourceBadgeProps {
  source: DataSource;
}

export const SourceBadge: React.FC<SourceBadgeProps> = ({ source }) => {
  let bg = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
  let label = 'Live IoT';

  if (source === 'manual') {
    bg = 'bg-purple-500/10 text-purple-400 border-purple-500/20';
    label = 'Manual Entry';
  } else if (source === 'simulation') {
    bg = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    label = 'Simulation';
  } else if (source === 'cached') {
    bg = 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    label = 'Cached';
  } else if (source === 'offline') {
    bg = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    label = 'Offline Fallback';
  }

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono border ${bg}`}>
      {label}
    </span>
  );
};
