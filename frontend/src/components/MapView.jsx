import React, { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useHazards } from '../context/HazardContext';
import {
  geocodeAddress,
  formatDuration,
  formatDistance,
  routeTouchesHazard,
  routeSignature,
  getHazardColor,
  getDeviceLocation
} from '../utils/geo';
import { HazardModal } from './HazardModal';
import {
  Navigation,
  Crosshair,
  MapPin,
  Trash2,
  AlertTriangle,
  CheckCircle,
  Route as RouteIcon,
  Plus,
  Loader2,
  ChevronRight,
  ShieldCheck,
  Compass
} from 'lucide-react';

// Fix Leaflet default icon issues in bundled environments
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
});

export function MapView({ onToast }) {
  const { hazards, activeHazardsList, deleteHazard, fetchHazards } = useHazards();

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const routeLayersRef = useRef([]);
  const hazardLayersRef = useRef([]);
  const startMarkerRef = useRef(null);
  const endMarkerRef = useRef(null);

  const [startQuery, setStartQuery] = useState('');
  const [endQuery, setEndQuery] = useState('');
  const [startCoords, setStartCoords] = useState(null);
  const [endCoords, setEndCoords] = useState(null);

  const [locatingGps, setLocatingGps] = useState(false);
  const [routing, setRouting] = useState(false);
  const [routeCandidates, setRouteCandidates] = useState([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [routingError, setRoutingError] = useState('');

  // Hazard Modal State
  const [hazardModalOpen, setHazardModalOpen] = useState(false);
  const [hazardModalPoint, setHazardModalPoint] = useState(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false
    }).setView([28.6139, 77.209], 12);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    map.on('click', (e) => {
      setHazardModalPoint(e.latlng);
      setHazardModalOpen(true);
    });

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Hazard Markers on Map
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear previous hazard layers
    hazardLayersRef.current.forEach((layer) => map.removeLayer(layer));
    hazardLayersRef.current = [];

    hazards.forEach((hazard) => {
      if (!hazard.coordinates) return;
      const point = L.latLng(hazard.coordinates.lat, hazard.coordinates.lng);
      const color = getHazardColor(hazard.category, hazard.severity);

      const marker = L.circleMarker(point, {
        radius: 8,
        color: color,
        fillColor: color,
        fillOpacity: 0.88,
        weight: 2
      }).addTo(map);

      // Custom HTML popup with direct React/DOM action
      const popupDiv = document.createElement('div');
      popupDiv.style.fontFamily = 'var(--font-family)';
      popupDiv.style.fontSize = '13px';
      popupDiv.style.minWidth = '180px';
      popupDiv.innerHTML = `
        <div style="font-weight:700;font-size:14px;color:#0f172a;margin-bottom:4px;">
          ${hazard.title}
        </div>
        <div style="color:#64748b;margin-bottom:2px;">
          <b>Category:</b> ${hazard.category}
        </div>
        <div style="color:#64748b;margin-bottom:6px;">
          <b>Severity:</b> <span style="font-weight:600;color:${color}">${hazard.severity}</span>
        </div>
      `;

      const deleteBtn = document.createElement('button');
      deleteBtn.innerText = 'Delete Hazard';
      deleteBtn.style.cssText =
        'background:#ef4444;color:#fff;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;display:inline-block;';
      deleteBtn.onclick = async () => {
        if (window.confirm(`Delete hazard "${hazard.title}"?`)) {
          try {
            await deleteHazard(hazard.id);
            if (onToast) onToast('Hazard removed', 'info');
          } catch (err) {
            if (onToast) onToast(err.message, 'error');
          }
        }
      };

      popupDiv.appendChild(deleteBtn);
      marker.bindPopup(popupDiv);
      hazardLayersRef.current.push(marker);
    });
  }, [hazards, deleteHazard, onToast]);

  // Request Routes
  const calculateRoutes = useCallback(
    async (start, end, additionalHazards = []) => {
      if (!start || !end) return;
      setRouting(true);
      setRoutingError('');

      // Clear existing route layers
      const map = mapInstanceRef.current;
      if (map) {
        routeLayersRef.current.forEach((layer) => map.removeLayer(layer));
        routeLayersRef.current = [];
      }

      try {
        const activeHazards = [
          ...new Map(
            [...activeHazardsList, ...additionalHazards]
              .filter((h) => h?.coordinates)
              .map((h) => [
                h.id || `${h.coordinates.lat},${h.coordinates.lng}`,
                h
              ])
          ).values()
        ];

        const response = await fetch('/api/route', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            start: { lat: start.lat, lng: start.lng },
            end: { lat: end.lat, lng: end.lng },
            hazards: activeHazards
          })
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || 'Routing service unavailable.');
        }

        const routes = payload.data || [];
        if (!routes.length) {
          throw new Error('No route found avoiding active hazards.');
        }

        const evaluated = routes.map((r) => ({
          ...r,
          hazardCount: activeHazards.filter((h) => routeTouchesHazard(r, h)).length
        }));

        const unique = [
          ...new Map(evaluated.map((r) => [routeSignature(r), r])).values()
        ];

        const sorted = unique
          .sort(
            (a, b) =>
              a.hazardCount - b.hazardCount || a.duration - b.duration
          )
          .slice(0, 3);

        setRouteCandidates(sorted);
        setSelectedRouteIndex(0);

        if (map) {
          routeLayersRef.current = sorted.map((route, idx) => {
            const isSelected = idx === 0;
            const layer = L.geoJSON(route.geometry, {
              style: {
                color: isSelected ? '#2563eb' : '#93c5fd',
                opacity: isSelected ? 0.95 : 0.45,
                weight: isSelected ? 7 : 5,
                lineCap: 'round',
                lineJoin: 'round'
              },
              interactive: true
            }).addTo(map);

            layer.on('click', () => {
              setSelectedRouteIndex(idx);
            });

            return layer;
          });

          if (sorted[0]?.geometry?.coordinates?.length) {
            const bounds = L.latLngBounds(
              sorted[0].geometry.coordinates.map((p) => [p[1], p[0]])
            );
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
          }
        }
      } catch (err) {
        setRoutingError(err.message || 'Could not calculate a route.');
      } finally {
        setRouting(false);
      }
    },
    [activeHazardsList]
  );

  // Update polyline styling when selected route changes
  useEffect(() => {
    routeLayersRef.current.forEach((layer, idx) => {
      const isSelected = idx === selectedRouteIndex;
      layer.setStyle({
        color: isSelected ? '#2563eb' : '#93c5fd',
        opacity: isSelected ? 0.95 : 0.45,
        weight: isSelected ? 7 : 5
      });
      if (isSelected) layer.bringToFront();
    });
  }, [selectedRouteIndex]);

  // Navigate Handler
  const handleNavigate = async () => {
    if (!endQuery.trim()) {
      alert('Please enter a destination.');
      return;
    }

    let start = startCoords;
    if (!start && startQuery.trim()) {
      const resolved = await geocodeAddress(startQuery);
      if (!resolved) {
        alert('Could not resolve starting location.');
        return;
      }
      start = { lat: resolved.lat, lng: resolved.lng };
      setStartCoords(start);
      if (mapInstanceRef.current) {
        if (startMarkerRef.current) mapInstanceRef.current.removeLayer(startMarkerRef.current);
        startMarkerRef.current = L.marker(start)
          .addTo(mapInstanceRef.current)
          .bindPopup(`Start: ${resolved.name}`);
      }
    }

    if (!start) {
      alert('Please enter a starting point or use GPS locate.');
      return;
    }

    let end = endCoords;
    if (!end || !endQuery.trim()) {
      const resolved = await geocodeAddress(endQuery);
      if (!resolved) {
        alert('Could not resolve destination location.');
        return;
      }
      end = { lat: resolved.lat, lng: resolved.lng };
      setEndCoords(end);
      if (mapInstanceRef.current) {
        if (endMarkerRef.current) mapInstanceRef.current.removeLayer(endMarkerRef.current);
        endMarkerRef.current = L.marker(end)
          .addTo(mapInstanceRef.current)
          .bindPopup(`Destination: ${resolved.name}`)
          .openPopup();
      }
    }

    await calculateRoutes(start, end);
  };

  // GPS Locate for Start Point
  const handleGpsLocate = async () => {
    setLocatingGps(true);
    try {
      const loc = await getDeviceLocation();
      setStartCoords(loc);
      setStartQuery('Current Location');
      const map = mapInstanceRef.current;
      if (map) {
        map.flyTo(loc, 15);
        if (startMarkerRef.current) map.removeLayer(startMarkerRef.current);
        startMarkerRef.current = L.marker(loc)
          .addTo(map)
          .bindPopup('Your Current Location')
          .openPopup();
      }
      if (onToast) onToast('Location detected via device GPS', 'info');
    } catch (err) {
      alert(err.message || 'Could not access device location.');
    } finally {
      setLocatingGps(false);
    }
  };

  // Clear All
  const handleClear = () => {
    setStartQuery('');
    setEndQuery('');
    setStartCoords(null);
    setEndCoords(null);
    setRouteCandidates([]);
    setSelectedRouteIndex(0);
    setRoutingError('');

    const map = mapInstanceRef.current;
    if (map) {
      if (startMarkerRef.current) map.removeLayer(startMarkerRef.current);
      if (endMarkerRef.current) map.removeLayer(endMarkerRef.current);
      routeLayersRef.current.forEach((l) => map.removeLayer(l));
      routeLayersRef.current = [];
      map.flyTo([28.6139, 77.209], 12);
    }
  };

  // Route candidate label
  const getRouteLabel = (route, idx) => {
    if (!routeCandidates.length) return '';
    const fastest = routeCandidates.reduce(
      (b, r) => (r.duration < b.duration ? r : b),
      routeCandidates[0]
    );
    const shortest = routeCandidates.reduce(
      (b, r) => (r.distance < b.distance ? r : b),
      routeCandidates[0]
    );
    if (route === fastest && route === shortest) return 'Fastest & Shortest';
    if (route === fastest) return 'Fastest Route';
    if (route === shortest) return 'Shortest Route';
    if (idx === 0) return 'Recommended Detour';
    return `Alternative ${idx + 1}`;
  };

  const selectedRoute = routeCandidates[selectedRouteIndex];

  return (
    <div className="map-screen-layout">
      {/* Sidebar Controls */}
      <aside className="map-sidebar">
        <div className="map-sidebar-content">
          {/* Search Inputs Card */}
          <div className="input-card">
            <div className="form-field-group">
              <label htmlFor="start-point" className="field-label">
                Starting Point
              </label>
              <div className="input-with-button">
                <input
                  id="start-point"
                  type="text"
                  className="form-input"
                  placeholder="Choose starting point or address..."
                  value={startQuery}
                  onChange={(e) => {
                    setStartQuery(e.target.value);
                    setStartCoords(null);
                    if (startMarkerRef.current && mapInstanceRef.current) {
                      mapInstanceRef.current.removeLayer(startMarkerRef.current);
                      startMarkerRef.current = null;
                    }
                  }}
                />
                <button
                  type="button"
                  className="input-suffix-btn"
                  onClick={handleGpsLocate}
                  title="Use my current GPS location"
                  aria-label="Use GPS location"
                  disabled={locatingGps}
                >
                  {locatingGps ? (
                    <Loader2 size={16} className="spin" />
                  ) : (
                    <Crosshair size={16} />
                  )}
                </button>
              </div>
            </div>

            <div className="form-field-group">
              <label htmlFor="end-point" className="field-label">
                Destination
              </label>
              <div className="input-with-button">
                <input
                  id="end-point"
                  type="text"
                  className="form-input"
                  placeholder="Enter destination location..."
                  value={endQuery}
                  onChange={(e) => {
                    setEndQuery(e.target.value);
                    setEndCoords(null);
                    if (endMarkerRef.current && mapInstanceRef.current) {
                      mapInstanceRef.current.removeLayer(endMarkerRef.current);
                      endMarkerRef.current = null;
                    }
                  }}
                />
              </div>
            </div>

            <div className="action-row">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleClear}
                style={{ flex: 1 }}
              >
                Clear
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleNavigate}
                disabled={routing}
                style={{ flex: 2 }}
              >
                {routing ? (
                  <>
                    <Loader2 size={16} className="spin" /> Calculating...
                  </>
                ) : (
                  <>
                    <Navigation size={16} /> Navigate
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Results / Directions Panel */}
          {routingError ? (
            <div
              style={{
                background: 'var(--danger-light)',
                border: '1px solid var(--danger-border)',
                color: 'var(--danger)',
                padding: '1rem',
                borderRadius: 'var(--radius-lg)',
                fontSize: '0.88rem'
              }}
            >
              <b>Could not calculate route:</b>
              <p style={{ marginTop: '0.25rem' }}>{routingError}</p>
            </div>
          ) : selectedRoute ? (
            <div className="route-summary-card">
              <div className="route-summary-top">
                <div>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em'
                    }}
                  >
                    RECOMMENDED ROUTE
                  </span>
                  <div className="route-time">
                    {formatDuration(selectedRoute.duration)}
                  </div>
                  <div className="route-submeta">
                    {formatDistance(selectedRoute.distance)} ·{' '}
                    {selectedRoute.hazardCount === 0 ? (
                      <span style={{ color: 'var(--success)', fontWeight: 600 }}>
                        Avoids all active hazards
                      </span>
                    ) : (
                      <span style={{ color: 'var(--danger)', fontWeight: 600 }}>
                        Passes {selectedRoute.hazardCount} active hazard
                        {selectedRoute.hazardCount === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                </div>

                <span
                  className={`route-badge ${
                    selectedRoute.hazardCount === 0
                      ? 'route-badge-safe'
                      : 'route-badge-caution'
                  }`}
                >
                  {selectedRoute.hazardCount === 0 ? '✓ Safe' : '⚠ Caution'}
                </span>
              </div>

              {/* Compare Alternatives */}
              {routeCandidates.length > 1 && (
                <div style={{ marginTop: '0.75rem' }}>
                  <span
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      color: 'var(--text-secondary)'
                    }}
                  >
                    Compare Route Options:
                  </span>
                  <div className="route-options-list">
                    {routeCandidates.map((route, idx) => (
                      <div
                        key={idx}
                        className={`route-option-item ${
                          idx === selectedRouteIndex ? 'selected' : ''
                        }`}
                        onClick={() => setSelectedRouteIndex(idx)}
                      >
                        <div className="route-option-header">
                          <span className="route-option-time">
                            {formatDuration(route.duration)}
                          </span>
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              color: 'var(--primary)'
                            }}
                          >
                            {getRouteLabel(route, idx)}
                          </span>
                        </div>
                        <div className="route-option-details">
                          {formatDistance(route.distance)} ·{' '}
                          {route.hazardCount === 0
                            ? 'Hazard-free'
                            : `${route.hazardCount} hazard(s)`}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Turn-by-turn directions */}
              <div style={{ marginTop: '1rem' }}>
                <span
                  style={{
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    color: 'var(--text-primary)'
                  }}
                >
                  Turn-by-turn Directions
                </span>
                <ol className="turn-list">
                  {(selectedRoute.legs || [])
                    .flatMap((leg) => leg.steps || [])
                    .filter((step) => step && (step.name || step.maneuver))
                    .map((step, idx) => (
                      <li key={idx} className="turn-item">
                        <span className="turn-icon">
                          {step.maneuver?.type === 'arrive' ? '●' : '↗'}
                        </span>
                        <div>
                          <span>{step.maneuver?.instruction || step.name}</span>
                          {step.name && (
                            <small
                              style={{
                                display: 'block',
                                color: 'var(--text-muted)'
                              }}
                            >
                              via {step.name}
                            </small>
                          )}
                        </div>
                        <span className="turn-dist">
                          {formatDistance(step.distance)}
                        </span>
                      </li>
                    ))}
                </ol>
              </div>
            </div>
          ) : (
            <div
              style={{
                background: 'var(--bg-surface-alt)',
                border: '1px dashed var(--border-strong)',
                borderRadius: 'var(--radius-lg)',
                padding: '1.5rem',
                textAlign: 'center',
                color: 'var(--text-secondary)'
              }}
            >
              <Compass
                size={32}
                style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}
              />
              <p style={{ fontSize: '0.875rem' }}>
                Enter a start address and a destination location above, then click{' '}
                <b>Navigate</b> to calculate live safe routes around hazards.
              </p>
            </div>
          )}
        </div>
      </aside>

      {/* Map Area */}
      <div className="map-container-wrap">
        <div ref={mapContainerRef} className="map-canvas" />

        {/* Floating Mark Hazard Button */}
        <button
          type="button"
          className="floating-hazard-btn"
          onClick={() => {
            setHazardModalPoint(null);
            setHazardModalOpen(true);
          }}
          title="Report a hazard at my current location"
        >
          <Plus size={18} /> Mark Hazard
        </button>
      </div>

      {/* Hazard Report Modal */}
      <HazardModal
        isOpen={hazardModalOpen}
        initialPoint={hazardModalPoint}
        onClose={() => {
          setHazardModalOpen(false);
          setHazardModalPoint(null);
        }}
        onCreated={async (newHazard) => {
          await fetchHazards();
          if (startCoords && endCoords) {
            await calculateRoutes(startCoords, endCoords, [newHazard]);
          }
        }}
        onToast={onToast}
      />
    </div>
  );
}
