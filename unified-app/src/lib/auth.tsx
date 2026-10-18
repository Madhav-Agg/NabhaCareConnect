/**
 * Session state.
 *
 * The app previously kept the signed-in user in React state only, so a page
 * refresh silently dropped the user back to the language screen. The token is
 * persisted and re-validated against GET /api/{role}/auth/me on boot, which also
 * means a token that the server has since revoked is discarded rather than used.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { api, apiPath, getToken, setToken, ApiError } from "./api";

export type Role = "patient" | "doctor";

export type SessionUser = {
  id: number;
  phone: string;
  role: Role;
  name: string | null;
  age: number | null;
  address: string | null;
  specialty: string | null;
  room: string | null;
};

type AuthContextValue = {
  user: SessionUser | null;
  /** True until the stored session has been checked against the server. */
  initialising: boolean;
  login: (role: Role, token: string, user: SessionUser) => void;
  logout: () => Promise<void>;
  setUser: (user: SessionUser) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<SessionUser | null>(null);
  const [initialising, setInitialising] = useState(true);

  // Re-validate any persisted token on first render.
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      const token = getToken();
      if (!token) {
        setInitialising(false);
        return;
      }

      // The role lives in the token; try both mounts so either path works.
      const roles: Role[] = ["patient", "doctor"];
      for (const role of roles) {
        try {
          const result = await api<{ user: SessionUser }>(apiPath(role, "/auth/me"), { token });
          if (cancelled) return;
          if (result?.user) {
            setUserState(result.user);
            break;
          }
        } catch (err) {
          if (err instanceof ApiError && err.status === 403) continue; // wrong panel, try the other
          if (err instanceof ApiError && (err.status === 401 || err.status === 0)) {
            setToken(null); // expired or revoked — drop it
            break;
          }
        }
      }

      if (!cancelled) setInitialising(false);
    }

    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback((role: Role, token: string, nextUser: SessionUser) => {
    setToken(token);
    setUserState({ ...nextUser, role });
  }, []);

  const logout = useCallback(async () => {
    const token = getToken();
    const role = user?.role;
    setToken(null);
    setUserState(null);
    if (!token) return;
    try {
      // Must use the account's own panel: the backend scopes /auth/* by the
      // mount path, so a doctor posting to /api/patient/auth/logout got a 403.
      await api(apiPath(role || "patient", "/auth/logout"), { method: "POST", token });
    } catch {
      /* the local session is already gone; a failed audit ping is not fatal */
    }
  }, [user?.role]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, initialising, login, logout, setUser: setUserState }),
    [user, initialising, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}