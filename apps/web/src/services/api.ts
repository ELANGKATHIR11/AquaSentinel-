/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Telemetry, Sensor, Alert, CalibrationProfile } from '../types';
import { TelemetrySchema } from '../schemas';
import { useDashboardStore } from '../stores/useDashboardStore';
import { config } from '../config';

export const API_BASE_URL = config.apiBaseUrl;
export const WS_BASE_URL = config.wsUrl;

class ApiService {
  private ws: WebSocket | null = null;
  private reconnectTimeout: number | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private seenMessages = new Set<string>(); // Deduplication: sensor_id + timestamp

  // REST API Client
  async getSensors(): Promise<Sensor[]> {
    const store = useDashboardStore.getState();
    if (store.mockMode) {
      return store.sensors;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/sensors`);
      if (!res.ok) throw new Error('API server error');
      return await res.json();
    } catch (err) {
      console.warn('API /sensors failed, falling back to local store state:', err);
      store.setConnectionStatus('degraded');
      return store.sensors;
    }
  }

  async getSensor(sensorId: string): Promise<Sensor | null> {
    const store = useDashboardStore.getState();
    if (store.mockMode) {
      return store.sensors.find((s) => s.sensor_id === sensorId) || null;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/sensors/${sensorId}`);
      if (!res.ok) throw new Error('API server error');
      return await res.json();
    } catch (err) {
      console.warn(`API /sensors/${sensorId} failed, falling back:`, err);
      return store.sensors.find((s) => s.sensor_id === sensorId) || null;
    }
  }

  async getTelemetry(sensorId: string, from?: string, to?: string): Promise<Telemetry[]> {
    const store = useDashboardStore.getState();
    if (store.mockMode) {
      const history = store.telemetryHistory[sensorId] || [];
      if (from || to) {
        const fromTime = from ? new Date(from).getTime() : 0;
        const toTime = to ? new Date(to).getTime() : Infinity;
        return history.filter(t => {
          const time = new Date(t.timestamp).getTime();
          return time >= fromTime && time <= toTime;
        });
      }
      return history;
    }
    try {
      const query = new URLSearchParams();
      if (from) query.append('from', from);
      if (to) query.append('to', to);
      const res = await fetch(`${API_BASE_URL}/sensors/${sensorId}/telemetry?${query.toString()}`);
      if (!res.ok) throw new Error('API server error');
      return await res.json();
    } catch (err) {
      console.warn(`API telemetry fetch for ${sensorId} failed:`, err);
      return store.telemetryHistory[sensorId] || [];
    }
  }

  async getAlerts(): Promise<Alert[]> {
    const store = useDashboardStore.getState();
    if (store.mockMode) {
      return store.alerts;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/alerts`);
      if (!res.ok) throw new Error('API server error');
      return await res.json();
    } catch (err) {
      console.warn('API /alerts failed, falling back:', err);
      return store.alerts;
    }
  }

  async postManualTelemetry(telemetry: Telemetry): Promise<{ status: string; data: Telemetry }> {
    const store = useDashboardStore.getState();
    if (store.mockMode) {
      // Simulate slow API response
      await new Promise(r => setTimeout(r, 600));
      store.addManualTelemetry(telemetry);
      return { status: 'success', data: telemetry };
    }
    try {
      const res = await fetch(`${API_BASE_URL}/telemetry/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(telemetry),
      });
      if (!res.ok) throw new Error('API post failed');
      const data = await res.json();
      store.addManualTelemetry(data);
      return { status: 'success', data };
    } catch (err) {
      console.error('API submit telemetry failed, saving locally:', err);
      store.addManualTelemetry(telemetry);
      return { status: 'offline-success', data: telemetry };
    }
  }

  async postCalibration(sensorId: string, profile: CalibrationProfile): Promise<{ status: string; profile: CalibrationProfile }> {
    const store = useDashboardStore.getState();
    if (store.mockMode) {
      await new Promise(r => setTimeout(r, 500));
      store.updateCalibrationProfile(profile);
      store.addCalibrationHistory({
        id: `cal_${Date.now()}`,
        sensor_id: sensorId,
        timestamp: new Date().toISOString(),
        ph_offset: profile.ph_offset,
        turbidity_zero_offset: profile.turbidity_zero_offset,
        water_level_offset_cm: profile.water_level_offset_cm,
        operator: profile.operator,
        status: 'Completed (Mock)',
      });
      return { status: 'calibrated', profile };
    }
    try {
      const res = await fetch(`${API_BASE_URL}/calibration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...profile, sensor_id: sensorId }),
      });
      if (!res.ok) throw new Error('Calibration submit failed');
      const returned = await res.json();
      store.updateCalibrationProfile(returned.profile);
      store.addCalibrationHistory({
        id: `cal_${Date.now()}`,
        sensor_id: sensorId,
        timestamp: new Date().toISOString(),
        ph_offset: returned.profile.ph_offset,
        turbidity_zero_offset: returned.profile.turbidity_zero_offset,
        water_level_offset_cm: returned.profile.water_level_offset_cm,
        operator: returned.profile.operator,
        status: 'Success (API)',
      });
      return returned;
    } catch (err) {
      console.error('API calibration failed, saving local profile:', err);
      store.updateCalibrationProfile(profile);
      store.addCalibrationHistory({
        id: `cal_off_${Date.now()}`,
        sensor_id: sensorId,
        timestamp: new Date().toISOString(),
        ph_offset: profile.ph_offset,
        turbidity_zero_offset: profile.turbidity_zero_offset,
        water_level_offset_cm: profile.water_level_offset_cm,
        operator: profile.operator,
        status: 'Saved Offline',
      });
      return { status: 'offline-calibrated', profile };
    }
  }

  async postSimulationEvent(scenarioId: string, event: any): Promise<boolean> {
    const store = useDashboardStore.getState();
    if (store.mockMode) {
      store.startScenario(scenarioId);
      return true;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/simulation/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario_id: scenarioId, ...event }),
      });
      if (!res.ok) throw new Error('Failed to post simulation');
      store.startScenario(scenarioId);
      return true;
    } catch (err) {
      console.warn('API simulation trigger failed, running simulation locally:', err);
      store.startScenario(scenarioId);
      return true;
    }
  }

  // WebSockets Connection Manager
  connectWebSocket() {
    const store = useDashboardStore.getState();
    if (store.mockMode) {
      store.setConnectionStatus('connected');
      return;
    }

    if (this.ws) {
      this.ws.close();
    }

    store.setConnectionStatus('reconnecting');
    console.log(`Connecting to WebSocket: ${WS_BASE_URL}`);

    try {
      this.ws = new WebSocket(WS_BASE_URL);

      this.ws.onopen = () => {
        console.log('WebSocket successfully connected');
        store.setConnectionStatus('connected');
        this.reconnectDelay = 1000; // Reset reconnect timer on successful link
      };

      this.ws.onmessage = (event) => {
        try {
          const rawData = JSON.parse(event.data);
          
          // Route telemetry messages
          if (rawData.type === 'telemetry' || rawData.sensor_id) {
            // Validate incoming payload with Zod schema
            const validated = TelemetrySchema.safeParse(rawData);
            if (validated.success) {
              const tel = validated.data;
              const msgKey = `${tel.sensor_id}_${tel.timestamp}`;
              
              // Deduplicate packet frames
              if (!this.seenMessages.has(msgKey)) {
                this.seenMessages.add(msgKey);
                // Keep seen messages cache bounded
                if (this.seenMessages.size > 1000) {
                  const firstKey = this.seenMessages.values().next().value;
                  if (firstKey) this.seenMessages.delete(firstKey);
                }
                store.addTelemetry(tel);
              }
            } else {
              console.error('WebSocket telemetry packet validation failed:', validated.error.format());
            }
          } 
          // Route Alert events
          else if (rawData.type === 'alert') {
            store.addAlert({
              sensor_id: rawData.sensor_id,
              timestamp: rawData.timestamp || new Date().toISOString(),
              severity: rawData.severity || 'high',
              type: rawData.alert_type || 'flood',
              summary: rawData.summary || 'Unspecified anomaly event',
              status: 'active',
              source: 'iot',
            });
          }
          // Route Device Health state events
          else if (rawData.type === 'device-health') {
            // Update sensor connection metrics
            // (handled implicitly through our general telemetry updates)
          }
        } catch (e) {
          console.error('Error parsing WebSocket message content:', e);
        }
      };

      this.ws.onclose = (e) => {
        console.warn(`WebSocket disconnected (Code: ${e.code}). Reconnecting...`);
        store.setConnectionStatus('reconnecting');
        this.triggerReconnect();
      };

      this.ws.onerror = (err) => {
        console.error('WebSocket connection error encountered:', err);
        store.setConnectionStatus('offline');
      };
    } catch (error) {
      console.error('Failed to instantiate WebSocket connection:', error);
      store.setConnectionStatus('offline');
      this.triggerReconnect();
    }
  }

  private triggerReconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    this.reconnectTimeout = window.setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      this.connectWebSocket();
    }, this.reconnectDelay);
  }

  disconnectWebSocket() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }
}

export const api = new ApiService();
