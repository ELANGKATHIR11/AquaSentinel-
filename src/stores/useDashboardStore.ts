/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';
import { Sensor, Telemetry, Alert, CalibrationProfile, CalibrationHistoryEntry, SimulationScenario, ConnectionStatus } from '../types';
import { INITIAL_SENSORS, INITIAL_TELEMETRY, INITIAL_ALERTS, INITIAL_CALIBRATION_PROFILES, INITIAL_CALIBRATION_HISTORY, INITIAL_SCENARIOS, generateRealisticSample } from '../utils/mockData';
import { config } from '../config';

interface DashboardState {
  theme: 'light' | 'dark';
  connectionStatus: ConnectionStatus;
  mockMode: boolean;
  selectedSensorId: string | null;
  selectedSiteId: string; // 'all' or site ID
  sensors: Sensor[];
  telemetryHistory: Record<string, Telemetry[]>; // Map of sensor_id -> Telemetry[] (bounded to 100 elements)
  alerts: Alert[];
  calibrationProfiles: CalibrationProfile[];
  calibrationHistory: CalibrationHistoryEntry[];
  scenarios: SimulationScenario[];
  dateRange: { start: string; end: string } | null;
  mapCenter: [number, number];
  mapZoom: number;
  satelliteLayer: boolean;
  alertZonesLayer: boolean;
  heatmapLayer: boolean;

  // Actions
  toggleTheme: () => void;
  setMockMode: (val: boolean) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setSelectedSensorId: (id: string | null) => void;
  setSelectedSiteId: (id: string) => void;
  addTelemetry: (telemetry: Telemetry) => void;
  addManualTelemetry: (telemetry: Telemetry) => void;
  acknowledgeAlert: (id: string, operatorName?: string) => void;
  resolveAlert: (id: string, notes?: string) => void;
  assignAlert: (id: string, assignee: string) => void;
  addAlert: (alert: Omit<Alert, 'id'>) => void;
  updateCalibrationProfile: (profile: CalibrationProfile) => void;
  addCalibrationHistory: (entry: CalibrationHistoryEntry) => void;
  startScenario: (id: string) => void;
  stopScenario: (id: string) => void;
  tickSimulation: () => void;
  resetAllState: () => void;
  setSatelliteLayer: (val: boolean) => void;
  setAlertZonesLayer: (val: boolean) => void;
  setHeatmapLayer: (val: boolean) => void;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  theme: 'dark',
  connectionStatus: 'connected',
  // mockMode is controlled by VITE_MOCK_MODE env var; defaults to true (offline-safe)
  mockMode: config.mockMode,
  selectedSensorId: null,
  selectedSiteId: 'all',
  sensors: INITIAL_SENSORS,
  telemetryHistory: INITIAL_TELEMETRY,
  alerts: INITIAL_ALERTS,
  calibrationProfiles: INITIAL_CALIBRATION_PROFILES,
  calibrationHistory: INITIAL_CALIBRATION_HISTORY,
  scenarios: INITIAL_SCENARIOS,
  dateRange: null,
  mapCenter: [13.04, 80.20], // Centered around Chennai
  mapZoom: 11,
  satelliteLayer: false,
  alertZonesLayer: true,
  heatmapLayer: false,

  toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
  
  setMockMode: (val) => set({ mockMode: val }),
  
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  
  setSelectedSensorId: (id) => set({ selectedSensorId: id }),
  
  setSatelliteLayer: (val) => set({ satelliteLayer: val }),
  setAlertZonesLayer: (val) => set({ alertZonesLayer: val }),
  setHeatmapLayer: (val) => set({ heatmapLayer: val }),
  
  setSelectedSiteId: (id) => {
    // Zoom/pan map based on selected site or default to Chennai
    let center: [number, number] = [13.04, 80.20];
    let zoom = 11;

    if (id === 'site_adyar') { center = [12.9812, 80.2321]; zoom = 13; }
    else if (id === 'site_cooum') { center = [13.0694, 80.2831]; zoom = 13; }
    else if (id === 'site_chembar') { center = [13.0084, 80.0612]; zoom = 13; }
    else if (id === 'site_kosas') { center = [13.2163, 80.3151]; zoom = 12; }
    else if (id === 'site_buckingham') { center = [13.0291, 80.2643]; zoom = 13; }
    else if (id === 'site_thoothukudi') { center = [8.6012, 78.0135]; zoom = 13; }

    set({ selectedSiteId: id, mapCenter: center, mapZoom: zoom });
  },

  addTelemetry: (tel) => {
    set((state) => {
      const history = state.telemetryHistory[tel.sensor_id] || [];
      // Keep last 100 records
      const newHistory = [...history, tel].slice(-100);

      // Update current sensor specs based on latest reading
      const updatedSensors = state.sensors.map((sensor) => {
        if (sensor.sensor_id === tel.sensor_id) {
          // Status deduction
          let status: Sensor['status'] = 'normal';
          if (tel.water_health_score < 40 || tel.flood_risk_score > 0.8 || tel.pollution_anomaly_score > 0.8) {
            status = 'critical';
          } else if (tel.water_health_score < 65 || tel.flood_risk_score > 0.6 || tel.pollution_anomaly_score > 0.5) {
            status = 'high_risk';
          } else if (tel.water_health_score < 75 || tel.flood_risk_score > 0.4 || tel.pollution_anomaly_score > 0.25) {
            status = 'warning';
          }

          return {
            ...sensor,
            last_seen: tel.timestamp,
            latitude: tel.latitude,
            longitude: tel.longitude,
            battery_voltage: tel.battery_voltage,
            rssi: tel.rssi,
            snr: tel.snr,
            water_health_score: tel.water_health_score,
            flood_risk_score: tel.flood_risk_score,
            pollution_anomaly_score: tel.pollution_anomaly_score,
            status,
            source: tel.source,
          };
        }
        return sensor;
      });

      // Auto-trigger alerts based on new telemetry
      let newAlerts = [...state.alerts];
      if (tel.source !== 'manual') {
        const hasActiveAlertForSensor = state.alerts.some(
          a => a.sensor_id === tel.sensor_id && a.status === 'active' && a.type === 'flood'
        );

        // Flood alert
        if (tel.flood_risk_score >= 0.80 && !hasActiveAlertForSensor) {
          const alertId = `alt_auto_${Date.now()}`;
          const newAlert: Alert = {
            id: alertId,
            sensor_id: tel.sensor_id,
            timestamp: tel.timestamp,
            severity: 'critical',
            type: 'flood',
            summary: `CRITICAL FLOOD RISK: Sensor ${tel.sensor_id} reports water level of ${tel.water_level_cm} cm. Current estimate is 80%+ flood probability.`,
            status: 'active',
            source: tel.source,
            telemetry_snapshot: tel,
          };
          newAlerts = [newAlert, ...newAlerts];
        } else if (tel.flood_risk_score >= 0.55 && !hasActiveAlertForSensor && !state.alerts.some(a => a.sensor_id === tel.sensor_id && a.status === 'active')) {
          const alertId = `alt_auto_${Date.now()}`;
          const newAlert: Alert = {
            id: alertId,
            sensor_id: tel.sensor_id,
            timestamp: tel.timestamp,
            severity: 'high',
            type: 'flood',
            summary: `HIGH WATER WARNING: Sensor ${tel.sensor_id} water level is rising rapidly (${tel.water_level_cm} cm). Risk estimation high.`,
            status: 'active',
            source: tel.source,
            telemetry_snapshot: tel,
          };
          newAlerts = [newAlert, ...newAlerts];
        }

        // Pollution alert
        const hasPollutionAlert = state.alerts.some(
          a => a.sensor_id === tel.sensor_id && a.status === 'active' && a.type === 'pollution'
        );
        if (tel.pollution_anomaly_score >= 0.70 && !hasPollutionAlert) {
          const alertId = `alt_auto_pol_${Date.now()}`;
          const newAlert: Alert = {
            id: alertId,
            sensor_id: tel.sensor_id,
            timestamp: tel.timestamp,
            severity: 'critical',
            type: 'pollution',
            summary: `CRITICAL POLLUTION ANOMALY: Sensor ${tel.sensor_id} reports pH ${tel.ph} and Turbidity ${tel.turbidity_ntu} NTU. High probability of contamination.`,
            status: 'active',
            source: tel.source,
            telemetry_snapshot: tel,
          };
          newAlerts = [newAlert, ...newAlerts];
        }
      }

      return {
        telemetryHistory: {
          ...state.telemetryHistory,
          [tel.sensor_id]: newHistory,
        },
        sensors: updatedSensors,
        alerts: newAlerts,
      };
    });
  },

  addManualTelemetry: (tel) => {
    // Explicitly add manual reading as a distinct source
    const updatedTel = { ...tel, source: 'manual' as const };
    get().addTelemetry(updatedTel);
  },

  acknowledgeAlert: (id, operatorName) => set((state) => ({
    alerts: state.alerts.map((a) => a.id === id ? { 
      ...a, 
      status: 'acknowledged', 
      notes: `${a.notes ? a.notes + ' ' : ''}Acknowledged${operatorName ? ` by ${operatorName}` : ''}.` 
    } : a)
  })),

  resolveAlert: (id, notes) => set((state) => ({
    alerts: state.alerts.map((a) => a.id === id ? { 
      ...a, 
      status: 'resolved', 
      notes: `${a.notes ? a.notes + ' ' : ''}Resolved${notes ? ': ' + notes : '.'}`
    } : a)
  })),

  assignAlert: (id, assignee) => set((state) => ({
    alerts: state.alerts.map((a) => a.id === id ? { ...a, assignedTo: assignee } : a)
  })),

  addAlert: (alert) => set((state) => ({
    alerts: [
      {
        ...alert,
        id: `alt_${Date.now()}`,
      } as Alert,
      ...state.alerts,
    ]
  })),

  updateCalibrationProfile: (profile) => set((state) => {
    const existing = state.calibrationProfiles.some(p => p.sensor_id === profile.sensor_id);
    const updatedProfiles = existing
      ? state.calibrationProfiles.map(p => p.sensor_id === profile.sensor_id ? profile : p)
      : [...state.calibrationProfiles, profile];
    return { calibrationProfiles: updatedProfiles };
  }),

  addCalibrationHistory: (entry) => set((state) => ({
    calibrationHistory: [entry, ...state.calibrationHistory]
  })),

  startScenario: (id) => set((state) => ({
    scenarios: state.scenarios.map((s) => s.id === id ? { ...s, status: 'running', start_time: new Date().toISOString() } : s)
  })),

  stopScenario: (id) => set((state) => ({
    scenarios: state.scenarios.map((s) => s.id === id ? { ...s, status: 'idle' } : s)
  })),

  tickSimulation: () => {
    const { scenarios, sensors, mockMode } = get();
    if (!mockMode) return;

    const activeScenarios = scenarios.filter(s => s.status === 'running');
    if (activeScenarios.length === 0) {
      // Periodic tick of standard noise for active buoys (excluding offline ones)
      sensors.forEach((sensor) => {
        if (sensor.status !== 'offline') {
          const sample = generateRealisticSample(sensor.sensor_id, 'simulation');
          get().addTelemetry(sample);
        }
      });
    } else {
      // Tick with active scenarios running
      sensors.forEach((sensor) => {
        if (sensor.status !== 'offline' || activeScenarios.some(sc => sc.type === 'gateway_offline')) {
          // If gateway offline, let's impact all target sensors
          const isTargeted = activeScenarios.some(sc => sc.target_sensor === 'all' || sc.target_sensor === sensor.sensor_id);
          const sample = generateRealisticSample(sensor.sensor_id, 'simulation', activeScenarios);
          get().addTelemetry(sample);
        }
      });
    }
  },

  resetAllState: () => set({
    sensors: INITIAL_SENSORS,
    telemetryHistory: INITIAL_TELEMETRY,
    alerts: INITIAL_ALERTS,
    calibrationProfiles: INITIAL_CALIBRATION_PROFILES,
    calibrationHistory: INITIAL_CALIBRATION_HISTORY,
    scenarios: INITIAL_SCENARIOS,
    selectedSensorId: null,
    selectedSiteId: 'all',
  }),
}));
