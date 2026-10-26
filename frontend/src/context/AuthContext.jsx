import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../utils/api';

const AuthContext = createContext(null);
const SESSION_KEY = 'naviguard_session';

function readSession() {
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (value && typeof value.token === 'string' && value.user?.id) return value;
  } catch (error) {
    console.warn('Could not read the saved NaviGuard session:', error);
  }
  return null;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(readSession);
  const [loading, setLoading] = useState(Boolean(session?.token));

  const clearSession = useCallback(() => {
    setSession(null);
    setLoading(false);
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch (error) {
      console.warn('Could not clear the saved NaviGuard session:', error);
    }
  }, []);

  const saveSession = useCallback((value) => {
    setSession(value);
    setLoading(false);
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(value));
    } catch (error) {
      console.warn('Could not save the NaviGuard session locally:', error);
    }
  }, []);

  useEffect(() => {
    if (!session?.token) return undefined;
    let isCurrent = true;
    apiFetch('/api/auth/me')
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Your session is no longer valid.');
        if (isCurrent) saveSession({ ...session, user: payload.data.user });
      })
      .catch(() => {
        if (isCurrent) clearSession();
      });
    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    const onUnauthorized = () => clearSession();
    window.addEventListener('naviguard:unauthorized', onUnauthorized);
    return () => window.removeEventListener('naviguard:unauthorized', onUnauthorized);
  }, [clearSession]);

  const authenticate = useCallback(async (mode, credentials) => {
    const endpoint = mode === 'signup' ? '/api/auth/register' : '/api/auth/login';
    const response = await apiFetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Could not authenticate.');
    saveSession(payload.data);
    return payload.data.user;
  }, [saveSession]);

  const value = useMemo(() => ({
    user: session?.user || null,
    token: session?.token || null,
    loading,
    login: (credentials) => authenticate('login', credentials),
    signup: (credentials) => authenticate('signup', credentials),
    logout: clearSession
  }), [session, loading, authenticate, clearSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
