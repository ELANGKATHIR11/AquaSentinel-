/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Sensor, Telemetry, Alert, CalibrationProfile, CalibrationHistoryEntry, SimulationScenario } from '../types';

// Coordinates centered around Chennai (Adyar, Cooum, Buckingham Canal, Chembarambakkam)
export const RIVER_SITES = [
  { id: 'site_adyar', name: 'Adyar River Basin', description: 'Monitoring southern drainage and bypass overflow' },
  { id: 'site_cooum', name: 'Cooum River Central', description: 'Core urban flow and industrial effluent monitoring' },
  { id: 'site_chembar', name: 'Chembarambakkam Outlet', description: 'Reservoir spillway discharge velocity' },
  { id: 'site_kosas', name: 'Kosasthalaiyar Estuary', description: 'Northern tidal backwater interface' },
  { id: 'site_buckingham', name: 'Buckingham Canal', description: 'Urban runoff and tidal channel flow' },
];

export const INITIAL_SENSORS: Sensor[] = [
  {
    sensor_id: 'AQ001',
    name: 'Adyar Bypass Bridge',
    status: 'warning',
    last_seen: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    latitude: 12.9812,
    longitude: 80.2321,
    battery_voltage: 3.82,
    rssi: -95,
    snr: 4.2,
    water_health_score: 74,
    flood_risk_score: 0.58,
    pollution_anomaly_score: 0.22,
    source: 'iot',
  },
  {
    sensor_id: 'AQ002',
    name: 'Cooum Napier Bridge',
    status: 'normal',
    last_seen: new Date(Date.now() - 1 * 60 * 1000).toISOString(),
    latitude: 13.0694,
    longitude: 80.2831,
    battery_voltage: 4.12,
    rssi: -82,
    snr: 9.8,
    water_health_score: 86,
    flood_risk_score: 0.15,
    pollution_anomaly_score: 0.05,
    source: 'iot',
  },
  {
    sensor_id: 'AQ003',
    name: 'Chembarambakkam Spillway',
    status: 'high_risk',
    last_seen: new Date(Date.now() - 30 * 1000).toISOString(),
    latitude: 13.0084,
    longitude: 80.0612,
    battery_voltage: 3.95,
    rssi: -91,
    snr: 7.1,
    water_health_score: 62,
    flood_risk_score: 0.82,
    pollution_anomaly_score: 0.11,
    source: 'iot',
  },
  {
    sensor_id: 'AQ004',
    name: 'Kosasthalaiyar Ennore',
    status: 'offline',
    last_seen: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
    latitude: 13.2163,
    longitude: 80.3151,
    battery_voltage: 3.21,
    rssi: -121,
    snr: -12.5,
    water_health_score: 45,
    flood_risk_score: 0.45,
    pollution_anomaly_score: 0.19,
    source: 'iot',
  },
  {
    sensor_id: 'AQ005',
    name: 'Buckingham Canal Mylapore',
    status: 'critical',
    last_seen: new Date().toISOString(),
    latitude: 13.0291,
    longitude: 80.2643,
    battery_voltage: 3.42,
    rssi: -108,
    snr: -2.3,
    water_health_score: 31,
    flood_risk_score: 0.42,
    pollution_anomaly_score: 0.88,
    source: 'iot',
  },
];

// Generate 24 hours of telemetry for a sensor
export const generateHistory = (sensorId: string, hours = 24): Telemetry[] => {
  const history: Telemetry[] = [];
  const baseSensor = INITIAL_SENSORS.find((s) => s.sensor_id === sensorId) || INITIAL_SENSORS[0];
  
  let baseWaterLevel = 120.0;
  let basePh = 7.2;
  let baseTurbidity = 5.0;
  let baseTemp = 28.0;

  if (sensorId === 'AQ001') { baseWaterLevel = 190.5; basePh = 6.8; baseTurbidity = 12.0; }
  else if (sensorId === 'AQ002') { baseWaterLevel = 80.2; basePh = 7.4; baseTurbidity = 4.2; }
  else if (sensorId === 'AQ003') { baseWaterLevel = 340.0; basePh = 7.0; baseTurbidity = 6.1; }
  else if (sensorId === 'AQ004') { baseWaterLevel = 110.0; basePh = 6.2; baseTurbidity = 18.0; }
  else if (sensorId === 'AQ005') { baseWaterLevel = 145.0; basePh = 5.1; baseTurbidity = 34.5; }

  const now = Date.now();
  for (let i = hours; i >= 0; i--) {
    const timestamp = new Date(now - i * 60 * 60 * 1000).toISOString();
    // Create random smooth walk
    const noiseFactor = Math.sin((hours - i) / 3.0);
    const water_level = Math.max(10, baseWaterLevel + noiseFactor * 15.0 + (Math.random() - 0.5) * 4);
    const ph = Math.min(14, Math.max(0, basePh + noiseFactor * 0.2 + (Math.random() - 0.5) * 0.1));
    const turbidity_ntu = Math.max(0.1, baseTurbidity + noiseFactor * 3.0 + (Math.random() - 0.5) * 1.5);
    const temperature_c = baseTemp + Math.sin((hours - i) / 12.0 * Math.PI) * 2.0 + (Math.random() - 0.5) * 0.3;
    const tilt_deg = Math.max(0, 2.0 + (Math.random() * 4.0));
    const turbulence_index = Math.max(0, 0.05 + Math.sin((hours - i) / 6.0) * 0.03 + Math.random() * 0.02);
    const battery_voltage = Math.max(3.0, baseSensor.battery_voltage - (hours - i) * 0.005);
    const rssi = baseSensor.rssi + Math.round((Math.random() - 0.5) * 5);
    const snr = baseSensor.snr + (Math.random() - 0.5) * 2;
    const fish_activity_index = Math.max(0, Math.min(1.0, 0.6 + noiseFactor * 0.15 + (Math.random() - 0.5) * 0.1));

    // Dynamic Scores
    const flood_risk_score = Math.min(1.0, Math.max(0.0, (water_level / 400.0) * 0.8 + (turbulence_index * 0.2)));
    const pollution_anomaly_score = Math.min(1.0, Math.max(0.0, 
      (ph < 6.0 || ph > 8.5 ? 0.4 : 0) + 
      (turbidity_ntu > 20.0 ? 0.3 : 0) + 
      (turbulence_index > 0.15 ? 0.2 : 0) + 
      (Math.random() * 0.1)
    ));
    const water_health_score = Math.round(Math.max(0, Math.min(100, 
      100 - (pollution_anomaly_score * 50) - (flood_risk_score * 20) - (ph < 6.5 || ph > 8.0 ? 15 : 0)
    )));

    history.push({
      sensor_id: sensorId,
      timestamp,
      latitude: baseSensor.latitude + (Math.random() - 0.5) * 0.0001,
      longitude: baseSensor.longitude + (Math.random() - 0.5) * 0.0001,
      water_level_cm: parseFloat(water_level.toFixed(1)),
      ph: parseFloat(ph.toFixed(2)),
      turbidity_ntu: parseFloat(turbidity_ntu.toFixed(1)),
      temperature_c: parseFloat(temperature_c.toFixed(1)),
      tilt_deg: parseFloat(tilt_deg.toFixed(1)),
      turbulence_index: parseFloat(turbulence_index.toFixed(2)),
      battery_voltage: parseFloat(battery_voltage.toFixed(2)),
      rssi: Math.round(rssi),
      snr: parseFloat(snr.toFixed(1)),
      fish_activity_index: parseFloat(fish_activity_index.toFixed(2)),
      water_health_score,
      flood_risk_score: parseFloat(flood_risk_score.toFixed(2)),
      pollution_anomaly_score: parseFloat(pollution_anomaly_score.toFixed(2)),
      source: baseSensor.source,
    });
  }
  return history;
};

export const INITIAL_TELEMETRY: Record<string, Telemetry[]> = {
  AQ001: generateHistory('AQ001'),
  AQ002: generateHistory('AQ002'),
  AQ003: generateHistory('AQ003'),
  AQ004: generateHistory('AQ004'),
  AQ005: generateHistory('AQ005'),
};

export const INITIAL_ALERTS: Alert[] = [
  {
    id: 'alt_001',
    sensor_id: 'AQ005',
    timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    severity: 'critical',
    type: 'pollution',
    summary: 'Severe pH drop detected. Current pH 5.1 indicates strong acidic discharge pollution anomaly.',
    notes: 'Informed water board. Upstream inspection underway.',
    status: 'active',
    assignedTo: 'Engineer Ram',
    source: 'iot',
  },
  {
    id: 'alt_002',
    sensor_id: 'AQ003',
    timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    severity: 'high',
    type: 'flood',
    summary: 'Water level exceeded high flood threshold: 340.0 cm. Spillage estimates rising.',
    notes: 'Reservoir spillway gate 2 opened 0.5 meters. Alerting downstream villages.',
    status: 'acknowledged',
    assignedTo: 'Operator Lakshmi',
    source: 'iot',
  },
  {
    id: 'alt_003',
    sensor_id: 'AQ001',
    timestamp: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    severity: 'moderate',
    type: 'flood',
    summary: 'Moderate water rise detected (190.5 cm). Heavy rain runoff contributing.',
    status: 'active',
    source: 'iot',
  },
  {
    id: 'alt_004',
    sensor_id: 'AQ004',
    timestamp: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
    severity: 'low',
    type: 'device-health',
    summary: 'Device battery critical (3.21 V). LoRa RSSI degraded to -121 dBm. Node might offline.',
    status: 'resolved',
    notes: 'Auto-resolved. Node went completely offline.',
    source: 'iot',
  },
];

export const INITIAL_CALIBRATION_PROFILES: CalibrationProfile[] = [
  {
    sensor_id: 'AQ001',
    ph_offset: 0.12,
    ph_slope: 1.01,
    turbidity_zero_offset: 0.35,
    water_level_offset_cm: -2.5,
    last_calibrated: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
    operator: 'Tech Vignesh',
    validity_status: 'valid',
  },
  {
    sensor_id: 'AQ002',
    ph_offset: -0.05,
    ph_slope: 0.99,
    turbidity_zero_offset: 0.12,
    water_level_offset_cm: 0.0,
    last_calibrated: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
    operator: 'Operator Lakshmi',
    validity_status: 'valid',
  },
  {
    sensor_id: 'AQ003',
    ph_offset: 0.21,
    ph_slope: 1.03,
    turbidity_zero_offset: 0.84,
    water_level_offset_cm: 10.5,
    last_calibrated: new Date(Date.now() - 85 * 24 * 3600 * 1000).toISOString(),
    operator: 'Tech Vignesh',
    validity_status: 'requires_attention',
  },
  {
    sensor_id: 'AQ004',
    ph_offset: 0.0,
    ph_slope: 1.0,
    turbidity_zero_offset: 1.1,
    water_level_offset_cm: -12.0,
    last_calibrated: new Date(Date.now() - 190 * 24 * 3600 * 1000).toISOString(),
    operator: 'System Default',
    validity_status: 'expired',
  },
  {
    sensor_id: 'AQ005',
    ph_offset: -0.32,
    ph_slope: 0.95,
    turbidity_zero_offset: 0.44,
    water_level_offset_cm: 1.2,
    last_calibrated: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString(),
    operator: 'Operator Lakshmi',
    validity_status: 'valid',
  },
];

export const INITIAL_CALIBRATION_HISTORY: CalibrationHistoryEntry[] = [
  {
    id: 'cal_001',
    sensor_id: 'AQ001',
    timestamp: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
    ph_offset: 0.12,
    turbidity_zero_offset: 0.35,
    water_level_offset_cm: -2.5,
    operator: 'Tech Vignesh',
    status: 'Completed',
  },
  {
    id: 'cal_002',
    sensor_id: 'AQ002',
    timestamp: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
    ph_offset: -0.05,
    turbidity_zero_offset: 0.12,
    water_level_offset_cm: 0.0,
    operator: 'Operator Lakshmi',
    status: 'Completed',
  },
];

export const INITIAL_SCENARIOS: SimulationScenario[] = [
  {
    id: 'scen_flood',
    name: 'Rising Water / Flash Flood Scenario',
    description: 'Simulates heavy upstream rainfall leading to a rapid water level increase and turbulence spikes.',
    type: 'flood',
    duration_minutes: 10,
    intensity: 0.8,
    target_sensor: 'AQ001',
    status: 'idle',
  },
  {
    id: 'scen_turb',
    name: 'High Turbidity / Sediment Spill',
    description: 'Simulates heavy construction discharge, dredging, or bank erosion causing massive NTU turbidity increases.',
    type: 'pollution',
    duration_minutes: 8,
    intensity: 0.7,
    target_sensor: 'AQ002',
    status: 'idle',
  },
  {
    id: 'scen_ph',
    name: 'Sudden pH Drop / Acidic Pollution',
    description: 'Simulates an illegal industrial chemical release causing water pH to quickly drop to hazardous acidic levels.',
    type: 'ph_drop',
    duration_minutes: 5,
    intensity: 0.9,
    target_sensor: 'AQ005',
    status: 'idle',
  },
  {
    id: 'scen_batt',
    name: 'Sensor Battery & LoRa Loss',
    description: 'Simulates solar panel occlusion or internal short causing battery drain and gradual communication packets decay.',
    type: 'battery_fail',
    duration_minutes: 15,
    intensity: 0.5,
    target_sensor: 'AQ003',
    status: 'idle',
  },
  {
    id: 'scen_tilt',
    name: 'Buoy Tilt / Tamper Event',
    description: 'Simulates river debris collision, high waves, or human tampering tipping the buoy past critical angles.',
    type: 'tilt_tamper',
    duration_minutes: 5,
    intensity: 1.0,
    target_sensor: 'AQ002',
    status: 'idle',
  },
  {
    id: 'scen_gw',
    name: 'Gateway Offline Outage',
    description: 'Simulates a central LoRa Gateway power failure, setting multiple nodes in the sector to offline status.',
    type: 'gateway_offline',
    duration_minutes: 12,
    intensity: 1.0,
    target_sensor: 'all',
    status: 'idle',
  },
];

// River Polygons for visual overlays
export const SITE_POLYGONS = [
  {
    name: 'Adyar Basin Boundary',
    color: '#3b82f6',
    coordinates: [
      [12.992, 80.200],
      [12.990, 80.250],
      [12.970, 80.260],
      [12.965, 80.220],
      [12.992, 80.200]
    ] as [number, number][]
  },
  {
    name: 'Cooum Industrial Zone',
    color: '#eab308',
    coordinates: [
      [13.075, 80.250],
      [13.072, 80.292],
      [13.060, 80.295],
      [13.062, 80.245],
      [13.075, 80.250]
    ] as [number, number][]
  },
  {
    name: 'Spillway Impact Sector',
    color: '#ef4444',
    coordinates: [
      [13.020, 80.050],
      [13.015, 80.080],
      [12.995, 80.080],
      [13.000, 80.040],
      [13.020, 80.050]
    ] as [number, number][]
  }
];

// Helper to generate next telemetry sample for a sensor, considering any active scenario modifications
export function generateRealisticSample(
  sensorId: string,
  source: 'iot' | 'manual' | 'simulation' = 'iot',
  activeScenarios: SimulationScenario[] = []
): Telemetry {
  const baseSensor = INITIAL_SENSORS.find((s) => s.sensor_id === sensorId) || INITIAL_SENSORS[0];
  const activeScen = activeScenarios.find(s => s.status === 'running' && (s.target_sensor === 'all' || s.target_sensor === sensorId));

  let water_level_cm = 120.0 + (Math.random() - 0.5) * 5;
  let ph = 7.2 + (Math.random() - 0.5) * 0.1;
  let turbidity_ntu = 4.5 + (Math.random() - 0.5) * 1;
  let temperature_c = 27.5 + (Math.random() - 0.5) * 0.4;
  let tilt_deg = 1.5 + Math.random() * 2;
  let turbulence_index = 0.06 + Math.random() * 0.02;
  let battery_voltage = baseSensor.battery_voltage;
  let rssi = baseSensor.rssi;
  let snr = baseSensor.snr;
  let fish_activity_index = 0.7 + (Math.random() - 0.5) * 0.1;

  // Apply base presets based on sensorId
  if (sensorId === 'AQ001') { water_level_cm = 185.0; ph = 6.9; turbidity_ntu = 11.5; }
  else if (sensorId === 'AQ002') { water_level_cm = 78.5; ph = 7.35; turbidity_ntu = 4.0; }
  else if (sensorId === 'AQ003') { water_level_cm = 320.0; ph = 7.1; turbidity_ntu = 5.8; }
  else if (sensorId === 'AQ004') { water_level_cm = 105.0; ph = 6.4; turbidity_ntu = 16.5; }
  else if (sensorId === 'AQ005') { water_level_cm = 142.0; ph = 5.3; turbidity_ntu = 32.0; }

  // Apply scenario modifications
  if (activeScen) {
    const intensity = activeScen.intensity;
    switch (activeScen.type) {
      case 'flood':
        water_level_cm += 120.0 * intensity;
        turbulence_index += 0.15 * intensity;
        turbidity_ntu += 15.0 * intensity;
        tilt_deg += 5.0 * intensity;
        fish_activity_index = Math.max(0.1, fish_activity_index - 0.4 * intensity);
        break;
      case 'pollution':
        turbidity_ntu += 60.0 * intensity;
        fish_activity_index = Math.max(0.1, fish_activity_index - 0.5 * intensity);
        break;
      case 'ph_drop':
        ph -= 2.5 * intensity;
        ph = Math.max(2.5, ph);
        fish_activity_index = Math.max(0.05, fish_activity_index - 0.6 * intensity);
        break;
      case 'battery_fail':
        battery_voltage -= 0.8 * intensity;
        battery_voltage = Math.max(2.9, battery_voltage);
        rssi -= 20;
        snr -= 10;
        break;
      case 'tilt_tamper':
        tilt_deg += 35.0 * intensity;
        turbulence_index += 0.1 * intensity;
        break;
      case 'gateway_offline':
        rssi = -140;
        snr = -20;
        break;
    }
  }

  // Cap bounds
  ph = parseFloat(Math.min(14, Math.max(0, ph)).toFixed(2));
  water_level_cm = parseFloat(Math.max(0, water_level_cm).toFixed(1));
  turbidity_ntu = parseFloat(Math.max(0, turbidity_ntu).toFixed(1));
  temperature_c = parseFloat(temperature_c.toFixed(1));
  tilt_deg = parseFloat(Math.max(0, tilt_deg).toFixed(1));
  turbulence_index = parseFloat(Math.max(0, turbulence_index).toFixed(2));
  battery_voltage = parseFloat(Math.min(4.2, Math.max(0, battery_voltage)).toFixed(2));
  fish_activity_index = parseFloat(Math.max(0, Math.min(1.0, fish_activity_index)).toFixed(2));

  // Recalculate indicators
  const flood_risk_score = parseFloat(Math.min(1.0, Math.max(0.0, (water_level_cm / 400.0) * 0.8 + (turbulence_index * 0.2))).toFixed(2));
  const pollution_anomaly_score = parseFloat(Math.min(1.0, Math.max(0.0, 
    (ph < 6.0 || ph > 8.5 ? 0.4 : 0) + 
    (turbidity_ntu > 20.0 ? 0.35 : 0) + 
    (turbulence_index > 0.15 ? 0.15 : 0) + 
    (Math.random() * 0.1)
  )).toFixed(2));
  
  const water_health_score = Math.round(Math.max(0, Math.min(100, 
    100 - (pollution_anomaly_score * 55) - (flood_risk_score * 25) - (ph < 6.5 || ph > 8.0 ? 15 : 0)
  )));

  return {
    sensor_id: sensorId,
    timestamp: new Date().toISOString(),
    latitude: baseSensor.latitude + (Math.random() - 0.5) * 0.0001,
    longitude: baseSensor.longitude + (Math.random() - 0.5) * 0.0001,
    water_level_cm,
    ph,
    turbidity_ntu,
    temperature_c,
    tilt_deg,
    turbulence_index,
    battery_voltage,
    rssi: Math.round(rssi),
    snr: parseFloat(snr.toFixed(1)),
    fish_activity_index,
    water_health_score,
    flood_risk_score,
    pollution_anomaly_score,
    source,
  };
}
