/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Typed, safe environment configuration for the AquaSentinel dashboard.
 * This module is the single source of truth for env vars — do not use
 * import.meta.env directly outside this file.
 */
export const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  wsUrl: import.meta.env.VITE_WS_URL || `ws://${window.location.host}/ws`,
  /** When true, all data comes from local in-memory mock; no backend calls. */
  mockMode: import.meta.env.VITE_MOCK_MODE === 'true',
  appVersion: import.meta.env.VITE_APP_VERSION || '1.0.0',
  appEnv: import.meta.env.VITE_ENV || 'development',
} as const;

export type AppConfig = typeof config;
