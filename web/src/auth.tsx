import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, getToken, setToken, UNAUTHORIZED_EVENT } from './api';
import type { User } from './types';

type LoginResult = { token: string; user: User };

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  login: (username: string, password: string) => Promise<User>;
  register: (username: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const data = await api.get<{ user: User }>('/auth/me');
        if (alive) setUser(data.user);
      } catch {
        if (alive) setUser(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isAdmin: user?.role === 'admin',
      async login(username, password) {
        const data = await api.post<LoginResult>('/auth/login', { username, password });
        setToken(data.token);
        setUser(data.user);
        return data.user;
      },
      async register(username, password) {
        const data = await api.post<LoginResult>('/auth/register', { username, password });
        setToken(data.token);
        setUser(data.user);
        return data.user;
      },
      async logout() {
        try {
          await api.post('/auth/logout');
        } catch {
          /* 忽略网络错误，本地一定要清掉 */
        }
        setToken(null);
        setUser(null);
      },
      async refresh() {
        if (!getToken()) return;
        try {
          const data = await api.get<{ user: User }>('/auth/me');
          setUser(data.user);
        } catch {
          setUser(null);
        }
      },
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return ctx;
}
