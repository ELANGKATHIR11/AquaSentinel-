import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Play, 
  Square, 
  RotateCcw, 
  AlertTriangle, 
  Activity, 
  Layers, 
  Compass, 
  Cpu, 
  Settings, 
  Gauge, 
  Droplet,
  Waves
} from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

interface RiverInfo {
  name: string;
  width: number;
  depth: number;
  lengthKm: number;
  floodCoeff: number;
  pollutionCoeff: number;
  bedType: 'rocky' | 'sandy' | 'silty' | 'clayey';
}

const RIVERS: RiverInfo[] = [
  { name: 'Cauvery', width: 350, depth: 8.5, lengthKm: 774, floodCoeff: 1.1, pollutionCoeff: 0.95, bedType: 'silty' },
  { name: 'Palar', width: 450, depth: 4.2, lengthKm: 562, floodCoeff: 0.8, pollutionCoeff: 1.25, bedType: 'sandy' },
  { name: 'South Pennar', width: 280, depth: 5.0, lengthKm: 663, floodCoeff: 0.9, pollutionCoeff: 0.85, bedType: 'clayey' },
  { name: 'Vaigai', width: 200, depth: 3.5, lengthKm: 487, floodCoeff: 0.75, pollutionCoeff: 1.1, bedType: 'sandy' },
  { name: 'Tamiraparani', width: 180, depth: 6.2, lengthKm: 272, floodCoeff: 1.05, pollutionCoeff: 0.7, bedType: 'rocky' },
  { name: 'Bhavani', width: 150, depth: 5.5, lengthKm: 393, floodCoeff: 0.95, pollutionCoeff: 0.75, bedType: 'rocky' },
  { name: 'Amaravati', width: 220, depth: 4.8, lengthKm: 430, floodCoeff: 0.85, pollutionCoeff: 1.05, bedType: 'sandy' },
  { name: 'Noyyal', width: 120, depth: 3.0, lengthKm: 395, floodCoeff: 0.6, pollutionCoeff: 1.4, bedType: 'silty' },
  { name: 'Vellar', width: 240, depth: 5.2, lengthKm: 570, floodCoeff: 0.8, pollutionCoeff: 0.9, bedType: 'clayey' },
  { name: 'Gundar', width: 90, depth: 2.8, lengthKm: 15.8, floodCoeff: 0.5, pollutionCoeff: 0.8, bedType: 'sandy' }
];

export const SimulationPage: React.FC = () => {
  const [selectedRiverName, setSelectedRiverName] = useState<string>('Cauvery');
  const [waterLevel, setWaterLevel] = useState<number>(120); // in cm
  const [velocity, setVelocity] = useState<number>(1.2); // m/s
  const [pollution, setPollution] = useState<number>(15); // percentage

  const [activeLayers, setActiveLayers] = useState({
    dem: true,
    vector: true,
    shapefile: true
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);

  // Find active river properties
  const activeRiver = useMemo(() => {
    return RIVERS.find(r => r.name === selectedRiverName) || RIVERS[0];
  }, [selectedRiverName]);

  // Live Chart Trend Data
  const [chartData, setChartData] = useState<any[]>([]);

  // Telemetry chart ticker
  useEffect(() => {
    setChartData([
      { time: '00:00', 'Flood Risk %': 10, 'Pollution Index %': 5 },
      { time: '00:05', 'Flood Risk %': 12, 'Pollution Index %': 8 },
      { time: '00:10', 'Flood Risk %': 15, 'Pollution Index %': 12 }
    ]);
  }, [selectedRiverName]);

  useEffect(() => {
    const interval = setInterval(() => {
      // Calculate current risks based on knobs
      let rawFlood = 0.02;
      if (waterLevel > 100) {
        rawFlood = Math.min(0.99, 0.02 + Math.pow((waterLevel - 100) / 180, 2) * 0.96);
      }
      const floodProb = Math.round(rawFlood * activeRiver.floodCoeff * 100);
      const pollutionProb = Math.round((pollution / 100) * activeRiver.pollutionCoeff * 100);

      setChartData(prev => {
        const nextTime = new Date();
        const timeStr = nextTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const nextData = [...prev, {
          time: timeStr,
          'Flood Risk %': Math.min(100, Math.max(1, floodProb)),
          'Pollution Index %': Math.min(100, Math.max(1, pollutionProb))
        }];
        if (nextData.length > 10) return nextData.slice(1);
        return nextData;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [waterLevel, pollution, activeRiver]);

  // 3D Water Physics simulation engine loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let time = 0;
    // Particle array for velocity visualization
    const particles: { x: number; y: number; size: number; speed: number }[] = [];
    for (let i = 0; i < 40; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: 1 + Math.random() * 2,
        speed: 1 + Math.random() * 2
      });
    }

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      time += 0.05 * velocity;

      // Draw 3D Grid Perspective Background
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 0.5;
      const gridSpacing = 40;
      // Perspective grid lines
      for (let x = 0; x < canvas.width; x += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(x, canvas.height);
        ctx.lineTo(canvas.width / 2 + (x - canvas.width / 2) * 0.3, 100);
        ctx.stroke();
      }
      for (let y = 100; y < canvas.height; y += 30) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Draw River Bed Profile (Digital Elevation Model Representation)
      ctx.fillStyle = activeRiver.bedType === 'sandy' ? '#78350f' : activeRiver.bedType === 'rocky' ? '#334155' : '#451a03';
      ctx.beginPath();
      // Start of left bank
      ctx.moveTo(30, canvas.height - 40);
      // Curve to river bed bottom
      ctx.bezierCurveTo(
        100, canvas.height - 40,
        150, canvas.height - 180 + (activeRiver.depth * 10),
        canvas.width / 2, canvas.height - 180 + (activeRiver.depth * 10)
      );
      ctx.bezierCurveTo(
        canvas.width - 150, canvas.height - 180 + (activeRiver.depth * 10),
        canvas.width - 100, canvas.height - 40,
        canvas.width - 30, canvas.height - 40
      );
      ctx.lineTo(canvas.width, canvas.height);
      ctx.lineTo(0, canvas.height);
      ctx.closePath();
      ctx.fill();

      // Render 3D Water Volume Mesh
      // Max height relative to waterLevel input
      const waterHeightOffset = (waterLevel / 350) * 120;
      const baseWaterY = canvas.height - 60 - waterHeightOffset;

      // Color blending: Pristine Cyan to Anomaly Turbid Green/Brown
      const pRatio = pollution / 100;
      const r = Math.round(16 + pRatio * (139 - 16));
      const g = Math.round(185 + pRatio * (92 - 185));
      const b = Math.round(129 + pRatio * (26 - 129));
      
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.55)`;
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.8)`;
      ctx.lineWidth = 2;

      ctx.beginPath();
      // Wave generator left to right
      ctx.moveTo(30, baseWaterY);
      for (let x = 30; x <= canvas.width - 30; x += 10) {
        const wave1 = Math.sin(x * 0.02 + time) * 6;
        const wave2 = Math.cos(x * 0.05 - time * 0.8) * 3;
        ctx.lineTo(x, baseWaterY + wave1 + wave2);
      }
      // Connect to riverbed
      ctx.lineTo(canvas.width - 120, canvas.height - 80);
      ctx.lineTo(120, canvas.height - 80);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Render Particles showing velocity & flow vector direction
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      particles.forEach(p => {
        p.x += p.speed * velocity;
        if (p.x > canvas.width - 50) {
          p.x = 50;
          p.y = baseWaterY + Math.random() * 50;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });

      // Flood Alert indicator
      if (waterLevel > 220) {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
        ctx.lineWidth = 2;
        ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 10px monospace';
        ctx.fillText('CRITICAL OVERFLOW ALERT - BANK TRANSGRESSION DETECTED', 15, 25);
      }

      // Title overlay info
      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px monospace';
      ctx.fillText(`3D DIGITAL TWIN MODEL: ${selectedRiverName.toUpperCase()}`, 15, canvas.height - 15);

      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [selectedRiverName, waterLevel, velocity, pollution, activeRiver]);

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto p-2 font-mono text-xs text-zinc-300">
      
      {/* Title */}
      <div className="border-b border-zinc-900 pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest leading-none">Simulation & 3D Twins</p>
          <h2 className="text-xl font-bold text-white mt-1.5 flex items-center gap-2">
            <Waves className="w-5 h-5 text-emerald-400" />
            3D DIGITAL TWIN & HYDRODYNAMIC SIMULATOR
          </h2>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Settings and controls panel */}
        <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-5 shadow-lg flex flex-col gap-5">
          <h3 className="text-xs font-bold text-white border-b border-zinc-900 pb-2.5 flex items-center gap-2">
            <Settings className="w-3.5 h-3.5 text-emerald-400" />
            SIMULATION INPUT KNOBS
          </h3>

          {/* Select River */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] text-zinc-500 uppercase font-bold">Select Active Basin</label>
            <select
              value={selectedRiverName}
              title="Select Active Basin"
              onChange={(e) => setSelectedRiverName(e.target.value)}
              className="w-full px-2.5 py-2 bg-zinc-900 border border-zinc-800 rounded text-xs focus:outline-none text-zinc-300"
            >
              {RIVERS.map(r => <option key={r.name} value={r.name}>{r.name} River ({r.lengthKm} km)</option>)}
            </select>
          </div>

          {/* Water Level Knob */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between font-bold">
              <label className="text-[9px] text-zinc-500 uppercase">Water Level</label>
              <span className="text-emerald-400">{waterLevel} cm</span>
            </div>
            <input
              type="range"
              min="50"
              max="350"
              title="Water Level Selector"
              value={waterLevel}
              onChange={(e) => setWaterLevel(Number(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
          </div>

          {/* Flow Velocity */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between font-bold">
              <label className="text-[9px] text-zinc-500 uppercase">Flow Velocity</label>
              <span className="text-emerald-400">{velocity.toFixed(1)} m/s</span>
            </div>
            <input
              type="range"
              min="0.2"
              max="5.0"
              step="0.1"
              title="Flow Velocity Selector"
              value={velocity}
              onChange={(e) => setVelocity(Number(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
          </div>

          {/* Chemical Concentration / Pollution */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between font-bold">
              <label className="text-[9px] text-zinc-500 uppercase">Chemical Spill Ratio</label>
              <span className="text-purple-400">{pollution}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              title="Chemical Spill Ratio Selector"
              value={pollution}
              onChange={(e) => setPollution(Number(e.target.value))}
              className="w-full accent-purple-500 cursor-pointer"
            />
          </div>

          {/* Layer visibility toggles */}
          <div className="border-t border-zinc-900 pt-4 mt-2 flex flex-col gap-3">
            <span className="text-[9px] text-zinc-500 uppercase font-bold">Stacked GIS layers</span>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={activeLayers.dem}
                  title="Toggle DEM Layer"
                  onChange={(e) => setActiveLayers(prev => ({ ...prev, dem: e.target.checked }))}
                  className="rounded border-zinc-800 bg-zinc-900 text-emerald-500 focus:ring-0 cursor-pointer"
                />
                <span>Raster DEM (River Bed depth elevation)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={activeLayers.vector}
                  title="Toggle Vector Layer"
                  onChange={(e) => setActiveLayers(prev => ({ ...prev, vector: e.target.checked }))}
                  className="rounded border-zinc-800 bg-zinc-900 text-emerald-500 focus:ring-0 cursor-pointer"
                />
                <span>Vector Feature Class (Centerline & banks)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={activeLayers.shapefile}
                  title="Toggle Shapefile Layer"
                  onChange={(e) => setActiveLayers(prev => ({ ...prev, shapefile: e.target.checked }))}
                  className="rounded border-zinc-800 bg-zinc-900 text-emerald-500 focus:ring-0 cursor-pointer"
                />
                <span>Land Cover Boundary Shapefiles</span>
              </label>
            </div>
          </div>
        </div>

        {/* 3D Canvas Twin and Layers Stack */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          
          {/* Main 3D Canvas */}
          <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-5 shadow-lg flex flex-col gap-4">
            <h3 className="text-xs font-bold text-white border-b border-zinc-900 pb-2.5 flex items-center gap-2">
              <Cpu className="w-3.5 h-3.5 text-emerald-400" />
              3D RIVERBED CROSS-SECTION TWIN
            </h3>
            <div className="relative w-full bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 shadow-inner flex items-center justify-center">
              <canvas 
                ref={canvasRef} 
                width={500} 
                height={260} 
                className="max-w-full rounded-xl"
              />
            </div>
          </div>

          {/* Interactive Stacked GIS layers (in 3D Perspective) */}
          <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-5 shadow-lg flex flex-col gap-4">
            <h3 className="text-xs font-bold text-white border-b border-zinc-900 pb-2.5 flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              STACKED GIS THEMATIC SCHEMATICS
            </h3>
            
            <div className="h-64 relative flex items-center justify-center overflow-hidden">
              <div 
                className="relative flex flex-col items-center transition-all duration-500"
                ref={(el) => {
                  if (el) {
                    el.style.transform = 'rotateX(55deg) rotateZ(-25deg) translateY(-20px)';
                    el.style.transformStyle = 'preserve-3d';
                  }
                }}
              >
                {/* 1. Shapefile Layer */}
                {activeLayers.shapefile && (
                  <div className="w-80 h-28 bg-emerald-500/10 border border-emerald-500/30 rounded-lg shadow-xl p-3 flex flex-col justify-between transition-all duration-300 transform hover:translate-y-[-10px] backdrop-blur-sm"
                       ref={(el) => { if (el) el.style.transform = 'translateZ(60px)'; }}>
                    <div className="flex justify-between items-start">
                      <span className="text-[10px] font-bold text-emerald-400">SHAPEFILE LAYER (SOIL & BOUNDARIES)</span>
                      <span className="text-[8px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1 rounded">VECTOR</span>
                    </div>
                    <div className="w-full h-8 border border-dashed border-emerald-500/20 rounded flex items-center justify-center text-[8px] text-slate-500">
                      Surrounding Agricultural & Urban Buffer Zones
                    </div>
                  </div>
                )}

                {/* 2. Feature Class Layer */}
                {activeLayers.vector && (
                  <div className="w-80 h-28 bg-blue-500/10 border border-blue-500/30 rounded-lg shadow-xl p-3 flex flex-col justify-between transition-all duration-300 mt-[-50px] backdrop-blur-sm"
                       ref={(el) => { if (el) el.style.transform = 'translateZ(30px)'; }}>
                    <div className="flex justify-between items-start">
                      <span className="text-[10px] font-bold text-blue-400">FEATURE CLASS (RIVER CENTERLINES)</span>
                      <span className="text-[8px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-1 rounded">VECTOR</span>
                    </div>
                    <div className="w-full h-8 border border-dashed border-blue-500/20 rounded flex items-center justify-center text-[8px] text-slate-500">
                      Path: {activeRiver.name} Centerline Reach (UTM 44N)
                    </div>
                  </div>
                )}

                {/* 3. DEM Raster Layer */}
                {activeLayers.dem && (
                  <div className="w-80 h-28 bg-purple-500/10 border border-purple-500/30 rounded-lg shadow-xl p-3 flex flex-col justify-between transition-all duration-300 mt-[-50px] backdrop-blur-sm"
                       ref={(el) => { if (el) el.style.transform = 'translateZ(0px)'; }}>
                    <div className="flex justify-between items-start">
                      <span className="text-[10px] font-bold text-purple-400">RASTER DEM (ELEVATION GRID)</span>
                      <span className="text-[8px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1 rounded">RASTER</span>
                    </div>
                    <div className="w-full h-8 border border-dashed border-purple-500/20 rounded flex items-center justify-center text-[8px] text-slate-500">
                      Channel Depth Profile: -{activeRiver.depth.toFixed(1)}m Bed Grid Mesh
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Analytics Graph of Risk Progression */}
      <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-5 shadow-lg flex flex-col gap-4">
        <h3 className="text-xs font-bold text-white border-b border-zinc-900 pb-2.5 flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          SIMULATION TIME-SERIES RISK TRENDS
        </h3>
        
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#222" />
              <XAxis dataKey="time" stroke="#666" fontSize={9} />
              <YAxis stroke="#666" fontSize={9} domain={[0, 100]} />
              <Tooltip contentStyle={{ backgroundColor: '#111', borderColor: '#333', fontSize: 10, fontFamily: 'monospace' }} />
              <Legend wrapperStyle={{ fontSize: 9 }} />
              <Line type="monotone" dataKey="Flood Risk %" stroke="#ef4444" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Pollution Index %" stroke="#a855f7" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
};
