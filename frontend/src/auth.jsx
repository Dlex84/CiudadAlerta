import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null); // { user, role, permissions, redirectTo }
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setSession(await api.get('/me'));
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      session,
      loading,
      refresh,
      setSession,
      can: (module, action = 'read') => Boolean(session?.permissions?.[module]?.[action]),
      async login(email, password) {
        const s = await api.post('/auth/login', { email, password });
        setSession(s);
        return s;
      },
      async register(data) {
        const s = await api.post('/auth/register', data);
        setSession(s);
        return s;
      },
      async logout() {
        try {
          await api.post('/auth/logout');
        } finally {
          setSession(null);
        }
      },
    }),
    [session, loading, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
