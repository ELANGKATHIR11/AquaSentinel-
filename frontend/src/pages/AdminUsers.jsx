import { useState, useEffect, useCallback } from "react";
import { API, fmtErr } from "../lib/api";
import { LoadingState, ErrorState, DeniedState } from "../components/Bits";
import { useAuth, ROLE_LEVELS } from "../context/AuthContext";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";

const ROLES = Object.keys(ROLE_LEVELS);

export default function AdminUsers() {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", password: "", role: "viewer" });
  const [busy, setBusy] = useState(false);
  const { hasRole, user: me } = useAuth();

  const load = useCallback(() => {
    setError("");
    API.get("/users").then((r) => setUsers(r.data)).catch((e) => {
      if (e?.response?.status === 403) setDenied(true);
      else setError(fmtErr(e));
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const createUser = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await API.post("/users", form);
      setUsers((prev) => [...prev, data]);
      setForm({ email: "", name: "", password: "", role: "viewer" });
      toast.success(`User ${data.email} created as ${data.role}`);
    } catch (err) { toast.error(fmtErr(err)); } finally { setBusy(false); }
  };

  const changeRole = async (id, role) => {
    try {
      const { data } = await API.patch(`/users/${id}/role`, { role });
      setUsers((prev) => prev.map((u) => (u.id === id ? data : u)));
      toast.success(`Role updated to ${role}`);
    } catch (err) { toast.error(fmtErr(err)); load(); }
  };

  if (!hasRole("organization_admin") || denied) return <DeniedState />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!users) return <LoadingState label="Loading users" />;

  return (
    <div data-testid="admin-page" className="space-y-4">
      <form onSubmit={createUser} className="panel p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="widget-title block mb-1.5">Name</label>
          <input data-testid="admin-name-input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
        </div>
        <div>
          <label className="widget-title block mb-1.5">Email</label>
          <input data-testid="admin-email-input" required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500" />
        </div>
        <div>
          <label className="widget-title block mb-1.5">Password (8+)</label>
          <input data-testid="admin-password-input" required type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500" />
        </div>
        <div>
          <label className="widget-title block mb-1.5">Role</label>
          <select data-testid="admin-role-select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
            className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500">
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <button data-testid="admin-create-user-btn" disabled={busy} className="inline-flex items-center gap-2 px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm text-white transition-colors">
          <UserPlus className="w-4 h-4" /> Create User
        </button>
      </form>

      <div className="panel overflow-x-auto">
        <table data-testid="users-table" className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-slate-800">
              {["Name", "Email", "Role", "Created"].map((h) => <th key={h} className="widget-title px-3 py-2.5">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} data-testid={`user-row-${u.email}`} className="border-b border-slate-800/50">
                <td className="px-3 py-2 text-slate-200">{u.name}{u.id === me.id && <span className="text-blue-400 text-xs ml-1.5">(you)</span>}</td>
                <td className="px-3 py-2 font-mono text-slate-400">{u.email}</td>
                <td className="px-3 py-2">
                  <select data-testid={`user-role-select-${u.email}`} value={u.role} onChange={(e) => changeRole(u.id, e.target.value)} disabled={u.id === me.id}
                    className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-blue-500 disabled:opacity-50">
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-slate-500">{u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
