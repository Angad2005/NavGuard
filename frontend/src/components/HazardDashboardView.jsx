import React, { useState } from 'react';
import { useHazards } from '../context/HazardContext';
import { getHazardStatus } from '../utils/geo';
import { HazardModal } from './HazardModal';
import {
  AlertTriangle,
  Clock,
  Archive,
  Plus,
  Trash2,
  MapPin,
  Tag,
  CloudLightning,
  Search,
  Loader2,
  Info,
  Calendar,
  CloudRain
} from 'lucide-react';

const WEATHER_CODES = {
  0: ['Clear sky', 'ok'],
  1: ['Mostly clear', 'ok'],
  2: ['Partly cloudy', 'ok'],
  3: ['Overcast', 'ok'],
  45: ['Fog', 'warn'],
  48: ['Dense fog', 'danger'],
  51: ['Light drizzle', 'warn'],
  61: ['Rain', 'warn'],
  63: ['Moderate rain', 'warn'],
  65: ['Heavy rain', 'danger'],
  71: ['Snow', 'danger'],
  80: ['Rain showers', 'warn'],
  95: ['Thunderstorm', 'danger'],
  99: ['Severe thunderstorm', 'danger']
};

function describeWeather(code) {
  const [label, level] = WEATHER_CODES[code] || ['Unknown conditions', 'ok'];
  return { label, level };
}

export function HazardDashboardView({ onToast }) {
  const {
    hazards,
    stats,
    activeTab,
    setActiveTab,
    createHazard,
    deleteHazard,
    fetchHazards
  } = useHazards();

  const [modalOpen, setModalOpen] = useState(false);

  // Weather Advisory State
  const [cityInput, setCityInput] = useState('');
  const [searchingWeather, setSearchingWeather] = useState(false);
  const [weatherData, setWeatherData] = useState(null);
  const [weatherError, setWeatherError] = useState('');

  const handleSearchWeather = async (e) => {
    e.preventDefault();
    const city = cityInput.trim();
    if (!city) return;

    setSearchingWeather(true);
    setWeatherError('');
    setWeatherData(null);

    try {
      const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
          city
        )}&count=1`
      );
      if (!geoRes.ok) throw new Error('Geocoding service unavailable');
      const geoData = await geoRes.json();
      const place = geoData.results?.[0];
      if (!place) throw new Error(`Could not find city "${city}".`);

      const forecastRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current_weather=true`
      );
      if (!forecastRes.ok) throw new Error('Weather forecast unavailable.');
      const forecastData = await forecastRes.json();

      setWeatherData({
        place: {
          name: place.name,
          country: place.country,
          lat: place.latitude,
          lon: place.longitude
        },
        current: forecastData.current_weather
      });
    } catch (err) {
      setWeatherError(err.message || 'Error fetching weather data.');
    } finally {
      setSearchingWeather(false);
    }
  };

  const handleAddWeatherHazard = async () => {
    if (!weatherData) return;
    const { place, current } = weatherData;
    const info = describeWeather(current.weathercode);

    try {
      await createHazard({
        title: `${info.label} affecting routes near ${place.name}`,
        category: 'Weather',
        severity: info.level === 'danger' ? 'High' : 'Medium',
        location: `${place.name}, ${place.country || ''}`,
        description: `Generated from live weather conditions (${Math.round(
          current.temperature
        )}°C, wind ${Math.round(current.windspeed)} km/h).`,
        coordinates: { lat: place.lat, lng: place.lon },
        window: { scheduled: false }
      });
      if (onToast) onToast('Weather hazard added successfully', 'success');
      setWeatherData(null);
      setCityInput('');
    } catch (err) {
      if (onToast) onToast(err.message, 'error');
    }
  };

  // Filter hazards by activeTab and sort by severity
  const severityRank = { High: 0, Medium: 1, Low: 2 };
  const filteredHazards = hazards
    .filter((h) => getHazardStatus(h) === activeTab)
    .sort((a, b) => (severityRank[a.severity] ?? 3) - (severityRank[b.severity] ?? 3));

  const formatTimeLabel = (hazard, status) => {
    const { start, end } = hazard.window || {};
    if (status === 'scheduled' && start)
      return `Starts: ${new Date(start).toLocaleString()}`;
    if (status === 'active' && end)
      return `Until: ${new Date(end).toLocaleString()}`;
    if (status === 'expired' && end)
      return `Ended: ${new Date(end).toLocaleString()}`;
    return 'No time window';
  };

  return (
    <div className="dashboard-screen">
      {/* Top Banner Header */}
      <div className="dashboard-header">
        <div className="dashboard-headline">
          <h1>Route Hazards Management</h1>
          <p>Monitor, schedule, and remove live road obstructions and hazards.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setModalOpen(true)}
        >
          <Plus size={18} /> Report Hazard
        </button>
      </div>

      {/* Metric Stat Cards */}
      <div className="stat-cards-grid">
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-label">
              <span className="pulse-dot" /> Active Hazards
            </span>
          </div>
          <div className="stat-count">{stats.active}</div>
          <div className="stat-subtext">Currently impacting navigation routes</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-label">
              <Clock size={16} /> Scheduled
            </span>
          </div>
          <div className="stat-count">{stats.scheduled}</div>
          <div className="stat-subtext">Upcoming time-window hazards</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-label">
              <Archive size={16} /> Expired
            </span>
          </div>
          <div className="stat-count">{stats.expired}</div>
          <div className="stat-subtext">Resolved / window has passed</div>
        </div>
      </div>

      {/* Main Grid: Hazard List & Weather Advisory */}
      <div className="dashboard-main-grid">
        {/* Hazards List Panel */}
        <div className="panel-card">
          {/* Status Tabs */}
          <div className="hazard-status-tabs">
            <button
              type="button"
              className={`status-tab-btn ${activeTab === 'active' ? 'active' : ''}`}
              onClick={() => setActiveTab('active')}
            >
              <AlertTriangle size={15} /> Currently Active ({stats.active})
            </button>
            <button
              type="button"
              className={`status-tab-btn ${activeTab === 'scheduled' ? 'active' : ''}`}
              onClick={() => setActiveTab('scheduled')}
            >
              <Clock size={15} /> Scheduled ({stats.scheduled})
            </button>
            <button
              type="button"
              className={`status-tab-btn ${activeTab === 'expired' ? 'active' : ''}`}
              onClick={() => setActiveTab('expired')}
            >
              <Archive size={15} /> Expired ({stats.expired})
            </button>
          </div>

          {/* List Content */}
          <div className="hazards-list">
            {filteredHazards.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '3rem 1rem',
                  color: 'var(--text-secondary)'
                }}
              >
                <AlertTriangle
                  size={36}
                  style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }}
                />
                <p style={{ fontWeight: 600 }}>
                  {activeTab === 'active'
                    ? 'No active hazards. Roads look clear right now.'
                    : activeTab === 'scheduled'
                    ? 'No upcoming scheduled hazards.'
                    : 'No expired hazards in history.'}
                </p>
              </div>
            ) : (
              filteredHazards.map((hazard) => {
                const severityClass =
                  hazard.severity === 'High'
                    ? 'tag-severity-high'
                    : hazard.severity === 'Medium'
                    ? 'tag-severity-medium'
                    : 'tag-severity-low';

                return (
                  <div key={hazard.id} className="hazard-item-card">
                    <div className="hazard-item-info">
                      <div className="hazard-item-title">{hazard.title}</div>
                      <div className="hazard-item-tags">
                        <span className="tag-chip">
                          <MapPin size={12} />{' '}
                          {hazard.location || 'Unknown location'}
                        </span>
                        <span className="tag-chip">
                          <Tag size={12} /> {hazard.category}
                        </span>
                        <span className={`tag-chip ${severityClass}`}>
                          {hazard.severity} Severity
                        </span>
                        <span className="tag-chip">
                          <Calendar size={12} />{' '}
                          {formatTimeLabel(hazard, activeTab)}
                        </span>
                      </div>
                      {hazard.description && (
                        <div className="hazard-item-desc">
                          {hazard.description}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      className="icon-btn"
                      onClick={async () => {
                        if (
                          window.confirm(
                            `Are you sure you want to remove "${hazard.title}"?`
                          )
                        ) {
                          try {
                            await deleteHazard(hazard.id);
                            if (onToast) onToast('Hazard removed', 'info');
                          } catch (err) {
                            if (onToast) onToast(err.message, 'error');
                          }
                        }
                      }}
                      title="Remove hazard"
                      aria-label="Remove hazard"
                      style={{ color: 'var(--danger)' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Weather Advisory Panel */}
        <div className="panel-card">
          <div className="weather-panel-title">
            <CloudLightning size={20} style={{ color: 'var(--primary)' }} />
            <span>Weather Advisory</span>
          </div>
          <p className="weather-panel-sub">
            Query live meteorological conditions via Open-Meteo to flag route
            hazards.
          </p>

          <form onSubmit={handleSearchWeather} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              className="form-input"
              placeholder="City, e.g. London, Rajpura"
              value={cityInput}
              onChange={(e) => setCityInput(e.target.value)}
              required
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={searchingWeather}
              title="Check weather"
            >
              {searchingWeather ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <Search size={16} />
              )}
            </button>
          </form>

          {weatherError && (
            <div
              style={{
                marginTop: '1rem',
                padding: '0.75rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--danger-light)',
                color: 'var(--danger)',
                fontSize: '0.85rem'
              }}
            >
              {weatherError}
            </div>
          )}

          {weatherData && (
            <div className="weather-result-box">
              <div className="weather-temp">
                {Math.round(weatherData.current.temperature)}°C
              </div>
              <div className="weather-condition-desc">
                <b>{describeWeather(weatherData.current.weathercode).label}</b> in{' '}
                {weatherData.place.name}, {weatherData.place.country || ''} · wind{' '}
                {Math.round(weatherData.current.windspeed)} km/h
              </div>

              {(() => {
                const info = describeWeather(weatherData.current.weathercode);
                const adviceClass =
                  info.level === 'ok'
                    ? 'weather-advice-ok'
                    : info.level === 'warn'
                    ? 'weather-advice-warn'
                    : 'weather-advice-danger';

                return (
                  <>
                    <div className={`weather-advice-badge ${adviceClass}`}>
                      <Info size={16} />
                      <span>
                        {info.level === 'ok'
                          ? 'No adverse road hazard expected for these conditions.'
                          : info.level === 'danger'
                          ? 'Severe weather conditions — flagging a hazard is strongly recommended.'
                          : 'Slick roads or reduced visibility — consider marking a hazard.'}
                      </span>
                    </div>

                    {info.level !== 'ok' && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleAddWeatherHazard}
                        style={{ width: '100%', marginTop: '0.25rem' }}
                      >
                        <Plus size={16} /> Add as Route Hazard
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Hazard Creation Modal */}
      <HazardModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => fetchHazards()}
        onToast={onToast}
      />
    </div>
  );
}
