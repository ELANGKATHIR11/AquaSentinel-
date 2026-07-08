import { createContext, useContext, useEffect, useState } from "react";
import { API } from "../lib/api";

const AuthContext = createContext(null);

export const ROLE_LEVELS = { viewer: 1, analyst: 2, field_engineer: 3, operations_manager: 4, organization_admin: 5, super_admin: 6 };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    API.get("/auth/me").then((r) => setUser(r.data)).catch(() => setUser(false));
  }, []);

  const login = async (email, password) => {
    const { data } = await API.post("/auth/login", { email, password });
    setUser(data);
    return data;
  };

  const logout = async () => {
    try { await API.post("/auth/logout"); } catch { /* ignore */ }
    setUser(false);
  };

  const hasRole = (minRole) => user && ROLE_LEVELS[user.role] >= ROLE_LEVELS[minRole];

  return <AuthContext.Provider value={{ user, login, logout, hasRole }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
