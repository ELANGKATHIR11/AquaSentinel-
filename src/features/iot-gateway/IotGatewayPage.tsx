import React, { useState, useEffect, useRef } from 'react';
import { 
  Wifi, 
  Radio, 
  Terminal, 
  Settings, 
  Play, 
  Square, 
  Cpu, 
  Copy, 
  Check, 
  Layers, 
  TrendingUp, 
  AlertTriangle,
  FileCode,
  Gauge
} from 'lucide-react';

interface TelemetryPayload {
  sensor_id: string;
  timestamp: string;
  water_level_cm: number;
  ph: number;
  turbidity_ntu: number;
  temperature_c: number;
  dissolved_oxygen_mg: number;
  battery_voltage: number;
  rssi: number;
}

export const IotGatewayPage: React.FC = () => {
  const [protocol, setProtocol] = useState<'MQTT' | 'HTTP_WEBHOOK' | 'WEBSOCKET'>('MQTT');
  const [brokerUrl, setBrokerUrl] = useState('mqtt://broker.hivemq.com:1883');
  const [topic, setTopic] = useState('aquasentinel/telemetry');
  const [authKey, setAuthKey] = useState('aq-gate-token-99x8');
  
  // Streaming state
  const [isStreaming, setIsStreaming] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [activeTelemetry, setActiveTelemetry] = useState<TelemetryPayload>({
    sensor_id: 'BUOY-404-LIVE',
    timestamp: new Date().toISOString(),
    water_level_cm: 120.4,
    ph: 7.2,
    turbidity_ntu: 3.8,
    temperature_c: 26.5,
    dissolved_oxygen_mg: 6.8,
    battery_voltage: 4.02,
    rssi: -65
  });

  // Copied snippet state
  const [activeSnippetTab, setActiveSnippetTab] = useState<'esp32' | 'micropython' | 'nodejs'>('esp32');
  const [isCopied, setIsCopied] = useState(false);

  const streamTimer = useRef<number | null>(null);

  // ML Predictions logic
  const calculatePredictions = (tel: TelemetryPayload) => {
    // 1. Flood Risk Model (Logistic approximation based on Water Level)
    // Water level normal range is 50cm to 150cm. Threshold >180cm is warning, >220cm critical.
    let floodProb = 0.05;
    if (tel.water_level_cm > 100) {
      // Exponential scaling from 100 to 250
      floodProb = Math.min(0.99, 0.05 + Math.pow((tel.water_level_cm - 100) / 150, 2) * 0.94);
    }
    
    let floodLevel = 'LOW';
    if (floodProb > 0.75) floodLevel = 'CRITICAL';
    else if (floodProb > 0.45) floodLevel = 'MODERATE';
    
    // 2. Pollution Level Model (based on pH, Turbidity, DO anomalies)
    // pH anomaly if < 6.5 or > 8.5
    // Turbidity anomaly if > 10 NTU
    // DO anomaly if < 4.5 mg/L
    let phDev = Math.max(0, 6.5 - tel.ph) + Math.max(0, tel.ph - 8.5);
    let turbDev = Math.max(0, tel.turbidity_ntu - 5.0) / 5.0;
    let doDev = Math.max(0, 5.0 - tel.dissolved_oxygen_mg) / 2.0;
    
    const anomalyProb = Math.min(0.99, Math.max(0.02, (phDev * 0.3) + (turbDev * 0.4) + (doDev * 0.3)));
    let pollutionStatus = 'NORMAL';
    if (anomalyProb > 0.7) pollutionStatus = 'HIGH ANOMALY';
    else if (anomalyProb > 0.35) pollutionStatus = 'WARNING';

    return { floodProb, floodLevel, anomalyProb, pollutionStatus };
  };

  const predictions = calculatePredictions(activeTelemetry);

  // Simulate incoming IoT data packet stream
  useEffect(() => {
    if (isStreaming) {
      // Append initial connection log
      setLogs(prev => [
        `[${new Date().toISOString().slice(11,19)}] [SYS_GW] Established listener on protocol: ${protocol}`,
        `[${new Date().toISOString().slice(11,19)}] [SYS_GW] Endpoint configured: ${protocol === 'MQTT' ? topic : '/api/v1/telemetry/live'}`,
        ...prev
      ]);

      streamTimer.current = window.setInterval(() => {
        // Generate random walk telemetry parameters
        setActiveTelemetry(prev => {
          const newTel = {
            sensor_id: 'BUOY-404-LIVE',
            timestamp: new Date().toISOString(),
            // Random walk water level
            water_level_cm: Math.max(50, Math.min(300, prev.water_level_cm + (Math.random() - 0.48) * 12)),
            // Random walk pH
            ph: Math.max(4.0, Math.min(10.0, prev.ph + (Math.random() - 0.5) * 0.15)),
            // Random walk turbidity
            turbidity_ntu: Math.max(0.5, Math.min(45.0, prev.turbidity_ntu + (Math.random() - 0.48) * 2.2)),
            temperature_c: Math.max(15, Math.min(38, prev.temperature_c + (Math.random() - 0.5) * 0.2)),
            dissolved_oxygen_mg: Math.max(1.0, Math.min(12.0, prev.dissolved_oxygen_mg + (Math.random() - 0.52) * 0.3)),
            battery_voltage: Math.max(3.3, Math.min(4.2, prev.battery_voltage - 0.0001)), // slow decay
            rssi: Math.max(-100, Math.min(-40, prev.rssi + Math.floor((Math.random() - 0.5) * 4)))
          };

          // Append raw log message
          setLogs(logPrev => [
            `[${new Date().toISOString().slice(11,19)}] [DATA_RECV] Received payload from client ${newTel.sensor_id}: ` + 
            `{water_level_cm: ${newTel.water_level_cm.toFixed(1)}, ph: ${newTel.ph.toFixed(2)}, turbidity_ntu: ${newTel.turbidity_ntu.toFixed(2)}, DO: ${newTel.dissolved_oxygen_mg.toFixed(1)}}`,
            ...logPrev.slice(0, 48) // cap logs size at 50
          ]);

          return newTel;
        });
      }, 2000);
    } else {
      if (streamTimer.current) {
        clearInterval(streamTimer.current);
      }
      setLogs(prev => [`[${new Date().toISOString().slice(11,19)}] [SYS_GW] Listener stopped.`, ...prev]);
    }

    return () => {
      if (streamTimer.current) clearInterval(streamTimer.current);
    };
  }, [isStreaming, protocol, topic]);

  // Code Snippets Data
  const snippets = {
    esp32: `// Arduino C++ Code for ESP32 with sensors
#include <WiFi.h>
#include <HTTPClient.h>

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* serverUrl = "http://localhost:3000/api/v1/telemetry/live";
const char* authKey = "${authKey}";

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) { delay(500); }
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", String("Bearer ") + authKey);
    
    // Read sensor analogs
    float pHVal = analogRead(32) * 5.0 / 4095.0; // dummy mapping
    float turbidity = analogRead(33) * 100.0 / 4095.0;
    
    String jsonPayload = "{\\"sensor_id\\":\\"BUOY-404-LIVE\\",\\"water_level_cm\\":134.5,\\"ph\\":" + String(pHVal) + ",\\"turbidity_ntu\\":" + String(turbidity) + ",\\"temperature_c\\":27.2,\\"dissolved_oxygen_mg\\":6.5,\\"battery_voltage\\":4.02,\\"rssi\\":-68}";
    
    int httpResponseCode = http.POST(jsonPayload);
    Serial.print("HTTP Response code: ");
    Serial.println(httpResponseCode);
    http.end();
  }
  delay(10000); // Send every 10 seconds
}`,
    micropython: `# MicroPython ESP32 MQTT Publisher
import machine
import time
import network
import ujson
from umqtt.simple import MQTTClient

# WiFi Connection
wlan = network.WLAN(network.STA_IF)
wlan.active(True)
wlan.connect('YOUR_WIFI_SSID', 'YOUR_WIFI_PASSWORD')
while not wlan.isconnected():
    time.sleep(0.5)

# MQTT Broker config
CLIENT_ID = "BUOY-404-LIVE"
BROKER = "${brokerUrl.replace('mqtt://', '').split(':')[0]}"
TOPIC = "${topic}"

client = MQTTClient(CLIENT_ID, BROKER)
client.connect()

adc_ph = machine.ADC(machine.Pin(32))

while True:
    ph_raw = adc_ph.read()
    ph_val = (ph_raw / 4095.0) * 14.0 # simple scaling
    
    payload = {
        "sensor_id": CLIENT_ID,
        "water_level_cm": 128.4,
        "ph": ph_val,
        "turbidity_ntu": 4.5,
        "temperature_c": 26.8,
        "dissolved_oxygen_mg": 7.1,
        "battery_voltage": 3.98,
        "rssi": -65
    }
    
    client.publish(TOPIC, ujson.dumps(payload))
    print("Published payload:", payload)
    time.sleep(10)
`,
    nodejs: `// Node.js Simulated Node Client
const mqtt = require('mqtt');

const brokerUrl = '${brokerUrl}';
const topic = '${topic}';

const client = mqtt.connect(brokerUrl);

client.on('connect', () => {
  console.log('Connected to MQTT Broker.');
  
  // Publish telemetry parameters periodically
  setInterval(() => {
    const payload = {
      sensor_id: 'BUOY-404-LIVE',
      timestamp: new Date().toISOString(),
      water_level_cm: Number((110 + Math.random() * 20).toFixed(1)),
      ph: Number((6.8 + Math.random() * 0.8).toFixed(2)),
      turbidity_ntu: Number((2.0 + Math.random() * 5).toFixed(2)),
      temperature_c: Number((25.0 + Math.random() * 3).toFixed(1)),
      dissolved_oxygen_mg: Number((5.5 + Math.random() * 2).toFixed(1)),
      battery_voltage: 4.10,
      rssi: -62
    };
    
    client.publish(topic, JSON.stringify(payload));
    console.log('Sent Telemetry Packet:', payload);
  }, 5000);
});
`
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(snippets[activeSnippetTab]);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto p-2 font-mono">
      {/* Title block */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-800 pb-4 gap-4">
        <div>
          <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest leading-none">Real-time Telemetry Gateway</p>
          <h2 className="text-xl font-black text-white mt-1.5 flex items-center gap-2">
            <Wifi className="w-5 h-5 text-emerald-400" />
            LIVE IoT GATEWAY & ML INFERENCE
          </h2>
        </div>
        <button
          onClick={() => {
            setIsStreaming(!isStreaming);
          }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold uppercase border tracking-widest cursor-pointer shadow-md transition-all ${
            isStreaming
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20'
              : 'bg-emerald-500 text-slate-950 border-emerald-600 hover:bg-emerald-400'
          }`}
        >
          {isStreaming ? (
            <>
              <Square className="w-3.5 h-3.5 fill-rose-400 text-rose-400" />
              DISCONNECT LIVE LISTENER
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-slate-950 text-slate-950" />
              LISTEN TO IoT GATEWAY
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Connection Settings panel */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold text-white border-b border-slate-800 pb-2.5 mb-4 flex items-center gap-2">
              <Settings className="w-3.5 h-3.5 text-emerald-400" />
              CONNECTION SETTINGS
            </h3>
            
            <div className="flex flex-col gap-4 text-xs">
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] text-slate-400 uppercase font-bold">Ingress Protocol</label>
                <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                  {(['MQTT', 'HTTP_WEBHOOK', 'WEBSOCKET'] as const).map(p => (
                    <button
                      key={p}
                      onClick={() => setProtocol(p)}
                      className={`py-1 text-[9px] font-extrabold uppercase rounded cursor-pointer transition-all ${
                        protocol === p
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {p.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {protocol === 'MQTT' ? (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] text-slate-400 uppercase font-bold">Broker Host URI</label>
                    <input
                      type="text"
                      value={brokerUrl}
                      onChange={(e) => setBrokerUrl(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] text-slate-400 uppercase font-bold">Topic Subscription</label>
                    <input
                      type="text"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] text-slate-400 uppercase font-bold">Webhook endpoint</label>
                    <div className="w-full px-3 py-2 bg-slate-950/60 border border-slate-800 rounded-lg text-slate-500 select-all">
                      http://localhost:3000/api/v1/telemetry/live
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] text-slate-400 uppercase font-bold">Bearer Authorization Token</label>
                    <input
                      type="text"
                      value={authKey}
                      onChange={(e) => setAuthKey(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 mt-6 text-[10px] text-slate-400 flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
              <Radio className="w-3.5 h-3.5" />
              STATUS SUMMARY
            </div>
            <p>Connection State: <b className={isStreaming ? 'text-emerald-400' : 'text-slate-500'}>{isStreaming ? 'LISTENING' : 'OFFLINE'}</b></p>
            <p>Active Device ID: <b className="text-slate-200">{activeTelemetry.sensor_id}</b></p>
            <p>Packets Read: <b className="text-slate-200">{isStreaming ? logs.length : 0}</b></p>
          </div>
        </div>

        {/* Telemetry Logger Panel */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-4 lg:col-span-2">
          <h3 className="text-xs font-bold text-white border-b border-slate-800 pb-2.5 flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            LIVE INGRESS LOG STREAM (JSON TERMINAL)
          </h3>
          <div className="flex-1 bg-slate-950 rounded-xl border border-slate-800 p-4 h-64 overflow-y-auto font-mono text-[9px] text-emerald-500/80 flex flex-col gap-1">
            {logs.length > 0 ? (
              logs.map((log, i) => (
                <div key={i} className="leading-relaxed border-b border-slate-900/50 pb-1 flex gap-2">
                  <span className="text-slate-600 select-none">[{i}]</span>
                  <span>{log}</span>
                </div>
              ))
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-600 font-bold uppercase tracking-widest text-[10px] gap-2">
                <Radio className="w-5 h-5 text-slate-700 animate-pulse" />
                Awaiting connection stream...
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Live Active Device Metrics + ML Inference Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* IoT Active Metrics */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-4 lg:col-span-2">
          <h3 className="text-xs font-bold text-white border-b border-slate-800 pb-2.5 flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5 text-emerald-400" />
            ACTIVE PARSED TELEMETRY ({activeTelemetry.sensor_id})
          </h3>
          
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
            {/* Water Level */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 flex flex-col gap-1">
              <span className="text-[9px] text-slate-500 uppercase font-bold">Water Level</span>
              <span className="text-lg font-black text-white">{activeTelemetry.water_level_cm.toFixed(1)} <span className="text-[10px] text-slate-400 font-normal">cm</span></span>
            </div>
            {/* pH */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 flex flex-col gap-1">
              <span className="text-[9px] text-slate-500 uppercase font-bold">pH Level</span>
              <span className={`text-lg font-black ${
                activeTelemetry.ph < 6.5 || activeTelemetry.ph > 8.5 ? 'text-rose-400' : 'text-emerald-400'
              }`}>{activeTelemetry.ph.toFixed(2)}</span>
            </div>
            {/* Turbidity */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 flex flex-col gap-1">
              <span className="text-[9px] text-slate-500 uppercase font-bold">Turbidity</span>
              <span className="text-lg font-black text-white">{activeTelemetry.turbidity_ntu.toFixed(1)} <span className="text-[10px] text-slate-400 font-normal">NTU</span></span>
            </div>
            {/* DO */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 flex flex-col gap-1">
              <span className="text-[9px] text-slate-500 uppercase font-bold">Dissolved O₂</span>
              <span className="text-lg font-black text-white">{activeTelemetry.dissolved_oxygen_mg.toFixed(1)} <span className="text-[10px] text-slate-400 font-normal">mg/L</span></span>
            </div>
            {/* RSSI / RF Info */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 flex flex-col gap-1">
              <span className="text-[9px] text-slate-500 uppercase font-bold">RF Signal</span>
              <span className="text-lg font-black text-white">{activeTelemetry.rssi} <span className="text-[10px] text-slate-400 font-normal">dBm</span></span>
            </div>
          </div>
        </div>

        {/* Live ML Models Inference */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-4">
          <h3 className="text-xs font-bold text-white border-b border-slate-800 pb-2.5 flex items-center gap-2">
            <Gauge className="w-3.5 h-3.5 text-emerald-400" />
            LIVE ML PREDICTION ENGINE
          </h3>
          
          <div className="flex flex-col gap-4 text-xs font-mono">
            {/* Flood Probability */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between font-bold">
                <span className="text-slate-400">Flood Risk Index:</span>
                <span className={predictions.floodLevel === 'CRITICAL' ? 'text-rose-400' : predictions.floodLevel === 'MODERATE' ? 'text-amber-400' : 'text-emerald-400'}>
                  {Math.round(predictions.floodProb * 100)}% ({predictions.floodLevel})
                </span>
              </div>
              <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800 p-[1px]">
                <div 
                  className={`h-full rounded-full transition-all duration-300 ${
                    predictions.floodLevel === 'CRITICAL' ? 'bg-rose-500' : predictions.floodLevel === 'MODERATE' ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${predictions.floodProb * 100}%` }}
                ></div>
              </div>
            </div>

            {/* Pollution Probability */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between font-bold">
                <span className="text-slate-400">Water Pollution Level:</span>
                <span className={predictions.pollutionStatus === 'HIGH ANOMALY' ? 'text-rose-400' : predictions.pollutionStatus === 'WARNING' ? 'text-amber-400' : 'text-emerald-400'}>
                  {Math.round(predictions.anomalyProb * 100)}% ({predictions.pollutionStatus})
                </span>
              </div>
              <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800 p-[1px]">
                <div 
                  className={`h-full rounded-full transition-all duration-300 ${
                    predictions.pollutionStatus === 'HIGH ANOMALY' ? 'bg-rose-500' : predictions.pollutionStatus === 'WARNING' ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${predictions.anomalyProb * 100}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Code Snippets Panel for Connecting Real IoT Devices */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-800 pb-2.5 gap-2">
          <h3 className="text-xs font-bold text-white flex items-center gap-2">
            <FileCode className="w-3.5 h-3.5 text-emerald-400" />
            CONNECT PHYSICAL MICROCONTROLLERS (ESP32 / RASPBERRY PI)
          </h3>
          <div className="flex gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
            {(['esp32', 'micropython', 'nodejs'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveSnippetTab(tab)}
                className={`px-3 py-1 text-[9px] font-bold uppercase rounded cursor-pointer transition-all ${
                  activeSnippetTab === tab
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {tab === 'esp32' ? 'Arduino C++' : tab === 'micropython' ? 'MicroPython' : 'Node.js'}
              </button>
            ))}
          </div>
        </div>

        <div className="relative">
          <button
            onClick={handleCopy}
            className="absolute top-3 right-3 bg-slate-900 hover:bg-slate-800 text-slate-300 p-2 rounded-lg border border-slate-800 cursor-pointer transition-all active:scale-95 z-10"
          >
            {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <pre className="bg-slate-950 text-slate-300 p-4 rounded-xl border border-slate-800 text-[10px] leading-relaxed overflow-x-auto max-h-80 font-mono select-text">
            {snippets[activeSnippetTab]}
          </pre>
        </div>
      </div>

    </div>
  );
};
