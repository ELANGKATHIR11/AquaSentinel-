/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { SimulationFormSchema } from '../../schemas';
import { api } from '../../services/api';
import { Play, Square, RotateCcw, AlertTriangle, ShieldCheck, HelpCircle, Activity } from 'lucide-react';

export const SimulationPage: React.FC = () => {
  const {
    sensors,
    scenarios,
    startScenario,
    stopScenario,
    tickSimulation,
    resetAllState,
    mockMode,
  } = useDashboardStore();

  // Polling interval state for simulating real-time telemetry updates
  const [isPollingActive, setIsPollingActive] = useState(true);

  // Trigger client-side simulator clock when polling or scenarios are active
  useEffect(() => {
    let interval: number | null = null;
    if (isPollingActive && mockMode) {
      // Simulate slow live updates (every 5 seconds)
      interval = window.setInterval(() => {
        tickSimulation();
      }, 5000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPollingActive, tickSimulation, mockMode]);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(SimulationFormSchema),
    defaultValues: {
      scenario_id: 'scen_flood',
      intensity: 0.8,
      duration_minutes: 10,
      target_sensor: 'AQ001',
    },
  });

  const handleStartScenario = async (data: any) => {
    // Post simulation parameters to API (or fallback to local mock store)
    await api.postSimulationEvent(data.scenario_id, {
      intensity: Number(data.intensity),
      duration_minutes: Number(data.duration_minutes),
      target_sensor: data.target_sensor,
    });
    // Immediately tick to see visual anomaly in charts/map
    tickSimulation();
  };

  const handleStopScenario = (id: string) => {
    stopScenario(id);
  };

  const handleResetState = () => {
    resetAllState();
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300 font-mono text-xs text-zinc-300">
      
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-zinc-100 font-sans tracking-tight">Operations Simulation Center</h2>
        <p className="text-xs text-zinc-500 font-mono mt-0.5">HYDROGRAPHIC ANOMALY AND LORA COMMUNICATIONS DISRUPTION EMULATOR</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Preset Scenarios Trigger Form */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          
          {/* Preset scenarios list status card */}
          <div className="bg-zinc-950 border border-zinc-900 rounded-lg p-5 shadow-lg">
            <div className="flex items-center justify-between border-b border-zinc-900 pb-3 mb-4">
              <h3 className="text-xs font-bold uppercase text-zinc-100 font-sans flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-amber-400" />
                Active Scenario Presets
              </h3>
              {mockMode && (
                <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] px-2 py-0.5 rounded-full font-bold">
                  LOCAL SIMULATOR ACTIVE
                </span>
              )}
            </div>

            <div className="flex flex-col gap-3">
              {scenarios.map((scen) => {
                const isRunning = scen.status === 'running';
                return (
                  <div
                    key={scen.id}
                    className={`p-4 border rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${
                      isRunning ? 'bg-amber-950/15 border-amber-500/30' : 'bg-zinc-900/30 border-zinc-900'
                    }`}
                  >
                    <div className="flex-1 flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-zinc-200 text-xs">{scen.name}</span>
                        {isRunning && (
                          <span className="px-1.5 py-0.2 rounded text-[8px] bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold animate-pulse uppercase">
                            RUNNING
                          </span>
                        )}
                      </div>
                      <p className="text-zinc-500 text-[11px] font-sans mt-0.5 leading-relaxed">{scen.description}</p>
                      <div className="flex items-center gap-2 mt-2 text-[10px] text-zinc-500">
                        <span>Int: <b>{Math.round(scen.intensity * 100)}%</b></span>
                        <span>•</span>
                        <span>Dur: <b>{scen.duration_minutes} min</b></span>
                        <span>•</span>
                        <span>Target: <b>{scen.target_sensor.toUpperCase()}</b></span>
                      </div>
                    </div>

                    <div className="flex-shrink-0 flex items-center gap-2">
                      {isRunning ? (
                        <button
                          onClick={() => handleStopScenario(scen.id)}
                          className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-bold rounded flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
                        >
                          <Square className="w-3.5 h-3.5 fill-white" />
                          Stop
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setValue('scenario_id', scen.id);
                            setValue('intensity', scen.intensity);
                            setValue('duration_minutes', scen.duration_minutes);
                            setValue('target_sensor', scen.target_sensor);
                          }}
                          className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded border border-zinc-800 hover:text-white transition-all cursor-pointer"
                        >
                          Configure Preset
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Detailed scenario launcher form */}
          <div className="bg-zinc-950 border border-zinc-900 rounded-lg p-5 shadow-lg">
            <h3 className="text-xs font-bold uppercase text-zinc-100 font-sans border-b border-zinc-900 pb-3 mb-4">
              Scenario Calibration Launcher
            </h3>

            <form onSubmit={handleSubmit(handleStartScenario)} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              <div>
                <label className="text-[10px] text-zinc-500 block uppercase">Target Scenario</label>
                <select
                  {...register('scenario_id')}
                  className="w-full mt-1.5 px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-xs focus:outline-none text-zinc-300"
                >
                  {scenarios.map(sc => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 block uppercase">Target Buoy Node</label>
                <select
                  {...register('target_sensor')}
                  className="w-full mt-1.5 px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-xs focus:outline-none text-zinc-300"
                >
                  <option value="all">Impact all active nodes</option>
                  {sensors.map(s => <option key={s.sensor_id} value={s.sensor_id}>{s.sensor_id}: {s.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 block uppercase">Simulation Intensity (0.1 - 1.0)</label>
                <input
                  type="number"
                  step="0.1"
                  {...register('intensity')}
                  className="w-full mt-1.5 px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 block uppercase">Scenario Duration (Minutes)</label>
                <input
                  type="number"
                  {...register('duration_minutes')}
                  className="w-full mt-1.5 px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2 flex items-center justify-end pt-4 border-t border-zinc-900 mt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4.5 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-extrabold rounded transition-all shadow-lg flex items-center gap-2 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-white" />
                  Launch Environmental Simulation Run
                </button>
              </div>

            </form>
          </div>

        </div>

        {/* Right Col: Simulation engine triggers, Reset buttons, Clock speeds */}
        <div className="flex flex-col gap-4">
          
          {/* Quick Engine controls */}
          <div className="bg-zinc-950 border border-zinc-900 p-5 rounded-lg shadow-md flex flex-col gap-4">
            <h4 className="text-zinc-200 font-bold uppercase tracking-wider text-[10px] border-b border-zinc-900 pb-2 mb-1">
              Simulation clock triggers
            </h4>

            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Enable Client Simulator clock:</span>
              <button
                onClick={() => setIsPollingActive(!isPollingActive)}
                className={`px-3 py-1 text-xs font-bold rounded cursor-pointer border ${
                  isPollingActive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-zinc-900 text-zinc-500 border-zinc-800'
                }`}
              >
                {isPollingActive ? 'ACTIVE (5S CLOCK)' : 'PAUSED'}
              </button>
            </div>

            <p className="text-[10px] text-zinc-500 leading-relaxed font-sans">
              When client simulator clock is active, the app automatically ticks realistic wave noise and sensor fluctuations into the local memory buffers, representing active telemetry.
            </p>

            <button
              onClick={tickSimulation}
              className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 hover:text-white border border-zinc-800 rounded text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Activity className="w-3.5 h-3.5 text-amber-400" />
              Force manual telemetry Frame tick
            </button>
          </div>

          {/* Reset operations state */}
          <div className="bg-zinc-950 border border-zinc-950 p-5 rounded-lg shadow-md flex flex-col gap-3">
            <h4 className="text-rose-400 font-bold uppercase tracking-wider text-[10px]">Incinerate simulator memory</h4>
            <p className="text-[10px] text-zinc-500 leading-relaxed font-sans">
              Erase all manual, simulation, and scenario telemetry packets and restore the core database back to standard factory telemetry indices.
            </p>
            <button
              onClick={handleResetState}
              className="w-full py-2 bg-rose-600/10 hover:bg-rose-600/20 text-rose-300 hover:text-rose-200 border border-rose-500/20 rounded text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset all registry data
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
