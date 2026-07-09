/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { ManualInputFormSchema, TelemetrySchema } from '../../schemas';
import { api, API_BASE_URL } from '../../services/api';
import { generateRealisticSample } from '../../utils/mockData';
import {
  FileText,
  Upload,
  Database,
  CheckCircle,
  AlertCircle,
  Sparkles,
  Info,
  Layers,
} from 'lucide-react';
import { Telemetry } from '../../types';

export const ManualInputPage: React.FC = () => {
  const { sensors, addManualTelemetry } = useDashboardStore();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // CSV State
  const [csvPreview, setCsvPreview] = useState<any[]>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [csvFile, setCsvFile] = useState<File | null>(null);

  // react-hook-form Setup
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(ManualInputFormSchema),
    defaultValues: {
      sensor_id: 'AQ001',
      isNewSensor: false,
      custom_sensor_name: '',
      latitude: 12.9812,
      longitude: 80.2321,
      water_level_cm: 120.0,
      ph: 7.20,
      turbidity_ntu: 5.0,
      temperature_c: 28.0,
      tilt_deg: 1.5,
      turbulence_index: 0.05,
      battery_voltage: 3.90,
      rssi: -90,
      snr: 8.0,
      fish_activity_index: 0.70,
      notes: '',
    },
  });

  const selectedSensorId = watch('sensor_id');
  const isNewSensorActive = watch('isNewSensor');

  // Sync coordinates when selecting existing buoy
  React.useEffect(() => {
    if (!isNewSensorActive) {
      const match = sensors.find(s => s.sensor_id === selectedSensorId);
      if (match) {
        setValue('latitude', match.latitude);
        setValue('longitude', match.longitude);
        setValue('ph', parseFloat(match.water_health_score > 75 ? '7.3' : '5.8'));
        setValue('water_level_cm', parseFloat(match.flood_risk_score > 0.6 ? '280' : '110'));
      }
    }
  }, [selectedSensorId, isNewSensorActive, sensors, setValue]);

  // Generate realistic sample values dynamically
  const handlePrepopulate = () => {
    const targetId = isNewSensorActive ? 'AQ001' : selectedSensorId;
    const sample = generateRealisticSample(targetId, 'manual');
    
    setValue('latitude', sample.latitude);
    setValue('longitude', sample.longitude);
    setValue('water_level_cm', sample.water_level_cm);
    setValue('ph', sample.ph);
    setValue('turbidity_ntu', sample.turbidity_ntu);
    setValue('temperature_c', sample.temperature_c);
    setValue('tilt_deg', sample.tilt_deg);
    setValue('turbulence_index', sample.turbulence_index);
    setValue('battery_voltage', sample.battery_voltage);
    setValue('rssi', sample.rssi);
    setValue('snr', sample.snr);
    setValue('fish_activity_index', sample.fish_activity_index);
    setValue('notes', 'PRE-POPULATED HIGH FIDELITY SIMULATION TEMPLATE');
  };

  // Watch form inputs for live risk estimation
  const phVal = watch('ph');
  const turbidityVal = watch('turbidity_ntu');
  const tempVal = watch('temperature_c');
  const waterLevelVal = watch('water_level_cm');
  const fishActivityVal = watch('fish_activity_index');

  const [predictions, setPredictions] = useState<{
    flood_probability: number;
    flood_risk_level: string;
    pollution_anomaly_probability: number;
    is_anomaly: boolean;
  } | null>(null);

  React.useEffect(() => {
    const fetchPredictions = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/models/predict`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ph: parseFloat(phVal as any) || 7.0,
            turbidity: parseFloat(turbidityVal as any) || 10.0,
            temperature: parseFloat(tempVal as any) || 25.0,
            water_level: (parseFloat(waterLevelVal as any) || 120.0) / 100.0, // convert cm to meters
            fish_activity_index: parseFloat(fishActivityVal as any) || 0.8,
            rainfall_mm: 0.0,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setPredictions(data);
        }
      } catch (err) {
        console.warn('Failed to fetch real-time prediction:', err);
      }
    };

    const timer = setTimeout(fetchPredictions, 300);
    return () => clearTimeout(timer);
  }, [phVal, turbidityVal, tempVal, waterLevelVal, fishActivityVal]);

  // Submit manual form reading
  const onSubmitForm = async (data: any) => {
    setSuccessMessage(null);
    setErrorMessage(null);

    const telemetryPayload: Telemetry = {
      sensor_id: data.isNewSensor ? (data.custom_sensor_name || `AQ_NEW_${Date.now()}`) : data.sensor_id,
      timestamp: new Date().toISOString(),
      latitude: Number(data.latitude),
      longitude: Number(data.longitude),
      water_level_cm: Number(data.water_level_cm),
      ph: Number(data.ph),
      turbidity_ntu: Number(data.turbidity_ntu),
      temperature_c: Number(data.temperature_c),
      tilt_deg: Number(data.tilt_deg),
      turbulence_index: Number(data.turbulence_index),
      battery_voltage: Number(data.battery_voltage),
      rssi: Number(data.rssi),
      snr: Number(data.snr),
      fish_activity_index: Number(data.fish_activity_index),
      water_health_score: 100, // API or store computes score automatically
      flood_risk_score: 0,
      pollution_anomaly_score: 0,
      source: 'manual',
      notes: data.notes || '',
    };

    try {
      // Direct call to API service
      await api.postManualTelemetry(telemetryPayload);
      setSuccessMessage(`Successfully registered manual telemetry packet for ${telemetryPayload.sensor_id}. State caches refreshed.`);
      reset({
        ...data,
        notes: '',
      });
    } catch (e) {
      setErrorMessage('Failed to submit manual reading. Please verify network or database.');
    }
  };

  // Drag and drop CSV parser
  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFile(file);
    setCsvErrors([]);
    setCsvPreview([]);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length < 2) {
          setCsvErrors(['CSV requires at least a header row and 1 data row']);
          return;
        }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const validRows: Telemetry[] = [];
        const errorsList: string[] = [];

        for (let i = 1; i < lines.length; i++) {
          const vals = lines[i].split(',').map(v => v.trim());
          if (vals.length !== headers.length) {
            errorsList.push(`Line ${i + 1}: Column count mismatch`);
            continue;
          }

          // Simple column matcher
          const obj: any = {
            sensor_id: vals[headers.indexOf('sensor_id')] || 'AQ001',
            timestamp: vals[headers.indexOf('timestamp')] || new Date().toISOString(),
            latitude: parseFloat(vals[headers.indexOf('latitude')] || '12.98'),
            longitude: parseFloat(vals[headers.indexOf('longitude')] || '80.23'),
            water_level_cm: parseFloat(vals[headers.indexOf('water_level_cm')] || '100'),
            ph: parseFloat(vals[headers.indexOf('ph')] || '7.0'),
            turbidity_ntu: parseFloat(vals[headers.indexOf('turbidity_ntu')] || '5.0'),
            temperature_c: parseFloat(vals[headers.indexOf('temperature_c')] || '27.0'),
            tilt_deg: parseFloat(vals[headers.indexOf('tilt_deg')] || '1.0'),
            turbulence_index: parseFloat(vals[headers.indexOf('turbulence_index')] || '0.05'),
            battery_voltage: parseFloat(vals[headers.indexOf('battery_voltage')] || '3.8'),
            rssi: parseInt(vals[headers.indexOf('rssi')] || '-90'),
            snr: parseFloat(vals[headers.indexOf('snr')] || '8.0'),
            fish_activity_index: parseFloat(vals[headers.indexOf('fish_activity_index')] || '0.7'),
            water_health_score: 80,
            flood_risk_score: 0.1,
            pollution_anomaly_score: 0.1,
            source: 'manual' as const,
          };

          // Zod strict validate
          const valResult = TelemetrySchema.safeParse(obj);
          if (valResult.success) {
            validRows.push(valResult.data as Telemetry);
          } else {
            const formattedErr = valResult.error.issues.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
            errorsList.push(`Row ${i + 1} (${obj.sensor_id}): ${formattedErr}`);
          }
        }

        setCsvErrors(errorsList);
        setCsvPreview(validRows);
      } catch (err) {
        setCsvErrors(['Failed to read or parse file string']);
      }
    };
    reader.readAsText(file);
  };

  const submitBatchCsv = () => {
    if (csvPreview.length === 0) return;
    csvPreview.forEach(tel => {
      addManualTelemetry(tel);
    });
    setSuccessMessage(`Successfully uploaded batch of ${csvPreview.length} verified telemetry rows.`);
    setCsvPreview([]);
    setCsvFile(null);
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300 font-mono text-xs text-zinc-300">
      
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-zinc-100 font-sans tracking-tight">Manual Telemetry Console</h2>
        <p className="text-xs text-zinc-500 font-mono mt-0.5">MANUAL FIELD CALIBRATIONS AND EMERGENCY TELEMETRY SUBMISSION</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Form Panel */}
        <div className="lg:col-span-2 bg-zinc-950 border border-zinc-900 rounded-lg p-5 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-zinc-900 pb-3 mb-5">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-purple-400" />
                <h3 className="text-xs font-bold uppercase text-zinc-100 font-sans">Submit Manual Buoy Reading</h3>
              </div>
              
              <button
                type="button"
                onClick={handlePrepopulate}
                className="flex items-center gap-1 px-2 py-1 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 rounded text-[10px] text-purple-300 cursor-pointer font-bold animate-pulse"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Generate Realistic Sample
              </button>
            </div>

            {/* Success/Error Feed */}
            {successMessage && (
              <div className="mb-4 p-3 bg-emerald-950/10 border border-emerald-900/40 rounded flex items-center gap-2.5 text-emerald-400">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}
            {errorMessage && (
              <div className="mb-4 p-3 bg-rose-950/10 border border-rose-900/40 rounded flex items-center gap-2.5 text-rose-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmitForm)} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* Sensor Select */}
              <div className="sm:col-span-2 flex flex-col gap-1.5 p-3.5 bg-zinc-900/30 rounded border border-zinc-900/60 mb-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-zinc-300">Target Node Identity</span>
                  <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-zinc-400">
                    <input
                      type="checkbox"
                      {...register('isNewSensor')}
                      className="accent-zinc-700 rounded h-3.5 w-3.5"
                    />
                    <span>Deploy New Temporary Demo Buoy</span>
                  </label>
                </div>

                {isNewSensorActive ? (
                  <div>
                    <label className="text-[10px] text-zinc-500">Custom Buoy Name Tag</label>
                    <input
                      type="text"
                      placeholder="e.g. AQ_TEMP_COUM"
                      {...register('custom_sensor_name')}
                      className="w-full mt-1 px-2.5 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-xs focus:outline-none"
                    />
                  </div>
                ) : (
                  <select
                    {...register('sensor_id')}
                    className="w-full px-2.5 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-xs focus:outline-none"
                  >
                    {sensors.map(s => <option key={s.sensor_id} value={s.sensor_id}>{s.sensor_id}: {s.name}</option>)}
                  </select>
                )}
              </div>

              {/* Form Grid */}
              <div>
                <label className="text-[10px] text-zinc-500 block uppercase">GPS Latitude</label>
                <input
                  type="number"
                  step="any"
                  {...register('latitude')}
                  className="w-full mt-1 px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded focus:outline-none"
                />
                {errors.latitude && <p className="text-rose-400 text-[10px] mt-0.5">{errors.latitude.message}</p>}
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 block uppercase">GPS Longitude</label>
                <input
                  type="number"
                  step="any"
                  {...register('longitude')}
                  className="w-full mt-1 px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded focus:outline-none"
                />
                {errors.longitude && <p className="text-rose-400 text-[10px] mt-0.5">{errors.longitude.message}</p>}
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 block uppercase">Water Level Height (cm)</label>
                <input
                  type="number"
                  step="any"
                  {...register('water_level_cm')}
                  className="w-full mt-1 px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded focus:outline-none"
                />
                {errors.water_level_cm && <p className="text-rose-400 text-[10px] mt-0.5">{errors.water_level_cm.message}</p>}
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 block uppercase">pH Acidity (0-14)</label>
                <input
                  type="number"
                  step="any"
                  {...register('ph')}
                  className="w-full mt-1 px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded focus:outline-none"
                />
                {errors.ph && <p className="text-rose-400 text-[10px] mt-0.5">{errors.ph.message}</p>}
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 block uppercase">Turbidity (NTU)</label>
                <input
                  type="number"
                  step="any"
                  {...register('turbidity_ntu')}
                  className="w-full mt-1 px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded focus:outline-none"
                />
                {errors.turbidity_ntu && <p className="text-rose-400 text-[10px] mt-0.5">{errors.turbidity_ntu.message}</p>}
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 block uppercase">Temperature (°C)</label>
                <input
                  type="number"
                  step="any"
                  {...register('temperature_c')}
                  className="w-full mt-1 px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded focus:outline-none"
                />
                {errors.temperature_c && <p className="text-rose-400 text-[10px] mt-0.5">{errors.temperature_c.message}</p>}
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 block uppercase">Buoy Tilt Orientation (deg)</label>
                <input
                  type="number"
                  step="any"
                  {...register('tilt_deg')}
                  className="w-full mt-1 px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded focus:outline-none"
                />
                {errors.tilt_deg && <p className="text-rose-400 text-[10px] mt-0.5">{errors.tilt_deg.message}</p>}
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 block uppercase">Turbulence Index (0-1)</label>
                <input
                  type="number"
                  step="any"
                  {...register('turbulence_index')}
                  className="w-full mt-1 px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded focus:outline-none"
                />
                {errors.turbulence_index && <p className="text-rose-400 text-[10px] mt-0.5">{errors.turbulence_index.message}</p>}
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 block uppercase">Battery Voltage (V)</label>
                <input
                  type="number"
                  step="any"
                  {...register('battery_voltage')}
                  className="w-full mt-1 px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded focus:outline-none"
                />
                {errors.battery_voltage && <p className="text-rose-400 text-[10px] mt-0.5">{errors.battery_voltage.message}</p>}
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 block uppercase">RSSI Strength (dBm)</label>
                <input
                  type="number"
                  {...register('rssi')}
                  className="w-full mt-1 px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded focus:outline-none"
                />
                {errors.rssi && <p className="text-rose-400 text-[10px] mt-0.5">{errors.rssi.message}</p>}
              </div>

              <div className="sm:col-span-2">
                <label className="text-[10px] text-zinc-500 block uppercase">Field Notes / Remarks</label>
                <textarea
                  {...register('notes')}
                  placeholder="Record local weather parameters or notes on physical hardware state..."
                  className="w-full mt-1 px-2.5 py-2 bg-zinc-900 border border-zinc-800 rounded focus:outline-none h-16 font-sans resize-none"
                />
              </div>

              {/* Live ML Neural Network Risk Preview Card */}
              {predictions && (
                <div className="sm:col-span-2 p-4 bg-zinc-950/80 border border-zinc-800/80 rounded-xl mt-2 mb-2">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-sky-400 animate-pulse" />
                      <h4 className="text-[11px] font-bold text-sky-400 font-mono tracking-wider uppercase">
                        Live ML Risk Preview (dGPU Accelerated)
                      </h4>
                    </div>
                    <span className="text-[9px] text-zinc-500 font-mono uppercase bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">
                      RTX 5060 Inference
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Flood Risk */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between text-[11px] font-mono">
                        <span className="text-zinc-400">Flood Probability:</span>
                        <span className={`font-bold ${
                          predictions.flood_probability > 0.7 ? 'text-rose-400' :
                          predictions.flood_probability > 0.4 ? 'text-amber-400' : 'text-emerald-400'
                        }`}>
                          {Math.round(predictions.flood_probability * 100)}% ({predictions.flood_risk_level})
                        </span>
                      </div>
                      <div className="w-full bg-zinc-900 h-2.5 rounded-full overflow-hidden border border-zinc-800">
                        <div 
                          ref={(el) => {
                            if (el) {
                              el.style.width = `${predictions.flood_probability * 100}%`;
                            }
                          }}
                          className={`h-full rounded-full transition-all duration-300 ${
                            predictions.flood_probability > 0.7 ? 'bg-rose-500' :
                            predictions.flood_probability > 0.4 ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                        ></div>
                      </div>
                    </div>

                    {/* Pollution Anomaly Risk */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between text-[11px] font-mono">
                        <span className="text-zinc-400">Pollution Risk Score:</span>
                        <span className={`font-bold ${
                          predictions.is_anomaly ? 'text-rose-400' :
                          predictions.pollution_anomaly_probability > 0.4 ? 'text-amber-400' : 'text-emerald-400'
                        }`}>
                          {Math.round(predictions.pollution_anomaly_probability * 100)}% ({predictions.is_anomaly ? 'ANOMALOUS' : 'NORMAL'})
                        </span>
                      </div>
                      <div className="w-full bg-zinc-900 h-2.5 rounded-full overflow-hidden border border-zinc-800">
                        <div 
                          ref={(el) => {
                            if (el) {
                              el.style.width = `${predictions.pollution_anomaly_probability * 100}%`;
                            }
                          }}
                          className={`h-full rounded-full transition-all duration-300 ${
                            predictions.is_anomaly ? 'bg-rose-500' :
                            predictions.pollution_anomaly_probability > 0.4 ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="sm:col-span-2 flex items-center justify-end gap-3 mt-4 pt-4 border-t border-zinc-900">
                <button
                  type="button"
                  onClick={() => reset()}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 rounded hover:text-white transition-all cursor-pointer border border-zinc-800"
                >
                  Save as Draft
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold rounded transition-all shadow-lg cursor-pointer"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit as Manual Reading'}
                </button>
              </div>

            </form>
          </div>
        </div>

        {/* Right Col: Drag-Drop CSV Upload */}
        <div className="bg-zinc-950 border border-zinc-900 rounded-lg p-5 shadow-lg flex flex-col">
          <div className="border-b border-zinc-900 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-zinc-400" />
              <h3 className="text-xs font-bold uppercase text-zinc-100 font-sans">CSV Batch Submission</h3>
            </div>
            <p className="text-[10px] text-zinc-500 mt-0.5">BATCH SUBMIT SENSOR READINGS INSTANTLY</p>
          </div>

          <div className="flex-1 flex flex-col gap-4">
            {/* Drag-drop target */}
            <label className="flex-1 border border-dashed border-zinc-850 hover:border-zinc-700 bg-zinc-950/40 rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer min-h-[160px] transition-all">
              <Upload className="w-8 h-8 text-zinc-600 mb-3 animate-pulse" />
              <span className="text-[11px] font-bold text-zinc-300">Drag & Drop or click to select CSV file</span>
              <span className="text-[9px] text-zinc-500 mt-1 max-w-[200px]">Requires columns: sensor_id, water_level_cm, ph, turbidity_ntu</span>
              <input
                type="file"
                accept=".csv"
                onChange={handleCSVUpload}
                className="hidden"
              />
            </label>

            {/* CSV File information */}
            {csvFile && (
              <div className="p-3 bg-zinc-900/60 rounded border border-zinc-900 flex flex-col gap-1 text-[11px]">
                <div className="flex justify-between text-zinc-400">
                  <span>Target File:</span>
                  <span className="font-bold text-zinc-200 truncate max-w-[120px]">{csvFile.name}</span>
                </div>
                <div className="flex justify-between text-zinc-400 mt-1">
                  <span>Verified Rows:</span>
                  <span className="font-bold text-emerald-400">{csvPreview.length} items</span>
                </div>
              </div>
            )}

            {/* Validation errors */}
            {csvErrors.length > 0 && (
              <div className="p-3 bg-rose-950/10 border border-rose-900/30 rounded flex flex-col gap-1">
                <span className="text-[10px] text-rose-400 font-bold uppercase">CSV Verification Errors</span>
                <div className="max-h-24 overflow-y-auto flex flex-col gap-1 text-[9px] text-zinc-500 font-mono mt-1">
                  {csvErrors.map((err, idx) => (
                    <p key={idx} className="leading-relaxed">• {err}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Actions for Batch */}
            {csvPreview.length > 0 && (
              <button
                onClick={submitBatchCsv}
                className="w-full text-center py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded transition-all cursor-pointer shadow-md"
              >
                Batch Upload {csvPreview.length} Verified Rows
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
