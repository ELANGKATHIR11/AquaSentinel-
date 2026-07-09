/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { StatusBadge } from '../../components/StatusBadge';
import { SourceBadge } from '../../components/SourceBadge';
import { ConfirmDialog } from '../../components/DashboardUtilities';
import { ChartPanel } from '../../components/ChartPanel';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  User,
  SlidersHorizontal,
  ChevronRight,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';
import { Alert, SeverityType, AlertType, AlertStatus } from '../../types';

export const AlertsPage: React.FC = () => {
  const {
    alerts,
    acknowledgeAlert,
    resolveAlert,
    assignAlert,
    telemetryHistory,
  } = useDashboardStore();

  // Filters State
  const [filterSeverity, setFilterSeverity] = useState<SeverityType | 'all'>('all');
  const [filterType, setFilterType] = useState<AlertType | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<AlertStatus | 'all'>('all');

  // Interactive Selection Drawer
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);

  // Dialog State
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    type: 'ack' | 'resolve';
    alertId: string;
  }>({
    isOpen: false,
    type: 'ack',
    alertId: '',
  });

  const selectedAlert = useMemo(() => {
    return alerts.find(a => a.id === selectedAlertId) || null;
  }, [alerts, selectedAlertId]);

  const relatedTelemetry = useMemo(() => {
    if (!selectedAlert) return [];
    return telemetryHistory[selectedAlert.sensor_id] || [];
  }, [selectedAlert, telemetryHistory]);

  // Compute filtered alerts
  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      if (filterSeverity !== 'all' && alert.severity !== filterSeverity) return false;
      if (filterType !== 'all' && alert.type !== filterType) return false;
      if (filterStatus !== 'all' && alert.status !== filterStatus) return false;
      return true;
    });
  }, [alerts, filterSeverity, filterType, filterStatus]);

  const openConfirm = (type: 'ack' | 'resolve', alertId: string) => {
    setConfirmState({
      isOpen: true,
      type,
      alertId,
    });
  };

  const handleConfirmAction = () => {
    const { type, alertId } = confirmState;
    if (type === 'ack') {
      acknowledgeAlert(alertId, 'Duty Engineer Lakshmi');
    } else if (type === 'resolve') {
      resolveAlert(alertId, 'Conditions stabilized. Manual field investigation completed.');
    }
    setConfirmState({ isOpen: false, type: 'ack', alertId: '' });
  };

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col md:flex-row gap-5 animate-in fade-in duration-300 text-xs font-mono text-zinc-300">
      
      {/* Left List Pane: Filter and Table list */}
      <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-1">
        
        {/* Title */}
        <div>
          <h2 className="text-xl font-bold text-zinc-100 font-sans tracking-tight">Disaster & Operations Alerts</h2>
          <p className="text-xs text-zinc-500 font-mono mt-0.5">REAL-TIME FLOOD OVERFLOWS AND POLLUTION DISCHARGE WARNING INTELLIGENCE</p>
        </div>

        {/* Filters Panel */}
        <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-lg flex flex-wrap items-center gap-4 shadow-md">
          <div className="flex items-center gap-1.5 text-zinc-400">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Operational Filters:</span>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-zinc-500 text-[10px]">Severity:</label>
            <select
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value as any)}
              className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 py-1 rounded text-xs"
            >
              <option value="all">ALL SEVERITIES</option>
              <option value="critical">CRITICAL</option>
              <option value="high">HIGH</option>
              <option value="moderate">MODERATE</option>
              <option value="low">LOW</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-zinc-500 text-[10px]">Event Type:</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 py-1 rounded text-xs"
            >
              <option value="all">ALL TYPES</option>
              <option value="flood">FLOOD RISK</option>
              <option value="pollution">POLLUTION</option>
              <option value="device-health">DEVICE HEALTH</option>
              <option value="tamper">TAMPER</option>
              <option value="gateway">GATEWAY STATUS</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-zinc-500 text-[10px]">Status:</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 py-1 rounded text-xs"
            >
              <option value="all">ALL STATES</option>
              <option value="active">ACTIVE</option>
              <option value="acknowledged">ACKNOWLEDGED</option>
              <option value="resolved">RESOLVED</option>
            </select>
          </div>
        </div>

        {/* Alerts table list layout */}
        <div className="flex flex-col gap-2">
          {filteredAlerts.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-zinc-900 bg-zinc-950/40 rounded-lg text-zinc-500 font-mono text-xs">
              NO DISASTER OPERATIONS ALERTS RECORDED UNDER ACTIVE FILTERS
            </div>
          ) : (
            filteredAlerts.map((alert) => {
              const isActive = alert.id === selectedAlertId;
              const isCritical = alert.severity === 'critical';
              const isHigh = alert.severity === 'high';

              let cardBg = 'bg-zinc-950/60 border-zinc-900 text-zinc-300';
              if (alert.status === 'active') {
                if (isCritical) cardBg = 'bg-rose-950/10 border-rose-900/40 text-rose-300';
                else if (isHigh) cardBg = 'bg-orange-950/10 border-orange-900/40 text-orange-300';
                else cardBg = 'bg-amber-950/5 border-amber-900/30 text-amber-300';
              } else if (alert.status === 'resolved') {
                cardBg = 'bg-zinc-950/30 border-zinc-950 text-zinc-500';
              }

              return (
                <div
                  key={alert.id}
                  onClick={() => setSelectedAlertId(alert.id)}
                  className={`p-4 border rounded-lg cursor-pointer transition-all hover:border-zinc-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${cardBg} ${
                    isActive ? 'ring-1 ring-zinc-600 border-zinc-600' : ''
                  }`}
                >
                  <div className="flex items-start gap-3.5 flex-1">
                    <div className="p-2 bg-zinc-900/50 rounded-md border border-zinc-800 flex-shrink-0">
                      <AlertTriangle className={`w-4 h-4 ${
                        isCritical ? 'text-rose-400' : isHigh ? 'text-orange-400' : 'text-amber-400'
                      }`} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-zinc-200 text-xs">{alert.sensor_id}</span>
                        <span className="text-zinc-500 text-[10px]">•</span>
                        <span className="text-[10px] text-zinc-500">{new Date(alert.timestamp).toLocaleString()}</span>
                        <SourceBadge source={alert.source} />
                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono capitalize border ${
                          alert.severity === 'critical' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                          alert.severity === 'high' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                          'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                        }`}>
                          {alert.severity.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-zinc-300 text-[11px] leading-relaxed font-sans">{alert.summary}</p>
                      {alert.assignedTo && (
                        <div className="flex items-center gap-1 text-[10px] text-zinc-500 font-mono mt-1">
                          <User className="w-3 h-3" />
                          <span>Assigned responder: <b className="text-zinc-400">{alert.assignedTo}</b></span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 flex-shrink-0">
                    <div className="flex flex-col items-end gap-1.5 sm:mr-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono capitalize font-semibold border ${
                        alert.status === 'active' ? 'bg-rose-500/10 text-rose-400 border-rose-500/35' :
                        alert.status === 'acknowledged' ? 'bg-blue-500/10 text-blue-400 border-blue-500/35' :
                        'bg-zinc-800 text-zinc-500 border-zinc-900'
                      }`}>
                        {alert.status.toUpperCase()}
                      </span>
                    </div>

                    <ChevronRight className="w-4 h-4 text-zinc-600" />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Drawer: Active Alert diagnostics inspector with mini charts */}
      {selectedAlert && (
        <div className="w-full md:w-96 flex flex-col gap-4 border border-zinc-900 bg-zinc-950 p-5 rounded-lg shadow-2xl overflow-y-auto">
          
          <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
            <div>
              <p className="text-[10px] text-zinc-500 font-bold uppercase">ALERT INVESTIGATOR</p>
              <h3 className="text-sm font-extrabold text-zinc-100 font-sans mt-0.5">{selectedAlert.id.toUpperCase()}</h3>
            </div>
            <button
              onClick={() => setSelectedAlertId(null)}
              className="text-zinc-500 hover:text-zinc-300 cursor-pointer text-xs"
            >
              CLOSE [X]
            </button>
          </div>

          <div className="flex flex-col gap-3 font-sans">
            <div>
              <span className="text-[10px] text-zinc-500 font-mono block uppercase">Alert Summary Details</span>
              <p className="text-zinc-200 text-xs mt-1 leading-relaxed">{selectedAlert.summary}</p>
            </div>

            {selectedAlert.notes && (
              <div className="p-3 bg-zinc-900/50 rounded border border-zinc-900/80 mt-1">
                <span className="text-[10px] text-zinc-500 font-mono block uppercase">Resolution Log Notes</span>
                <p className="text-zinc-400 text-xs mt-1 font-mono italic">"{selectedAlert.notes}"</p>
              </div>
            )}
          </div>

          {/* Render contextual graph for the alert's buoy */}
          <div className="mt-2 flex-1 flex flex-col gap-4">
            <h4 className="text-[10px] text-zinc-500 font-bold uppercase border-b border-zinc-900 pb-1 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-zinc-400" />
              Related Buoy telemetry ({selectedAlert.sensor_id})
            </h4>

            <div className="h-44 w-full">
              <ChartPanel
                title={selectedAlert.type === 'pollution' ? 'Turbidity (NTU)' : 'Water Level (cm)'}
                data={relatedTelemetry}
                metric={selectedAlert.type === 'pollution' ? 'turbidity_ntu' : 'water_level_cm'}
                color={selectedAlert.type === 'pollution' ? '#eab308' : '#3b82f6'}
                gradientColor={selectedAlert.type === 'pollution' ? '#eab308' : '#3b82f6'}
                unit={selectedAlert.type === 'pollution' ? 'NTU' : 'cm'}
                showGrid={false}
              />
            </div>

            {/* Quick Actions overlay */}
            <div className="flex flex-col gap-2 pt-4 border-t border-zinc-900 mt-auto font-mono">
              <span className="text-[10px] text-zinc-500 font-bold uppercase">Responder Actions</span>
              
              {selectedAlert.status === 'active' && (
                <button
                  onClick={() => openConfirm('ack', selectedAlert.id)}
                  className="w-full text-center py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-xs rounded transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5"
                >
                  <Clock className="w-3.5 h-3.5" />
                  Acknowledge Alert
                </button>
              )}

              {selectedAlert.status !== 'resolved' && (
                <button
                  onClick={() => openConfirm('resolve', selectedAlert.id)}
                  className="w-full text-center py-2 bg-zinc-100 hover:bg-white text-zinc-950 font-bold text-xs rounded transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Mark as Resolved
                </button>
              )}

              {selectedAlert.status === 'resolved' && (
                <div className="flex items-center gap-1.5 p-3 rounded border border-emerald-950/40 bg-emerald-950/10 text-emerald-400 text-[11px] font-sans">
                  <ShieldCheck className="w-4 h-4 flex-shrink-0" />
                  <span>This alert incident has been fully audited, resolved, and closed in compliance with river operations codes.</span>
                </div>
              )}
            </div>
          </div>

        </div>
      )}

      {/* Confirmation Dialog overlays */}
      <ConfirmDialog
        isOpen={confirmState.isOpen}
        title={confirmState.type === 'ack' ? 'Acknowledge Alert incident?' : 'Resolve Operations Alert?'}
        description={
          confirmState.type === 'ack'
            ? 'This registers you as the primary engineer on duty investigating this buoy. It will change status from ACTIVE to ACKNOWLEDGED.'
            : 'Are you sure the river sensor indices have stabilized and any upstream effluent or flash water has cleared? This will permanently close the alert.'
        }
        confirmLabel={confirmState.type === 'ack' ? 'Assign & Acknowledge' : 'Resolve Incident'}
        cancelLabel="Discard"
        severity={confirmState.type === 'resolve' ? 'normal' : 'normal'}
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmState({ isOpen: false, type: 'ack', alertId: '' })}
      />

    </div>
  );
};
