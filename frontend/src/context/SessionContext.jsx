import React, { createContext, useContext, useState, useEffect } from 'react';

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [session, setSession] = useState(() => {
    try {
      const stored = localStorage.getItem('rp_session');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const getUsers = () => {
    try {
      return JSON.parse(localStorage.getItem('rp_users') || '[]');
    } catch {
      return [];
    }
  };

  const saveUsers = (users) => {
    try {
      localStorage.setItem('rp_users', JSON.stringify(users));
    } catch (e) {
      console.warn('Could not save users', e);
    }
  };

  const login = (email, password) => {
    const cleanEmail = email.trim().toLowerCase();
    const users = getUsers();
    const user = users.find((u) => u.email === cleanEmail && u.password === password);
    if (!user) {
      throw new Error('Invalid email or password.');
    }
    const userSession = {
      name: user.name,
      email: user.email,
      guest: false
    };
    localStorage.setItem('rp_session', JSON.stringify(userSession));
    setSession(userSession);
    return userSession;
  };

  const signup = (name, email, password, confirmPassword) => {
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanName || !cleanEmail || !password) {
      throw new Error('All fields are required.');
    }
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }
    if (password !== confirmPassword) {
      throw new Error('Passwords do not match.');
    }

    const users = getUsers();
    if (users.some((u) => u.email === cleanEmail)) {
      throw new Error('An account with this email already exists.');
    }

    users.push({
      name: cleanName,
      email: cleanEmail,
      password
    });
    saveUsers(users);
  };

  const loginAsGuest = () => {
    const guestSession = {
      name: 'Guest',
      email: 'Browsing without an account',
      guest: true
    };
    localStorage.setItem('rp_session', JSON.stringify(guestSession));
    setSession(guestSession);
    return guestSession;
  };

  const logout = () => {
    localStorage.removeItem('rp_session');
    setSession(null);
  };

  return (
    <SessionContext.Provider
      value={{
        session,
        login,
        signup,
        loginAsGuest,
        logout
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}
