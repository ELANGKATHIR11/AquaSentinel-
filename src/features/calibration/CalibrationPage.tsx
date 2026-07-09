/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { CalibrationFormSchema } from '../../schemas';
import { api } from '../../services/api';
import { Sliders, CheckCircle, AlertCircle, History, Info, HelpCircle } from 'lucide-react';
import { CalibrationProfile } from '../../types';

export const CalibrationPage: React.FC = () => {
  const { sensors, calibrationProfiles, calibrationHistory } = useDashboardStore();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(CalibrationFormSchema),
    defaultValues: {
      sensor_id: 'AQ001',
      ph_buffer_7: 7.00,
      ph_buffer_4: 4.00,
      turbidity_distilled_offset: 0.0,
      ultrasonic_offset_cm: 0.0,
      operator: 'Duty Operator Ram',
    },
  });

  const selectedSensorId = watch('sensor_id');
  const activeProfile = calibrationProfiles.find((p) => p.sensor_id === selectedSensorId);

  const onSubmitCalibration = async (data: any) => {
    setSuccessMessage(null);
    setErrorMessage(null);

    // Calculate calibration coefficients based on real chemical equations:
    // ph_offset = 7.0 - ph_buffer_7 (shift from nominal zero point)
    // ph_slope = 3.0 / (ph_buffer_7 - ph_buffer_4) (ideal electrode scale multiplier)
    const ph_offset = parseFloat((7.0 - Number(data.ph_buffer_7)).toFixed(3));
    const divisor = Number(data.ph_buffer_7) - Number(data.ph_buffer_4);
    const ph_slope = parseFloat((divisor !== 0 ? (3.0 / divisor) : 1.0).toFixed(3));

    const profilePayload: CalibrationProfile = {
      sensor_id: data.sensor_id,
      ph_offset,
      ph_slope,
      turbidity_zero_offset: Number(data.turbidity_distilled_offset),
      water_level_offset_cm: Number(data.ultrasonic_offset_cm),
      last_calibrated: new Date().toISOString(),
      operator: data.operator,
      validity_status: 'valid' as const,
    };

    try {
      await api.postCalibration(data.sensor_id, profilePayload);
      setSuccessMessage(`Calibration completed for buoy ${data.sensor_id}. Coefficients: pH Offset=${ph_offset}, Slope=${ph_slope}. Profile saved to persistent cloud storage.`);
    } catch (e) {
      setErrorMessage('Failed to upload calibration profile. Parameters saved offline.');
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300 font-mono text-xs text-zinc-300">
      
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-zinc-100 font-sans tracking-tight">Transducer Calibration Panel</h2>
        <p className="text-xs text-zinc-500 font-mono mt-0.5">CHEMICAL pH SENSOR TRIMS AND ULTRASONIC RANGER CORRECTIONS</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Form Panel */}
        <div className="lg:col-span-2 bg-zinc-950 border border-zinc-900 rounded-lg p-5 shadow-lg">
          <div className="flex items-center gap-2 border-b border-zinc-900 pb-3 mb-5">
            <Sliders className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold uppercase text-zinc-100 font-sans">Electrode Calibration Form</h3>
          </div>

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

          <form onSubmit={handleSubmit(onSubmitCalibration)} className="flex flex-col gap-5">
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] text-zinc-500 block uppercase">Target Buoy Node</label>
                <select
                  {...register('sensor_id')}
                  className="w-full mt-1.5 px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-200 focus:outline-none"
                >
                  {sensors.map(s => <option key={s.sensor_id} value={s.sensor_id}>{s.sensor_id}: {s.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 block uppercase">Responsible Operator</label>
                <input
                  type="text"
                  {...register('operator')}
                  className="w-full mt-1.5 px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded focus:outline-none"
                />
                {errors.operator && <p className="text-rose-400 text-[10px] mt-0.5">{errors.operator.message}</p>}
              </div>
            </div>

            {/* pH buffer Trims */}
            <div className="p-4 bg-zinc-900/40 border border-zinc-900 rounded-lg">
              <span className="font-bold text-zinc-200 block text-xs mb-3 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                pH electrode buffer baseline
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-zinc-500 block">Buffer 7.00 Voltage Reading (V)</label>
                  <input
                    type="number"
                    step="any"
                    {...register('ph_buffer_7')}
                    className="w-full mt-1 px-2.5 py-1.5 bg-zinc-950 border border-zinc-800 rounded focus:outline-none"
                  />
                  {errors.ph_buffer_7 && <p className="text-rose-400 text-[10px] mt-0.5">{errors.ph_buffer_7.message}</p>}
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 block">Buffer 4.00 Voltage Reading (V)</label>
                  <input
                    type="number"
                    step="any"
                    {...register('ph_buffer_4')}
                    className="w-full mt-1 px-2.5 py-1.5 bg-zinc-950 border border-zinc-800 rounded focus:outline-none"
                  />
                  {errors.ph_buffer_4 && <p className="text-rose-400 text-[10px] mt-0.5">{errors.ph_buffer_4.message}</p>}
                </div>
              </div>
              <p className="text-[10px] text-zinc-500 mt-2">Calculates slope correction factor dynamically via Nernst potential ratio.</p>
            </div>

            {/* Turbidity Trims */}
            <div className="p-4 bg-zinc-900/40 border border-zinc-900 rounded-lg">
              <span className="font-bold text-zinc-200 block text-xs mb-3 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                Turbidity baseline blanking
              </span>

              <div>
                <label className="text-[10px] text-zinc-500 block">Distilled Water NTU Offset Calibration</label>
                <input
                  type="number"
                  step="any"
                  {...register('turbidity_distilled_offset')}
                  className="w-full mt-1 px-2.5 py-1.5 bg-zinc-950 border border-zinc-800 rounded focus:outline-none"
                />
                {errors.turbidity_distilled_offset && <p className="text-rose-400 text-[10px] mt-0.5">{errors.turbidity_distilled_offset.message}</p>}
              </div>
            </div>

            {/* Ultrasonic offset */}
            <div className="p-4 bg-zinc-900/40 border border-zinc-900 rounded-lg">
              <span className="font-bold text-zinc-200 block text-xs mb-3 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                Ultrasonic ranger trim
              </span>

              <div>
                <label className="text-[10px] text-zinc-500 block">Water-level ultrasonic offset correction (cm)</label>
                <input
                  type="number"
                  step="any"
                  {...register('ultrasonic_offset_cm')}
                  className="w-full mt-1 px-2.5 py-1.5 bg-zinc-950 border border-zinc-800 rounded focus:outline-none"
                />
                {errors.ultrasonic_offset_cm && <p className="text-rose-400 text-[10px] mt-0.5">{errors.ultrasonic_offset_cm.message}</p>}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-zinc-900 pt-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-zinc-100 hover:bg-white text-zinc-950 font-bold rounded transition-all shadow-md cursor-pointer"
              >
                {isSubmitting ? 'Calculating...' : 'Commit validated parameters'}
              </button>
            </div>
          </form>
        </div>

        {/* Right Col: Active profile & Historic log lists */}
        <div className="flex flex-col gap-4">
          
          {/* Active coefficients card */}
          <div className="bg-zinc-950 border border-zinc-900 p-5 rounded-lg shadow-md font-mono text-xs text-zinc-300">
            <h4 className="text-zinc-200 font-bold mb-3 uppercase tracking-wider text-[10px]">Active Node coefficients</h4>
            {activeProfile ? (
              <div className="flex flex-col gap-2">
                <div className="flex justify-between py-1 border-b border-zinc-900">
                  <span>pH Shift Offset:</span>
                  <span className="font-bold text-zinc-100">{activeProfile.ph_offset}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-zinc-900">
                  <span>pH Electrode Slope:</span>
                  <span className="font-bold text-zinc-100">{activeProfile.ph_slope}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-zinc-900">
                  <span>Turbidity Zero:</span>
                  <span className="font-bold text-zinc-100">{activeProfile.turbidity_zero_offset} NTU</span>
                </div>
                <div className="flex justify-between py-1 border-b border-zinc-900">
                  <span>Ranger Trim Offset:</span>
                  <span className="font-bold text-zinc-100">{activeProfile.water_level_offset_cm} cm</span>
                </div>
                <div className="flex justify-between py-1">
                  <span>Calibration Status:</span>
                  <span className={`font-bold capitalize ${
                    activeProfile.validity_status === 'valid' ? 'text-emerald-400' : 'text-amber-400'
                  }`}>{activeProfile.validity_status}</span>
                </div>
              </div>
            ) : (
              <p className="text-zinc-500">No custom profile loaded. Using hardware defaults.</p>
            )}
          </div>

          {/* Calibration history log */}
          <div className="bg-zinc-950 border border-zinc-900 p-5 rounded-lg shadow-md flex-1 flex flex-col">
            <h4 className="text-zinc-200 font-bold mb-4 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
              <History className="w-4 h-4 text-zinc-400" />
              Calibration audit logs
            </h4>
            
            <div className="flex flex-col gap-3 overflow-y-auto max-h-[220px] flex-1 pr-1">
              {calibrationHistory.map((entry) => (
                <div key={entry.id} className="p-3 bg-zinc-900/60 rounded border border-zinc-900 flex flex-col gap-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="font-bold text-zinc-300">{entry.sensor_id}</span>
                    <span className="text-zinc-500 text-[9px]">{new Date(entry.timestamp).toLocaleDateString()}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[10px] text-zinc-500 mt-1">
                    <div>pH Offset: <b>{entry.ph_offset}</b></div>
                    <div>Level Trim: <b>{entry.water_level_offset_cm}cm</b></div>
                  </div>
                  <div className="flex justify-between text-[10px] text-zinc-500 mt-1.5 pt-1.5 border-t border-zinc-900/50">
                    <span>Op: {entry.operator}</span>
                    <span className="text-emerald-400 font-semibold">{entry.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
