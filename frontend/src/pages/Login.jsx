import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { fmtErr } from "../lib/api";
import { Waves, Loader2 } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email, password);
      navigate("/overview");
    } catch (err) {
      setError(fmtErr(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-950">
      <div className="hidden lg:flex flex-1 relative items-end p-12" style={{ backgroundImage: "linear-gradient(rgba(2,6,23,0.55), rgba(2,6,23,0.85)), url(https://images.unsplash.com/photo-1572293071277-ef1b3e761045?crop=entropy&cs=srgb&fm=jpg&q=85)", backgroundSize: "cover", backgroundPosition: "center" }}>
        <div className="max-w-md rise">
          <div className="widget-title mb-2">River Intelligence Platform</div>
          <h2 className="font-heading font-black tracking-tight text-4xl leading-tight">Real-time flood risk estimation & water quality operations.</h2>
          <p className="text-slate-400 mt-3 text-sm">IoT telemetry ingestion · GIS monitoring · ML decision support · alert operations</p>
        </div>
      </div>
      <div className="w-full lg:w-[460px] flex items-center justify-center p-8 border-l border-slate-800">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5 rise">
          <div className="flex items-center gap-2">
            <Waves className="w-8 h-8 text-blue-500" />
            <span className="font-heading font-black tracking-tight text-2xl">AQUA<span className="text-blue-500">SENTINEL</span></span>
          </div>
          <p className="text-sm text-slate-400">Sign in to the operations command center.</p>
          <div>
            <label className="widget-title block mb-1.5">Email</label>
            <input data-testid="login-email-input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-blue-500 transition-colors" placeholder="operator@aquasentinel.io" />
          </div>
          <div>
            <label className="widget-title block mb-1.5">Password</label>
            <input data-testid="login-password-input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-blue-500 transition-colors" placeholder="••••••••" />
          </div>
          {error && <div data-testid="login-error" className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">{error}</div>}
          <button data-testid="login-submit-btn" disabled={busy} className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Sign In
          </button>
          <div className="panel p-3 text-[11px] font-mono text-slate-500 space-y-1">
            <div className="widget-title mb-1">Demo Access</div>
            <div>admin@aquasentinel.io / Admin@1234 (super_admin)</div>
            <div>ops@aquasentinel.io / Ops@12345 (operations_manager)</div>
            <div>viewer@aquasentinel.io / Viewer@123 (viewer)</div>
          </div>
        </form>
      </div>
    </div>
  );
}
