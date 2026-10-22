import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from './context/SessionContext';
import { Navbar } from './components/Navbar';
import { MapView } from './components/MapView';
import { HazardDashboardView } from './components/HazardDashboardView';
import { LoginView } from './components/LoginView';
import { AccessibilityModal } from './components/AccessibilityModal';
import { Toast } from './components/Toast';

export function App() {
  const { session } = useSession();

  // Determine initial view from pathname or hash
  const getInitialView = () => {
    const path = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase();

    if (path.includes('hazard') || hash.includes('hazard')) {
      return 'hazards';
    }
    if (path.includes('main') || hash.includes('main') || hash.includes('map')) {
      return 'map';
    }
    if (path.includes('login') || hash.includes('login')) {
      // If already logged in, redirect to map
      return session ? 'map' : 'login';
    }
    // Root '/': If session exists -> 'map', else -> 'login'
    return session ? 'map' : 'login';
  };

  const [activeView, setActiveView] = useState(getInitialView);
  const [accessibilityOpen, setAccessibilityOpen] = useState(false);
  const [toasts, setToasts] = useState([]);

  // Toast Helper
  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random().toString(36).substring(2, 6);
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  const dismissToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Sync with browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      setActiveView(getInitialView());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [session]);

  return (
    <>
      <Navbar
        activeView={activeView}
        setActiveView={setActiveView}
        onOpenAccessibility={() => setAccessibilityOpen(true)}
      />

      <main className="app-content">
        {activeView === 'login' ? (
          <LoginView
            onComplete={() => {
              setActiveView('map');
              window.history.replaceState(null, '', 'main.html');
            }}
            onToast={addToast}
          />
        ) : activeView === 'hazards' ? (
          <HazardDashboardView onToast={addToast} />
        ) : (
          <MapView onToast={addToast} />
        )}
      </main>

      <AccessibilityModal
        isOpen={accessibilityOpen}
        onClose={() => setAccessibilityOpen(false)}
      />

      <Toast toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
