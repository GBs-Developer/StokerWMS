import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/schema";

const INACTIVITY_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const INACTIVITY_CHECK_INTERVAL_MS = 60 * 1000;
const LAST_ACTIVITY_KEY = "stokar:lastActivity";

interface AuthContextType {
  user: User | null;
  sessionKey: string | null;
  status: "loading" | "authenticated" | "unauthenticated";
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "authenticated" | "unauthenticated">("loading");
  const queryClient = useQueryClient();
  const inactivityTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearSession = useCallback(() => {
    queryClient.clear();
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("wms:") || key?.startsWith("stokar:")) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    setUser(null);
    setSessionKey(null);
    setStatus("unauthenticated");
  }, [queryClient]);

  const updateActivity = useCallback(() => {
    localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } finally {
      if (inactivityTimerRef.current) {
        clearInterval(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      clearSession();
    }
  }, [clearSession]);

  const startInactivityMonitor = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearInterval(inactivityTimerRef.current);
    }

    updateActivity();

    inactivityTimerRef.current = setInterval(() => {
      const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
      if (lastActivity) {
        const elapsed = Date.now() - parseInt(lastActivity, 10);
        if (elapsed >= INACTIVITY_TIMEOUT_MS) {
          logout();
        }
      }
    }, INACTIVITY_CHECK_INTERVAL_MS);
  }, [updateActivity, logout]);

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setSessionKey(data.sessionKey);
        setStatus("authenticated");
      } else {
        clearSession();
      }
    } catch {
      clearSession();
    }
  }, [clearSession]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (status !== "authenticated") {
      if (inactivityTimerRef.current) {
        clearInterval(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      return;
    }

    startInactivityMonitor();

    const events = ["mousedown", "keydown", "touchstart", "scroll", "mousemove"];
    let throttleTimer: ReturnType<typeof setTimeout> | null = null;

    const handleActivity = () => {
      if (throttleTimer) return;
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
      }, 30000);
      updateActivity();
    };

    events.forEach(event => window.addEventListener(event, handleActivity, { passive: true }));

    return () => {
      events.forEach(event => window.removeEventListener(event, handleActivity));
      if (throttleTimer) clearTimeout(throttleTimer);
      if (inactivityTimerRef.current) {
        clearInterval(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
    };
  }, [status, startInactivityMonitor, updateActivity]);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      clearSession();
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        credentials: "include",
      });

      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setSessionKey(data.sessionKey);
        setStatus("authenticated");
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  return (
    <AuthContext.Provider value={{ user, sessionKey, status, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function useSessionQueryKey(baseKey: string | string[]): string[] {
  const { sessionKey } = useAuth();
  const keys = Array.isArray(baseKey) ? baseKey : [baseKey];
  return sessionKey ? [sessionKey, ...keys] : keys;
}
