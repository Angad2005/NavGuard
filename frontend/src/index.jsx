import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { HazardProvider } from './context/HazardContext';
import { AuthPage } from './components/AuthPage';
import { App } from './App';
import './styles/index.css';

function AppEntry() {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center">Restoring your secure session...</div>;
  }
  if (!user) return <AuthPage />;
  return (
    <HazardProvider>
      <App />
    </HazardProvider>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <AuthProvider>
        <ThemeProvider>
          <AppEntry />
        </ThemeProvider>
      </AuthProvider>
    </React.StrictMode>
  );
}
