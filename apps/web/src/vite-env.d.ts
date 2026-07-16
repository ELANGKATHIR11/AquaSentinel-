/// <reference types="vite/client" />

/**
 * Typed environment variable declarations for AquaSentinel Dashboard.
 * All VITE_ prefixed env vars must be declared here before use.
 * Never use `(import.meta as any).env` — use `import.meta.env` directly.
 */
interface ImportMetaEnv {
  /** Base URL for FastAPI backend REST endpoints. Default: http://localhost:8000/api/v1 */
  readonly VITE_API_BASE_URL: string;
  /** Base URL for WebSocket server. Default: ws://localhost:8000/ws */
  readonly VITE_WS_URL: string;
  /**
   * When "true", the dashboard operates in mock/demo mode using local in-memory
   * data. When "false" (default), it connects to the live FastAPI backend.
   */
  readonly VITE_MOCK_MODE: string;
  /** Human-readable app version label (e.g. "1.0.0-beta"). */
  readonly VITE_APP_VERSION: string;
  /** Deployment environment label: "development" | "staging" | "production" */
  readonly VITE_ENV: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
