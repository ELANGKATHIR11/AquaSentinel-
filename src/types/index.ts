/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type SeverityType = 'low' | 'moderate' | 'high' | 'critical';
export type AlertType = 'flood' | 'pollution' | 'device-health' | 'tamper' | 'gateway' | 'calibration';
export type AlertStatus = 'active' | 'acknowledged' | 'resolved';
export type DataSource = 'iot' | 'manual' | 'simulation' | 'import' | 'cached' | 'offline';
export type ConnectionStatus = 'connected' | 'reconnecting' | 'degraded' | 'offline';

export interface Telemetry {
  sensor_id: string;
  gateway_id?: string;
  sequence_no?: number;
  timestamp: string; // ISO-8601 UTC
  latitude: number;
  longitude: number;
  water_level_cm: number;
  ph: number;
  turbidity_ntu: number;
  temperature_c: number;
  tilt_deg: number;
  turbulence_index: number;
  battery_voltage: number;
  solar_voltage?: number;
  rssi: number;
  snr: number;
  fish_activity_index?: number;
  water_health_score: number; // 0-100, transparent formula — NOT official WQI
  flood_risk_score: number; // 0.0 - 1.0, RandomForest prototype model
  pollution_anomaly_score: number; // 0.0 - 1.0, IsolationForest prototype model
  model_version?: string; // e.g. "flood-rf-v1.0"
  quality_flag?: 'good' | 'suspect' | 'bad' | 'missing';
  source: DataSource;
  notes?: string;
}

export interface Sensor {
  sensor_id: string;
  name: string;
  site_id?: string;
  gateway_id?: string;
  status: 'normal' | 'warning' | 'high_risk' | 'critical' | 'offline';
  last_seen: string;
  latitude: number;
  longitude: number;
  battery_voltage: number;
  rssi: number;
  snr: number;
  water_health_score: number;
  flood_risk_score: number;
  pollution_anomaly_score: number;
  source: DataSource;
  is_stale?: boolean; // true if last_seen > 15 min ago
}

export interface Alert {
  id: string;
  sensor_id: string;
  timestamp: string;
  severity: SeverityType;
  type: AlertType;
  summary: string;
  notes?: string;
  status: AlertStatus;
  assignedTo?: string;
  source: DataSource;
  telemetry_snapshot?: Telemetry;
}

export interface CalibrationProfile {
  sensor_id: string;
  ph_offset: number;
  ph_slope: number;
  turbidity_zero_offset: number;
  water_level_offset_cm: number;
  last_calibrated: string;
  operator: string;
  validity_status: 'valid' | 'expired' | 'requires_attention';
}

export interface CalibrationHistoryEntry {
  id: string;
  sensor_id: string;
  timestamp: string;
  ph_offset: number;
  turbidity_zero_offset: number;
  water_level_offset_cm: number;
  operator: string;
  status: string;
}

export interface SimulationScenario {
  id: string;
  name: string;
  description: string;
  type: 'flood' | 'pollution' | 'ph_drop' | 'battery_fail' | 'tilt_tamper' | 'gateway_offline';
  duration_minutes: number;
  intensity: number; // 0.1 to 1.0
  target_sensor: string; // 'all' or specific sensor ID
  status: 'idle' | 'running' | 'completed';
  start_time?: string;
}
