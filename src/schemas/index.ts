/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';

export const TelemetrySchema = z.object({
  sensor_id: z.string().min(1, 'Sensor ID is required'),
  timestamp: z.string().datetime({ message: 'Must be a valid ISO-8601 UTC timestamp' }),
  latitude: z.number().min(-90).max(90, 'Latitude must be between -90 and 90'),
  longitude: z.number().min(-180).max(180, 'Longitude must be between -180 and 180'),
  water_level_cm: z.number().min(0, 'Water level cannot be negative').max(1000, 'Water level cannot exceed 1000 cm'),
  ph: z.number().min(0, 'pH cannot be less than 0').max(14, 'pH cannot exceed 14'),
  turbidity_ntu: z.number().min(0, 'Turbidity cannot be negative').max(1000, 'Turbidity cannot exceed 1000 NTU'),
  temperature_c: z.number().min(-10, 'Temperature too low').max(60, 'Temperature too high'),
  tilt_deg: z.number().min(0, 'Tilt must be positive').max(180, 'Tilt cannot exceed 180 degrees'),
  turbulence_index: z.number().min(0).max(1.0, 'Turbulence must be between 0.0 and 1.0'),
  battery_voltage: z.number().min(0, 'Battery must be positive').max(6.0, 'Battery cannot exceed 6.0 V'),
  rssi: z.number().min(-150, 'RSSI too low').max(0, 'RSSI cannot exceed 0 dBm'),
  snr: z.number().min(-50).max(50, 'SNR too extreme'),
  fish_activity_index: z.number().min(0.0).max(1.0, 'Fish activity must be between 0.0 and 1.0'),
  water_health_score: z.number().int().min(0).max(100),
  flood_risk_score: z.number().min(0.0).max(1.0),
  pollution_anomaly_score: z.number().min(0.0).max(1.0),
  source: z.enum(['iot', 'manual', 'simulation']),
  notes: z.string().optional(),
});

export const ManualInputFormSchema = z.object({
  sensor_id: z.string().min(1, 'Please select or enter a Sensor ID'),
  isNewSensor: z.boolean().default(false),
  custom_sensor_name: z.string().optional(),
  latitude: z.coerce.number().min(12.0, 'Must be within Chennai focus (lat >= 12.0)').max(14.0, 'Must be within Chennai focus (lat <= 14.0)'),
  longitude: z.coerce.number().min(79.5, 'Must be within Chennai focus (lng >= 79.5)').max(81.0, 'Must be within Chennai focus (lng <= 81.0)'),
  water_level_cm: z.coerce.number().min(0, 'Must be >= 0').max(1000, 'Must be <= 1000'),
  ph: z.coerce.number().min(0, 'pH must be >= 0').max(14, 'pH must be <= 14'),
  turbidity_ntu: z.coerce.number().min(0, 'Turbidity must be >= 0').max(1000, 'Turbidity must be <= 1000'),
  temperature_c: z.coerce.number().min(0, 'Temperature must be >= 0').max(50, 'Temperature must be <= 50'),
  tilt_deg: z.coerce.number().min(0, 'Tilt must be >= 0').max(90, 'Tilt must be <= 90'),
  turbulence_index: z.coerce.number().min(0, 'Must be >= 0').max(1, 'Must be <= 1'),
  battery_voltage: z.coerce.number().min(2.5, 'Must be >= 2.5V').max(5.0, 'Must be <= 5.0V'),
  rssi: z.coerce.number().min(-140, 'Must be >= -140 dBm').max(0, 'Must be <= 0 dBm'),
  snr: z.coerce.number().min(-25, 'Must be >= -25').max(20, 'Must be <= 20'),
  fish_activity_index: z.coerce.number().min(0, 'Must be >= 0').max(1, 'Must be <= 1'),
  notes: z.string().max(300, 'Notes must be within 300 characters').optional(),
});

export const CalibrationFormSchema = z.object({
  sensor_id: z.string().min(1, 'Select a sensor'),
  ph_buffer_7: z.coerce.number().min(6.5, 'Buffer 7.0 expected').max(7.5, 'Buffer 7.0 expected'),
  ph_buffer_4: z.coerce.number().min(3.5, 'Buffer 4.0 expected').max(4.5, 'Buffer 4.0 expected'),
  turbidity_distilled_offset: z.coerce.number().min(0, 'Offset must be >= 0').max(10, 'Offset must be <= 10 NTU'),
  ultrasonic_offset_cm: z.coerce.number().min(-50, 'Offset can range from -50cm').max(50, 'Offset can range to 50cm'),
  operator: z.string().min(1, 'Operator name is required'),
});

export const SimulationFormSchema = z.object({
  scenario_id: z.string().min(1, 'Please select a scenario'),
  intensity: z.coerce.number().min(0.1).max(1.0),
  duration_minutes: z.coerce.number().min(1).max(120),
  target_sensor: z.string().min(1),
});
