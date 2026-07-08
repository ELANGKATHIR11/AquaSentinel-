import "./App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import { LoadingState } from "./components/Bits";
import Login from "./pages/Login";
import Overview from "./pages/Overview";
import LiveMap from "./pages/LiveMap";
import Sensors from "./pages/Sensors";
import SensorDetail from "./pages/SensorDetail";
import Gateways from "./pages/Gateways";
import TelemetryExplorer from "./pages/TelemetryExplorer";
import Alerts from "./pages/Alerts";
import DeviceCommands from "./pages/DeviceCommands";
import MLOperations from "./pages/MLOperations";
import Simulation from "./pages/Simulation";
import AuditLogs from "./pages/AuditLogs";
import AdminUsers from "./pages/AdminUsers";

function Protected({ children }) {
  const { user } = useAuth();
  if (user === null) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><LoadingState label="Authenticating" /></div>;
  if (user === false) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/overview" replace /> : <Login />} />
      <Route path="/overview" element={<Protected><Overview /></Protected>} />
      <Route path="/live-map" element={<Protected><LiveMap /></Protected>} />
      <Route path="/sensors" element={<Protected><Sensors /></Protected>} />
      <Route path="/sensor/:sensorId" element={<Protected><SensorDetail /></Protected>} />
      <Route path="/gateways" element={<Protected><Gateways /></Protected>} />
      <Route path="/telemetry-explorer" element={<Protected><TelemetryExplorer /></Protected>} />
      <Route path="/alerts" element={<Protected><Alerts /></Protected>} />
      <Route path="/device-commands" element={<Protected><DeviceCommands /></Protected>} />
      <Route path="/ml-operations" element={<Protected><MLOperations /></Protected>} />
      <Route path="/simulation" element={<Protected><Simulation /></Protected>} />
      <Route path="/audit-logs" element={<Protected><AuditLogs /></Protected>} />
      <Route path="/admin" element={<Protected><AdminUsers /></Protected>} />
      <Route path="*" element={<Navigate to="/overview" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
          <Toaster theme="dark" position="bottom-right" richColors />
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}
