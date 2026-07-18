import React, { useEffect, useState, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, Polygon, Circle, useMap, GeoJSON, ImageOverlay, WMSTileLayer } from 'react-leaflet';
import L from 'leaflet';
import { Sensor, Telemetry } from '../../../types';
import { SITE_POLYGONS } from '../../../utils/mockData';
import { Navigation, MapPin, Activity, Shield, Flame } from 'lucide-react';
import { useDashboardStore } from '../../../stores/useDashboardStore';


// Bounding box of the feb2020 raster from change_assess.gdb (Thoothukudi Estuary)
const FEB_2020_RASTER_BOUNDS: [[number, number], [number, number]] = [
  [8.581261051981473, 77.98955563515246],
  [8.629306740376919, 78.03921781399859]
];

// Beautiful glowing blue/cyan water extent simulation overlay representing the processed feb2020 raster
const MOCK_RASTER_FLOOD_URL = "data:image/svg+xml;utf8," + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="500" height="500">
  <path d="M 120,420 Q 220,300 280,250 T 400,80" fill="none" stroke="%230ea5e9" stroke-width="40" opacity="0.4" stroke-linecap="round" />
  <path d="M 120,420 Q 220,300 280,250 T 400,80" fill="none" stroke="%2338bdf8" stroke-width="20" opacity="0.6" stroke-linecap="round" />
  <circle cx="280" cy="250" r="50" fill="%230284c7" opacity="0.5" />
  <circle cx="220" cy="310" r="70" fill="%230f172a" opacity="0.3" />
  <circle cx="340" cy="180" r="45" fill="%230284c7" opacity="0.4" />
</svg>
`);

interface MapProviderProps {
  sensors: Sensor[];
  selectedSensorId: string | null;
  onSelectSensor: (id: string | null) => void;
  center: [number, number];
  zoom: number;
  satelliteLayer?: boolean;
  alertZonesLayer?: boolean;
  heatmapLayer?: boolean;
}

// Sub-component to dynamically update the Leaflet map's view when center/zoom props change
interface MapViewUpdaterProps {
  center: [number, number];
  zoom: number;
}

const MapViewUpdater: React.FC<MapViewUpdaterProps> = ({ center, zoom }) => {
  const map = useMap();
  const prevCenterRef = useRef<[number, number]>(center);
  const prevZoomRef = useRef<number>(zoom);

  useEffect(() => {
    const centerChanged = prevCenterRef.current[0] !== center[0] || prevCenterRef.current[1] !== center[1];
    const zoomChanged = prevZoomRef.current !== zoom;

    if (centerChanged || zoomChanged) {
      map.setView(center, zoom, { animate: true, duration: 0.8 });
      prevCenterRef.current = center;
      prevZoomRef.current = zoom;
    }
  }, [center, zoom, map]);

  return null;
};

// Sub-component to capture the raw map instance so sibling UI controls can control it
interface MapInstanceTrackerProps {
  onMapReady: (map: L.Map) => void;
}

const MapInstanceTracker: React.FC<MapInstanceTrackerProps> = ({ onMapReady }) => {
  const map = useMap();
  useEffect(() => {
    if (map) {
      onMapReady(map);
    }
  }, [map, onMapReady]);
  return null;
};

export const MapProvider: React.FC<MapProviderProps> = ({
  sensors,
  selectedSensorId,
  onSelectSensor,
  center,
  zoom,
  satelliteLayer = false,
  alertZonesLayer = true,
  heatmapLayer = false,
}) => {
  const { theme } = useDashboardStore();
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const [centerlinesGeoJson, setCenterlinesGeoJson] = useState<any>(null);
  const [surfacesGeoJson, setSurfacesGeoJson] = useState<any>(null);

  useEffect(() => {
    fetch('/data/processed/tamil_nadu_top10_rivers.geojson')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load centerlines');
        return res.json();
      })
      .then(data => setCenterlinesGeoJson(data))
      .catch(err => console.warn(err));

    fetch('/data/processed/tamil_nadu_top10_river_surfaces.geojson')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load surfaces');
        return res.json();
      })
      .then(data => setSurfacesGeoJson(data))
      .catch(err => console.warn(err));
  }, []);

  // Geolocation tracking states
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [userAccuracy, setUserAccuracy] = useState<number | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'locating' | 'success' | 'error'>('idle');
  const [gpsError, setGpsError] = useState<string | null>(null);

  const hasCenteredRef = useRef<boolean>(false);
  const watchIdRef = useRef<number | null>(null);

  // Map instance registry callback
  const handleMapReady = useCallback((map: L.Map) => {
    setMapInstance(map);
  }, []);

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

      // Startup auto-centering disabled to prevent map from flying away from Tamil Nadu rivers on load.
      hasCenteredRef.current = true;
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
  }, [mapInstance]);

  const handleFlyToUser = () => {
    if (mapInstance && userLocation) {
      mapInstance.flyTo(userLocation, 14, { animate: true, duration: 1.5 });
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
        if (mapInstance) {
          mapInstance.flyTo(newCoords, 14, { animate: true, duration: 1.5 });
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

  // Pulser CSS and divIcon for live GPS marker
  const userIcon = userLocation ? L.divIcon({
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
  }) : undefined;

  return (
    <div className="relative w-full h-full min-h-full rounded-xl overflow-hidden border border-slate-800 shadow-xl">
      {/* Leaflet Map via react-leaflet */}
      <MapContainer
        center={center}
        zoom={zoom}
        className="w-full h-full min-h-full"
        zoomControl={true}
      >
        {/* Dynamic update center & zoom */}
        <MapViewUpdater center={center} zoom={zoom} />
        <MapInstanceTracker onMapReady={handleMapReady} />

        {/* Base Map Layers */}
        {satelliteLayer ? (
          <TileLayer
            attribution="Esri, Maxar, Earthstar Geographics, and GIS User Community"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
        ) : theme === 'light' ? (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            maxZoom={20}
          />
        ) : (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            maxZoom={20}
          />
        )}



        {/* Processed flood mapping raster (from change_assess.gdb - feb2020) */}
        {alertZonesLayer && (
          <ImageOverlay
            url={MOCK_RASTER_FLOOD_URL}
            bounds={FEB_2020_RASTER_BOUNDS}
            opacity={0.65}
          />
        )}

        {/* Real river vector overlays (Feature Class / GeoJSON) */}
        {alertZonesLayer && surfacesGeoJson && (
          <GeoJSON 
            data={surfacesGeoJson}
            style={{
              color: '#c084fc',
              weight: 1.5,
              fillColor: '#c084fc',
              fillOpacity: 0.35
            }}
            onEachFeature={(feature, layer) => {
              const props = feature.properties || {};
              layer.bindTooltip(`
                <div class="font-mono text-[9px] text-zinc-300 bg-zinc-950 px-2 py-1 border border-zinc-800 rounded shadow-md">
                  <span class="font-bold text-white uppercase">${props.river_name || 'River Surface'}</span> (Surface)
                </div>
              `, { sticky: true });

              layer.bindPopup(`
                <div class="p-3 bg-zinc-950 text-zinc-100 rounded-md select-text font-mono text-[10px] border border-zinc-800 shadow-2xl min-w-[260px]">
                  <div class="flex items-center justify-between border-b border-zinc-800 pb-2 mb-2">
                    <span class="text-xs font-bold text-purple-400 uppercase tracking-wider">${props.river_name || 'River Surface'}</span>
                    <span class="bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase">ID: ${props.river_id || 'N/A'}</span>
                  </div>
                  <div class="flex flex-col gap-1.5 leading-relaxed">
                    <p class="flex justify-between"><span>Surface Area:</span> <span class="text-white font-bold">${props.river_surface_area_km2 || 'N/A'} km²</span></p>
                    <p class="flex justify-between"><span>Perimeter:</span> <span class="text-white font-bold">${props.river_surface_perimeter_km || 'N/A'} km</span></p>
                    <p class="text-[8px] text-zinc-500 mt-1.5 pt-1.5 border-t border-zinc-900 uppercase text-right">Source: OSM Water Surface</p>
                  </div>
                </div>
              `);
            }}
          />
        )}

        {alertZonesLayer && centerlinesGeoJson && (
          <GeoJSON 
            data={centerlinesGeoJson}
            style={{
              color: '#0ea5e9',
              weight: 3.5,
              opacity: 0.85
            }}
            onEachFeature={(feature, layer) => {
              const props = feature.properties || {};
              layer.bindTooltip(`
                <div class="font-mono text-[9px] text-zinc-300 bg-zinc-950 px-2 py-1 border border-zinc-800 rounded shadow-md">
                  <span class="font-bold text-white uppercase">${props.river_name || 'River'}</span>
                </div>
              `, { sticky: true });

              layer.bindPopup(`
                <div class="p-3 bg-zinc-950 text-zinc-100 rounded-md select-text font-mono text-[10px] border border-zinc-800 shadow-2xl min-w-[270px]">
                  <div class="flex items-center justify-between border-b border-zinc-800 pb-2 mb-2">
                    <span class="text-xs font-bold text-sky-400 uppercase tracking-wider">${props.river_name || 'River Details'}</span>
                    <span class="bg-sky-500/10 text-sky-400 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase">ID: ${props.river_id || 'N/A'}</span>
                  </div>
                  <div class="flex flex-col gap-1.5 leading-relaxed">
                    <p class="text-[8px] text-zinc-400 italic mb-1">${props.alternate_names ? `Alt: ${props.alternate_names}` : ''}</p>
                    <p class="flex justify-between"><span>Length:</span> <span class="text-white font-bold">${props.length_km || props.line_perimeter_km || 'N/A'} km</span></p>
                    <p class="flex justify-between"><span>Basin Area:</span> <span class="text-white font-bold">${props.basin_area_km2 || 'N/A'} km²</span></p>
                    
                    <div class="border-t border-zinc-900 my-1 pt-1.5 flex flex-col gap-1">
                      <p class="text-[8px] text-sky-400 font-bold uppercase tracking-wider">Elevation profile (DEM)</p>
                      <p class="flex justify-between"><span>Source Elevation:</span> <span class="text-emerald-400 font-bold">${props.source_elevation_m !== undefined ? props.source_elevation_m : 'N/A'} m</span></p>
                      <p class="flex justify-between"><span>Mouth Elevation:</span> <span class="text-emerald-400 font-bold">${props.mouth_elevation_m !== undefined ? props.mouth_elevation_m : 'N/A'} m</span></p>
                      <p class="flex justify-between"><span>Elevation Drop:</span> <span class="text-amber-400 font-bold">${props.elevation_drop_m !== undefined ? props.elevation_drop_m : 'N/A'} m</span></p>
                    </div>
                    
                    <p class="text-[8px] text-zinc-400 mt-1 border-t border-zinc-900 pt-1.5 leading-relaxed">
                      <span class="font-bold text-zinc-300">Districts:</span> ${props.districts_intersected || 'None'}
                    </p>
                    
                    <div class="text-[7px] text-zinc-500 mt-1.5 pt-1.5 border-t border-zinc-900 flex justify-between">
                      <span>Source: ${props.source_dataset || 'HydroRIVERS'}</span>
                      <span>License: ${props.source_license || 'CC BY 4.0'}</span>
                    </div>
                  </div>
                </div>
              `);
            }}
          />
        )}

        {/* Alert Zones - River Basin Polygons */}
        {alertZonesLayer && SITE_POLYGONS.map((site) => (
          <Polygon
            key={site.name}
            positions={site.coordinates as [number, number][]}
            pathOptions={{
              color: site.color,
              fillColor: site.color,
              fillOpacity: 0.12,
              weight: 1.5,
              dashArray: '4, 4',
            }}
          >
            <Tooltip sticky className="custom-leaflet-tooltip">
              <div className="font-mono text-[10px] text-zinc-300 bg-zinc-950 p-1 border border-zinc-800 rounded">
                {site.name}
              </div>
            </Tooltip>
          </Polygon>
        ))}

        {/* ISRO Bhuvan Hydrology & Waterbodies WMS Base Overlay */}
        {heatmapLayer && (
          <>
            <WMSTileLayer
              url="https://bhuvan-vec2.nrsc.gov.in/bhuvan/wms"
              layers="lulc:LULC50K_1516"
              format="image/png"
              transparent={true}
              version="1.1.1"
              opacity={0.4}
              attribution="Map data &copy; Bhuvan: ISRO/NRSC (Hydrological LULC Overlay)"
            />
            <WMSTileLayer
              url="https://bhuvan-vec2.nrsc.gov.in/bhuvan/wms"
              layers="lulc:BR_LULC50K_1112"
              format="image/png"
              transparent={true}
              version="1.1.1"
              opacity={0.3}
              attribution="Map data &copy; Bhuvan: ISRO/NRSC (Water Bodies Layer)"
            />
            <WMSTileLayer
              url="https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi"
              layers="VIIRS_SNPP_Chlorophyll_A"
              format="image/png"
              transparent={true}
              version="1.1.1"
              opacity={0.5}
              attribution="NASA GIBS / Suomi-NPP (Chlorophyll-A Plumes)"
            />
            <WMSTileLayer
              url="https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi"
              layers="MODIS_Terra_CorrectedReflectance_TrueColor"
              format="image/jpeg"
              transparent={true}
              version="1.1.1"
              opacity={0.3}
              attribution="NASA GIBS / Terra MODIS (Corrected Reflectance True Color)"
            />
          </>
        )}

        {/* Contamination Plumes (Heatmap) */}
        {heatmapLayer && sensors.map((sensor) => {
          if (sensor.status === 'offline' || sensor.status === 'normal') return null;

          let radius = 800;
          let color = '#eab308'; // Warning - Yellow
          
          if (sensor.status === 'critical') {
            radius = 1500;
            color = '#ef4444'; // Red
          } else if (sensor.status === 'high_risk') {
            radius = 1100;
            color = '#f97316'; // Orange
          }

          return (
            <Circle
              key={`heatmap-${sensor.sensor_id}`}
              center={[sensor.latitude, sensor.longitude]}
              radius={radius}
              pathOptions={{
                color: 'transparent',
                fillColor: color,
                fillOpacity: 0.18,
              }}
            >
              <Tooltip sticky>
                <div className="font-mono text-[10px] text-zinc-300 bg-zinc-950 p-1 border border-zinc-800 rounded font-semibold">
                  Estimated Risk Zone ({sensor.sensor_id})
                </div>
              </Tooltip>
            </Circle>
          );
        })}

        {/* User GPS Live Marker */}
        {userLocation && userIcon && (
          <>
            <Marker position={userLocation} icon={userIcon}>
              <Tooltip sticky>
                <div className="font-mono text-[10px] text-white bg-slate-900 border border-slate-700 px-2 py-1 rounded shadow-lg">
                  Your Current Location
                </div>
              </Tooltip>
            </Marker>
            
            {userAccuracy && userAccuracy < 5000 && (
              <Circle
                center={userLocation}
                radius={userAccuracy}
                pathOptions={{
                  color: '#3b82f6',
                  weight: 1,
                  dashArray: '3, 3',
                  fillColor: '#3b82f6',
                  fillOpacity: 0.08,
                }}
              />
            )}
          </>
        )}

        {/* Buoy Sensor Node Markers */}
        {sensors.map((sensor) => {
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

          return (
            <Marker
              key={sensor.sensor_id}
              position={[sensor.latitude, sensor.longitude]}
              icon={markerIcon}
              eventHandlers={{
                click: () => onSelectSensor(sensor.sensor_id),
              }}
            >
              <Popup>
                <div className="p-3 bg-zinc-950 text-zinc-100 rounded-md select-text font-sans">
                  <div className="flex items-center justify-between border-b border-zinc-900 pb-2 mb-2">
                    <span className="text-xs font-bold text-zinc-100 font-mono">{sensor.sensor_id}: {sensor.name}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono capitalize ${
                      sensor.status === 'normal' ? 'bg-emerald-500/10 text-emerald-400' :
                      sensor.status === 'offline' ? 'bg-zinc-500/10 text-zinc-400' : 'bg-rose-500/10 text-rose-400'
                    }`}>
                      {sensor.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] font-mono text-zinc-400">
                    <p>Water Health: <b className="text-zinc-200">{sensor.water_health_score}/100</b></p>
                    <p>Flood Risk: <b className="text-zinc-200">{Math.round(sensor.flood_risk_score * 100)}%</b></p>
                    <p>Anomaly Prob: <b className="text-zinc-200">{Math.round(sensor.pollution_anomaly_score * 100)}%</b></p>
                    <p>Battery: <b className="text-zinc-200">{sensor.battery_voltage}V</b></p>
                    <p className="col-span-2 text-[9px] text-zinc-500 border-t border-zinc-900/60 pt-1.5 mt-1 text-right">
                      RSSI: {sensor.rssi} dBm &bull; {sensor.source.toUpperCase()}
                    </p>
                  </div>
                  <div className="text-[9px] text-zinc-500 mt-2 font-mono">Last seen: {new Date(sensor.last_seen).toLocaleString()}</div>
                  <button 
                    type="button"
                    onClick={() => {
                      onSelectSensor(sensor.sensor_id);
                    }}
                    className="w-full text-center mt-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-100 text-[10px] font-semibold rounded border border-zinc-800 transition-all cursor-pointer"
                  >
                    Inspect Buoy Analytics
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}


      </MapContainer>

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
