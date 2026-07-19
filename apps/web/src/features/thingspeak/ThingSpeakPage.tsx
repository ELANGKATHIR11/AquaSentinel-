/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { useDashboardStore } from '../../stores/useDashboardStore';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  Cloud,
  RefreshCw,
  AlertTriangle,
  Activity,
  Droplet,
  Thermometer,
  Wind,
} from 'lucide-react';

interface FeedItem {
  created_at: string;
  entry_id: number;
  field1: string; // Temperature
  field2: string; // Turbidity
  field3: string; // Water Level
  field4: string; // Water Flow
}

interface ChannelInfo {
  id: number;
  name: string;
  description: string;
  updated_at: string;
  field1: string;
  field2: string;
  field3: string;
  field4: string;
}

export const ThingSpeakPage: React.FC = () => {
  const { mockMode } = useDashboardStore();
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [feeds, setFeeds] = useState<any[]>([]);
  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [activeParam, setActiveParam] = useState<string>('all');
  const [pollCount, setPollCount] = useState<number>(0);

  const channelId = '3430881';
  const readApiKey = '3FHGM53MIXIRT156';

  const fetchData = async () => {
    try {
      setError(null);
      const url = `https://api.thingspeak.com/channels/${channelId}/feeds.json?api_key=${readApiKey}&results=20`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`ThingSpeak API returned status ${response.status}`);
      }
      
      const data = await response.json();
      setChannel(data.channel);
      
      // Parse data for Recharts
      const parsedFeeds = data.feeds.map((feed: FeedItem) => {
        const time = new Date(feed.created_at).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        });
        
        return {
          time,
          entry_id: feed.entry_id,
          temperature: feed.field1 ? parseFloat(feed.field1) : 0,
          turbidity: feed.field2 ? parseFloat(feed.field2) : 0,
          water_level: feed.field3 ? parseFloat(feed.field3) : 0,
          water_flow: feed.field4 ? parseFloat(feed.field4) : 0,
        };
      });
      
      setFeeds(parsedFeeds);
      setLoading(false);
    } catch (err: any) {
      console.error('Error fetching ThingSpeak data:', err);
      setError(err.message || 'Failed to sync with ThingSpeak server.');
      setLoading(false);
    }
  };

  // Poll data every 5 seconds
  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      fetchData();
      setPollCount((prev) => prev + 1);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const latestFeed = feeds[feeds.length - 1] || {
    temperature: 0,
    turbidity: 0,
    water_level: 0,
    water_flow: 0,
    time: 'N/A',
  };

  const getMetricStyles = (value: number, type: string) => {
    if (type === 'temp') return value > 35 ? 'text-rose-400' : 'text-emerald-400';
    if (type === 'turbidity') return value > 250 ? 'text-rose-400' : value > 100 ? 'text-amber-400' : 'text-emerald-400';
    if (type === 'level') return value > 300 ? 'text-rose-400' : value > 200 ? 'text-amber-400' : 'text-emerald-400';
    if (type === 'flow') return value > 40 ? 'text-rose-400' : 'text-emerald-400';
    return 'text-zinc-300';
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300 font-mono text-xs text-zinc-300">
      
      {/* Title & Connection Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-zinc-100 font-sans tracking-tight flex items-center gap-2">
            <Cloud className="w-6 h-6 text-sky-400" />
            ThingSpeak Live Cloud Monitor
          </h2>
          <p className="text-xs text-zinc-500 font-mono mt-0.5 uppercase">
            Real-time visual telemetry bridge for Channel ID: {channelId}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setLoading(true);
              fetchData();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 rounded font-bold cursor-pointer transition-all active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            REFRESH
          </button>
          
          <div className="px-3.5 py-1.5 bg-emerald-500/10 border border-emerald-500/35 text-emerald-400 font-bold rounded">
            SYNCING: ACTIVE
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-950/15 border border-rose-900/40 rounded-lg flex items-center gap-3 text-rose-400">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <div>
            <p className="font-bold">Sync Alert</p>
            <p className="text-[10px] mt-0.5 text-rose-500">{error}</p>
          </div>
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Field 1: Temp */}
        <div className="bg-zinc-950 border border-zinc-900 rounded-lg p-4 shadow flex flex-col gap-1.5 relative overflow-hidden">
          <div className="flex justify-between items-center text-zinc-500 uppercase tracking-widest text-[9px]">
            <span>Temperature</span>
            <Thermometer className="w-4 h-4 text-zinc-600" />
          </div>
          <div className="flex items-baseline gap-1 mt-1">
            <span className={`text-2xl font-bold font-sans ${getMetricStyles(latestFeed.temperature, 'temp')}`}>
              {loading ? '...' : latestFeed.temperature.toFixed(2)}
            </span>
            <span className="text-zinc-500 font-bold">°C</span>
          </div>
          <div className="text-[9px] text-zinc-600 mt-1 uppercase">Field 1 - Water Temp Buoy Sensor</div>
        </div>

        {/* Field 2: Turbidity */}
        <div className="bg-zinc-950 border border-zinc-900 rounded-lg p-4 shadow flex flex-col gap-1.5 relative overflow-hidden">
          <div className="flex justify-between items-center text-zinc-500 uppercase tracking-widest text-[9px]">
            <span>Turbidity</span>
            <Droplet className="w-4 h-4 text-zinc-600" />
          </div>
          <div className="flex items-baseline gap-1 mt-1">
            <span className={`text-2xl font-bold font-sans ${getMetricStyles(latestFeed.turbidity, 'turbidity')}`}>
              {loading ? '...' : latestFeed.turbidity.toFixed(1)}
            </span>
            <span className="text-zinc-500 font-bold">NTU</span>
          </div>
          <div className="text-[9px] text-zinc-600 mt-1 uppercase">Field 2 - Turbidity Sensor AO</div>
        </div>

        {/* Field 3: Water Level */}
        <div className="bg-zinc-950 border border-zinc-900 rounded-lg p-4 shadow flex flex-col gap-1.5 relative overflow-hidden">
          <div className="flex justify-between items-center text-zinc-500 uppercase tracking-widest text-[9px]">
            <span>Water Level</span>
            <Activity className="w-4 h-4 text-zinc-600" />
          </div>
          <div className="flex items-baseline gap-1 mt-1">
            <span className={`text-2xl font-bold font-sans ${getMetricStyles(latestFeed.water_level, 'level')}`}>
              {loading ? '...' : latestFeed.water_level.toFixed(1)}
            </span>
            <span className="text-zinc-500 font-bold">cm</span>
          </div>
          <div className="text-[9px] text-zinc-600 mt-1 uppercase">Field 3 - Waterproof Ultrasonic</div>
        </div>

        {/* Field 4: Water Flow */}
        <div className="bg-zinc-950 border border-zinc-900 rounded-lg p-4 shadow flex flex-col gap-1.5 relative overflow-hidden">
          <div className="flex justify-between items-center text-zinc-500 uppercase tracking-widest text-[9px]">
            <span>Water Flow</span>
            <Wind className="w-4 h-4 text-zinc-600" />
          </div>
          <div className="flex items-baseline gap-1 mt-1">
            <span className={`text-2xl font-bold font-sans ${getMetricStyles(latestFeed.water_flow, 'flow')}`}>
              {loading ? '...' : latestFeed.water_flow.toFixed(1)}
            </span>
            <span className="text-zinc-500 font-bold">L/min</span>
          </div>
          <div className="text-[9px] text-zinc-600 mt-1 uppercase">Field 4 - Water Flow Sensor</div>
        </div>

      </div>

      {/* Main Chart Panel */}
      <div className="bg-zinc-950 border border-zinc-900 rounded-lg p-5 shadow-lg flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-900 pb-3">
          <div>
            <h3 className="text-xs font-bold uppercase text-zinc-100 font-sans">
              Real-time Sensor History Feed
            </h3>
            <p className="text-[10px] text-zinc-500 mt-0.5">Last updated: {latestFeed.time} | Sync cycles: {pollCount}</p>
          </div>

          {/* Graph filters */}
          <div className="flex items-center gap-1.5">
            {['all', 'temperature', 'turbidity', 'water_level', 'water_flow'].map((param) => (
              <button
                key={param}
                onClick={() => setActiveParam(param)}
                className={`px-3 py-1 rounded font-bold transition-all border ${
                  activeParam === param
                    ? 'bg-sky-500/10 text-sky-400 border-sky-500/35'
                    : 'bg-zinc-950 text-zinc-500 border-zinc-900 hover:text-zinc-300'
                }`}
              >
                {param.replace('_', ' ').toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Recharts Chart */}
        <div className="h-80 w-full mt-2">
          {loading ? (
            <div className="h-full w-full flex items-center justify-center font-bold text-zinc-500">
              <RefreshCw className="w-5 h-5 animate-spin mr-2 text-sky-500" />
              RETRIEVING LIVE CLOUD FEED FROM THINGSPEAK...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={feeds} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#18181b" />
                <XAxis dataKey="time" stroke="#52525b" tickMargin={8} />
                <YAxis stroke="#52525b" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#09090b',
                    borderColor: '#27272a',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '15px' }} />
                
                {(activeParam === 'all' || activeParam === 'temperature') && (
                  <Line
                    type="monotone"
                    dataKey="temperature"
                    name="Temperature (°C)"
                    stroke="#fb7185"
                    strokeWidth={2}
                    activeDot={{ r: 6 }}
                    dot={false}
                  />
                )}
                {(activeParam === 'all' || activeParam === 'turbidity') && (
                  <Line
                    type="monotone"
                    dataKey="turbidity"
                    name="Turbidity (NTU)"
                    stroke="#38bdf8"
                    strokeWidth={2}
                    activeDot={{ r: 6 }}
                    dot={false}
                  />
                )}
                {(activeParam === 'all' || activeParam === 'water_level') && (
                  <Line
                    type="monotone"
                    dataKey="water_level"
                    name="Water Level (cm)"
                    stroke="#34d399"
                    strokeWidth={2}
                    activeDot={{ r: 6 }}
                    dot={false}
                  />
                )}
                {(activeParam === 'all' || activeParam === 'water_flow') && (
                  <Line
                    type="monotone"
                    dataKey="water_flow"
                    name="Water Flow (L/min)"
                    stroke="#a78bfa"
                    strokeWidth={2}
                    activeDot={{ r: 6 }}
                    dot={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
      
      {/* Channel info panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-zinc-950 border border-zinc-900 rounded-lg p-5 shadow flex flex-col gap-3">
          <h4 className="text-zinc-200 font-bold uppercase text-[10px] border-b border-zinc-900 pb-2">
            ThingSpeak Cloud Node Configuration
          </h4>
          <div className="flex flex-col gap-2 font-mono text-[11px]">
            <div className="flex justify-between py-1 border-b border-zinc-900/50">
              <span className="text-zinc-500">Channel Name:</span>
              <span className="font-bold text-zinc-300">{channel?.name || 'AquaSentinal'}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-zinc-900/50">
              <span className="text-zinc-500">Channel ID:</span>
              <span className="font-bold text-zinc-300">{channel?.id || channelId}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-zinc-900/50">
              <span className="text-zinc-500">Created At:</span>
              <span className="font-bold text-zinc-300">
                {channel?.created_at ? new Date(channel.created_at).toLocaleString() : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-zinc-500">Last Sync Source:</span>
              <span className="font-bold text-sky-400">ThingSpeak REST feeds API</span>
            </div>
          </div>
        </div>

        <div className="bg-zinc-950 border border-zinc-900 rounded-lg p-5 shadow flex flex-col gap-3">
          <h4 className="text-zinc-200 font-bold uppercase text-[10px] border-b border-zinc-900 pb-2">
            Live Stream Diagnostics
          </h4>
          <p className="text-[10px] text-zinc-500 leading-relaxed font-sans">
            ThingSpeak is polling directly from the Cloud Server every 5 seconds. Field 1 maps Temperature, Field 2 maps Turbidity, Field 3 maps Water Level, and Field 4 maps Water Flow.
          </p>
        </div>
      </div>

    </div>
  );
};
