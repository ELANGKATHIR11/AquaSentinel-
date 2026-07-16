import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Sensor, Telemetry } from '../types';
import { SITE_POLYGONS } from '../utils/mockData';
import { Navigation, MapPin } from 'lucide-react';

interface GisMapProps {
  sensors: Sensor[];
  selectedSensorId: string | null;
  onSelectSensor: (id: string | null) => void;
  center: [number, number];
  zoom: number;
  satelliteLayer: boolean;
  alertZonesLayer: boolean;
  heatmapLayer: boolean;
}

export const GisMap: React.FC<GisMapProps> = ({
  sensors,
  selectedSensorId,
  onSelectSensor,
  center,
  zoom,
  satelliteLayer,
  alertZonesLayer,
  heatmapLayer,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  
  // Geolocation states
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [userAccuracy, setUserAccuracy] = useState<number | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'locating' | 'success' | 'error'>('idle');
  const [gpsError, setGpsError] = useState<string | null>(null);
  
  const hasCenteredRef = useRef<boolean>(false);
  const watchIdRef = useRef<number | null>(null);
  
  // Keep track of layers in refs to update them dynamically
  const markersGroupRef = useRef<L.LayerGroup | null>(null);
  const polygonsGroupRef = useRef<L.LayerGroup | null>(null);
  const heatmapGroupRef = useRef<L.LayerGroup | null>(null);
  const userLocationGroupRef = useRef<L.LayerGroup | null>(null);
  
  const tileLayersRef = useRef<{
    dark: L.TileLayer;
    satellite: L.TileLayer;
    osm: L.TileLayer;
  } | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Create Leaflet Map instance
    const map = L.map(mapContainerRef.current, {
      center,
      zoom,
      zoomControl: false, // will add custom positioned zoom control
      attributionControl: true,
    });

    mapRef.current = map;

    // Create Tile Layers
    const dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{y}/{x}{r}.png', {
      attribution: '&copy; CartoDB &copy; OpenStreetMap contributors',
    });

    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Esri, Maxar, Earthstar Geographics, and GIS User Community',
    });

    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{y}/{x}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    });

    tileLayersRef.current = { dark, satellite, osm };

    // Set Default Base Layer
    dark.addTo(map);

    // Zoom Control in bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Create overlay groups
    markersGroupRef.current = L.layerGroup().addTo(map);
    polygonsGroupRef.current = L.layerGroup().addTo(map);
    heatmapGroupRef.current = L.layerGroup().addTo(map);
    userLocationGroupRef.current = L.layerGroup().addTo(map);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Sync Map View (center & zoom)
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setView(center, zoom, { animate: true, duration: 0.8 });
    }
  }, [center, zoom]);

  // System Geolocation Tracking Watcher
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGpsStatus('error');
      setGpsError('Geolocation is not supported by your browser.');
      return;
    }

    setGpsStatus('locating');

    const success = (position: GeolocationPosition) => {
      const { latitude, longitude, accuracy } = position.coords;
      const newCoords: [number, number] = [latitude, longitude];
      setUserLocation(newCoords);
      setUserAccuracy(accuracy);
      setGpsStatus('success');
      setGpsError(null);

      // Auto-center map once on first successful coordinates fetch
      if (!hasCenteredRef.current && mapRef.current) {
        hasCenteredRef.current = true;
        mapRef.current.setView(newCoords, 13);
      }
    };

    const error = (err: GeolocationPositionError) => {
      console.warn('Geolocation error:', err.message);
      let msg = 'Could not retrieve GPS location.';
      if (err.code === err.PERMISSION_DENIED) {
        msg = 'GPS permission was denied.';
      } else if (err.code === err.POSITION_UNAVAILABLE) {
        msg = 'GPS position is unavailable.';
      } else if (err.code === err.TIMEOUT) {
        msg = 'GPS request timed out.';
      }
      setGpsStatus('error');
      setGpsError(msg);
    };

    watchIdRef.current = navigator.geolocation.watchPosition(success, error, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // Render User Position Marker & Accuracy Circles
  useEffect(() => {
    const group = userLocationGroupRef.current;
    if (!group || !userLocation) return;

    group.clearLayers();

    // Pulser CSS and divIcon creation
    const userIcon = L.divIcon({
      className: 'user-live-gps-marker',
      html: `
        <style>
          @keyframes user-gps-pulse {
            0% { transform: scale(0.8); opacity: 0.8; }
            50% { transform: scale(1.8); opacity: 0.3; }
            100% { transform: scale(2.4); opacity: 0; }
          }
          .gps-pulse-circle {
            animation: user-gps-pulse 2s infinite ease-out;
          }
        </style>
        <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px;">
          <div class="gps-pulse-circle" style="position: absolute; width: 20px; height: 20px; border-radius: 50%; background: #3b82f6; pointer-events: none;"></div>
          <div style="width: 12px; height: 12px; border-radius: 50%; background: #3b82f6; border: 2px solid #ffffff; box-shadow: 0 0 8px rgba(59, 130, 246, 0.8);"></div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    const marker = L.marker(userLocation, { icon: userIcon });
    marker.bindTooltip('<div class="font-mono text-[10px] text-white bg-slate-900 border border-slate-700 px-2 py-1 rounded shadow-lg">Your Current Location</div>', {
      sticky: true,
    });
    group.addLayer(marker);

    // Draw accuracy area if precision is reasonable (< 5000m)
    if (userAccuracy && userAccuracy < 5000) {
      const circle = L.circle(userLocation, {
        radius: userAccuracy,
        color: '#3b82f6',
        weight: 1,
        dashArray: '3, 3',
        fillColor: '#3b82f6',
        fillOpacity: 0.08,
      });
      group.addLayer(circle);
    }
  }, [userLocation, userAccuracy]);

  const handleFlyToUser = () => {
    if (mapRef.current && userLocation) {
      mapRef.current.flyTo(userLocation, 14, { animate: true, duration: 1.5 });
    }
  };

  const retryGeolocation = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    setGpsStatus('locating');
    setGpsError(null);

    if ('geolocation' in navigator) {
      const success = (position: GeolocationPosition) => {
        const { latitude, longitude, accuracy } = position.coords;
        const newCoords: [number, number] = [latitude, longitude];
        setUserLocation(newCoords);
        setUserAccuracy(accuracy);
        setGpsStatus('success');
        setGpsError(null);
        if (mapRef.current) {
          mapRef.current.flyTo(newCoords, 14, { animate: true, duration: 1.5 });
        }
      };

      const error = (err: GeolocationPositionError) => {
        console.warn('Geolocation error:', err.message);
        let msg = 'Could not retrieve GPS location.';
        if (err.code === err.PERMISSION_DENIED) {
          msg = 'GPS permission was denied.';
        }
        setGpsStatus('error');
        setGpsError(msg);
      };

      watchIdRef.current = navigator.geolocation.watchPosition(success, error, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      });
    } else {
      setGpsStatus('error');
      setGpsError('Geolocation not supported.');
    }
  };

  // Sync Base Tile Layer
  useEffect(() => {
    const map = mapRef.current;
    const layers = tileLayersRef.current;
    if (!map || !layers) return;

    if (satelliteLayer) {
      map.removeLayer(layers.dark);
      layers.satellite.addTo(map);
    } else {
      map.removeLayer(layers.satellite);
      layers.dark.addTo(map);
    }
  }, [satelliteLayer]);

  // Render Site Polygons & Heatmap Layers
  useEffect(() => {
    const polygonsGroup = polygonsGroupRef.current;
    const heatmapGroup = heatmapGroupRef.current;
    if (!polygonsGroup || !heatmapGroup) return;

    polygonsGroup.clearLayers();
    heatmapGroup.clearLayers();

    // 1. Draw River Boundary Polygons
    if (alertZonesLayer) {
      SITE_POLYGONS.forEach((site) => {
        const poly = L.polygon(site.coordinates, {
          color: site.color,
          fillColor: site.color,
          fillOpacity: 0.12,
          weight: 1.5,
          dashArray: '4, 4',
        });
        poly.bindTooltip(`<div class="font-mono text-[10px] text-zinc-300 bg-zinc-950 p-1 border border-zinc-800 rounded">${site.name}</div>`, {
          sticky: true,
          className: 'custom-leaflet-tooltip',
        });
        polygonsGroup.addLayer(poly);
      });
    }

    // 2. Draw Simulated Heatmaps around risky nodes
    if (heatmapLayer) {
      sensors.forEach((s) => {
        if (s.status !== 'offline' && s.status !== 'normal') {
          // Determine plume size and color based on severity
          let radius = 800;
          let color = '#eab308'; // Warning - Yellow
          
          if (s.status === 'critical') {
            radius = 1500;
            color = '#ef4444'; // Red
          } else if (s.status === 'high_risk') {
            radius = 1100;
            color = '#f97316'; // Orange
          }

          const plume = L.circle([s.latitude, s.longitude], {
            radius,
            color: 'transparent',
            fillColor: color,
            fillOpacity: 0.18,
          });

          plume.bindTooltip(`<div class="font-mono text-[10px] text-zinc-300 bg-zinc-950 p-1 border border-zinc-800 rounded">Estimated Risk Zone (${s.sensor_id})</div>`, {
            sticky: true,
          });

          heatmapGroup.addLayer(plume);
        }
      });
    }
  }, [alertZonesLayer, heatmapLayer, sensors]);

  // Render Buoy Node Markers
  useEffect(() => {
    const markersGroup = markersGroupRef.current;
    const map = mapRef.current;
    if (!markersGroup || !map) return;

    markersGroup.clearLayers();

    sensors.forEach((sensor) => {
      let color = '#10b981'; // green
      let pulseClass = '';

      if (sensor.status === 'warning') color = '#f59e0b'; // yellow
      else if (sensor.status === 'high_risk') color = '#f97316'; // orange
      else if (sensor.status === 'critical') {
        color = '#ef4444'; // red
        pulseClass = 'pulsing-marker-red';
      } else if (sensor.status === 'offline') color = '#71717a'; // gray

      const markerIcon = L.divIcon({
        className: `custom-buoy-icon-${sensor.sensor_id} ${pulseClass}`,
        html: `
          <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px;">
            <div style="position: absolute; width: 22px; height: 22px; border-radius: 50%; background: ${color}; opacity: 0.2; transform: scale(1.6); pointer-events: none;"></div>
            <div style="width: 14px; height: 14px; border-radius: 50%; background: ${color}; border: 1.5px solid #ffffff; box-shadow: 0 0 8px rgba(0,0,0,0.65); transition: all 0.2s;"></div>
            <span style="position: absolute; top: -14px; font-family: monospace; font-size: 8px; font-weight: bold; background: #09090b; border: 1px solid #27272a; padding: 1px 3px; border-radius: 3px; color: #f4f4f5; pointer-events: none; white-space: nowrap; box-shadow: 0 2px 4px rgba(0,0,0,0.5);">${sensor.sensor_id}</span>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([sensor.latitude, sensor.longitude], {
        icon: markerIcon,
      });

      // Bind dynamic popup
      const popupHtml = `
        <div class="p-3 bg-zinc-950 text-zinc-100 rounded-md select-text font-sans">
          <div class="flex items-center justify-between border-b border-zinc-900 pb-2 mb-2">
            <span class="text-xs font-bold text-zinc-100 font-mono">${sensor.sensor_id}: ${sensor.name}</span>
            <span class="px-1.5 py-0.5 rounded text-[9px] font-mono capitalize ${
              sensor.status === 'normal' ? 'bg-emerald-500/10 text-emerald-400' :
              sensor.status === 'offline' ? 'bg-zinc-500/10 text-zinc-400' : 'bg-rose-500/10 text-rose-400'
            }">${sensor.status}</span>
          </div>
          <div class="grid grid-cols-2 gap-2 text-[10px] font-mono text-zinc-400 mb-3">
            <div>Water Health: <b class="text-zinc-200">${sensor.water_health_score}/100</b></div>
            <div>Flood Risk: <b class="text-zinc-200">${Math.round(sensor.flood_risk_score * 100)}%</b></div>
            <div>Anomaly Prob: <b class="text-zinc-200">${Math.round(sensor.pollution_anomaly_score * 100)}%</b></div>
            <div>Battery: <b class="text-zinc-200">${sensor.battery_voltage}V</b></div>
          </div>
          <div class="text-[9px] text-zinc-500 mb-2">Last seen: ${new Date(sensor.last_seen).toLocaleString()}</div>
          <button 
            id="popup-btn-${sensor.sensor_id}"
            class="w-full text-center py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-100 text-xs font-semibold rounded border border-zinc-800 transition-all cursor-pointer"
          >
            Inspect Buoy Analytics
          </button>
        </div>
      `;

      marker.bindPopup(popupHtml, {
        closeButton: false,
        offset: [0, -4],
      });

      // Pop-up inspect action listener
      marker.on('popupopen', () => {
        setTimeout(() => {
          const btn = document.getElementById(`popup-btn-${sensor.sensor_id}`);
          if (btn) {
            btn.onclick = (e) => {
              e.stopPropagation();
              onSelectSensor(sensor.sensor_id);
              marker.closePopup();
            };
          }
        }, 50);
      });

      // Selection feedback
      if (selectedSensorId === sensor.sensor_id) {
        // highlight selected node marker
        setTimeout(() => {
          marker.openPopup();
        }, 100);
      }

      markersGroup.addLayer(marker);
    });
  }, [sensors, selectedSensorId, onSelectSensor]);

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden border border-slate-800 shadow-xl">
      {/* Map Container Ref */}
      <div ref={mapContainerRef} className="w-full h-full animate-fade-in" style={{ minHeight: '380px' }} />

      {/* Floating Compact Info & GPS Geolocation Overlay */}
      <div className="absolute top-3 left-3 z-[1000] p-4 rounded-xl border border-slate-800 bg-slate-900/95 backdrop-blur-sm shadow-2xl max-w-[240px] font-mono text-[10px] text-slate-300">
        <h5 className="font-bold text-white mb-1.5 text-xs tracking-wider uppercase">Map Telemetry</h5>
        <p className="mb-2.5 text-slate-400">Center: {center[0].toFixed(4)}°N, {center[1].toFixed(4)}°E</p>
        
        <div className="flex flex-wrap gap-1.5 mb-3 pb-3 border-b border-slate-800">
          <span className="bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-[9px]">Nodes: {sensors.length}</span>
          <span className="bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-[9px] text-emerald-400">Active: {sensors.filter(s => s.status !== 'offline').length}</span>
          <span className="bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-[9px] text-rose-400">Alerts: {sensors.filter(s => s.status === 'critical' || s.status === 'high_risk').length}</span>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">SYSTEM GPS</span>
            <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase ${
              gpsStatus === 'success' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
              gpsStatus === 'locating' ? 'bg-amber-500/20 text-amber-400 animate-pulse border border-amber-500/30' :
              'bg-rose-500/20 text-rose-400 border border-rose-500/30'
            }`}>
              {gpsStatus}
            </span>
          </div>

          {userLocation ? (
            <div className="flex flex-col gap-1.5">
              <div className="text-[9px] text-slate-400 flex flex-col gap-0.5 bg-slate-950/60 p-2 rounded border border-slate-800/80">
                <p className="flex justify-between"><span>Lat:</span> <span className="text-slate-200 font-bold">{userLocation[0].toFixed(5)}°</span></p>
                <p className="flex justify-between"><span>Lng:</span> <span className="text-slate-200 font-bold">{userLocation[1].toFixed(5)}°</span></p>
                {userAccuracy && <p className="flex justify-between text-[8px] text-slate-500 mt-0.5 pt-0.5 border-t border-slate-900"><span>Accuracy:</span> <span>&plusmn;{userAccuracy.toFixed(0)}m</span></p>}
              </div>
              
              <button
                type="button"
                onClick={handleFlyToUser}
                className="w-full py-1.5 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-extrabold text-[10px] rounded-lg border border-emerald-600 shadow-lg transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Navigation className="w-3.5 h-3.5 fill-slate-950" />
                PAN TO LIVE GPS
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {gpsError ? (
                <p className="text-[9px] text-rose-400 font-medium leading-relaxed bg-rose-950/15 border border-rose-900/30 p-2 rounded-lg">{gpsError}</p>
              ) : (
                <p className="text-[9px] text-slate-500 leading-relaxed bg-slate-950/30 p-2 rounded-lg">Awaiting system authorization...</p>
              )}
              
              <button
                type="button"
                onClick={retryGeolocation}
                className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-750 text-slate-200 font-bold text-[10px] rounded-lg border border-slate-700 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                RETRY SYSTEM GPS
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
