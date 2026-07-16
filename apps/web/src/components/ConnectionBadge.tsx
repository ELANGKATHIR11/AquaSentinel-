/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ConnectionStatus } from '../types';

interface ConnectionBadgeProps {
  status: ConnectionStatus;
}

export const ConnectionBadge: React.FC<ConnectionBadgeProps> = ({ status }) => {
  let bg = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  let label = 'Connected';
  let dot = 'bg-emerald-400';

  if (status === 'reconnecting') {
    bg = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    label = 'Reconnecting';
    dot = 'bg-amber-400';
  } else if (status === 'degraded') {
    bg = 'bg-orange-500/10 text-orange-400 border-orange-500/20';
    label = 'Degraded';
    dot = 'bg-orange-400';
  } else if (status === 'offline') {
    bg = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    label = 'Offline';
    dot = 'bg-rose-400';
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium border ${bg}`}>
      <span className={`w-2 h-2 rounded-full ${dot} ${status === 'reconnecting' ? 'animate-ping' : ''}`} />
      {label.toUpperCase()}
    </span>
  );
};
