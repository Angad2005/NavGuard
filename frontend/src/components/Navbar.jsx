import React from 'react';
import { useSession } from '../context/SessionContext';
import { useTheme } from '../context/ThemeContext';
import { useHazards } from '../context/HazardContext';
import {
  Navigation,
  AlertTriangle,
  Sun,
  Moon,
  Sliders,
  LogOut,
  User,
  Shield
} from 'lucide-react';

export function Navbar({ activeView, setActiveView, onOpenAccessibility }) {
  const { session, logout } = useSession();
  const { theme, toggleTheme } = useTheme();
  const { stats } = useHazards();

  const handleNavClick = (view) => {
    setActiveView(view);
    // Update hash/URL smoothly for navigation compatibility
    if (view === 'map') {
      window.history.replaceState(null, '', 'main.html');
    } else if (view === 'hazards') {
      window.history.replaceState(null, '', 'Hazard.html');
    } else if (view === 'login') {
      window.history.replaceState(null, '', 'login.html');
    }
  };

  return (
    <header className="app-header">
      {/* Brand */}
      <div className="brand-section" onClick={() => handleNavClick('map')}>
        <div className="brand-icon-wrap">
          <Shield size={22} />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span className="brand-title">NaviGuard</span>
            <span className="brand-badge">PRO</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav className="nav-tabs-group" aria-label="Main Navigation">
        <button
          type="button"
          className={`nav-tab-btn ${activeView === 'map' ? 'active' : ''}`}
          onClick={() => handleNavClick('map')}
        >
          <Navigation size={16} />
          <span>Map & Detours</span>
        </button>

        <button
          type="button"
          className={`nav-tab-btn ${activeView === 'hazards' ? 'active' : ''}`}
          onClick={() => handleNavClick('hazards')}
        >
          <AlertTriangle size={16} />
          <span>Hazard Dashboard</span>
          {stats.active > 0 && (
            <span className="nav-tab-badge">{stats.active}</span>
          )}
        </button>
      </nav>

      {/* Header Controls */}
      <div className="header-actions">
        {/* Quick Theme Toggle */}
        <button
          type="button"
          className="icon-btn"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle color theme"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {/* Accessibility & Display Settings */}
        <button
          type="button"
          className="icon-btn"
          onClick={onOpenAccessibility}
          title="Display and accessibility settings"
          aria-label="Display and accessibility settings"
        >
          <Sliders size={18} />
        </button>

        {/* User Account / Session */}
        {session ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <div className="user-badge" title={session.email}>
              <div className="user-avatar">
                {session.name ? session.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <span style={{ fontWeight: 600, maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {session.name || 'User'}
              </span>
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={() => {
                logout();
                setActiveView('login');
                window.history.replaceState(null, '', 'login.html');
              }}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem' }}
            onClick={() => handleNavClick('login')}
          >
            <User size={15} /> Sign In
          </button>
        )}
      </div>
    </header>
  );
}
