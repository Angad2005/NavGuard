import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { MapView } from './components/MapView';
import { SidebarDock } from './components/SidebarDock';
import { HazardModal } from './components/HazardModal';
import { RouteSafetyInspectorModal } from './components/RouteSafetyInspectorModal';
import { NavAIChatModal } from './components/NavAIChatModal';
import { AlternateRoutePromptModal } from './components/AlternateRoutePromptModal';
import { Toast } from './components/Toast';
import { useHazards } from './context/HazardContext';
import {
  geocodeAddress,
  reverseGeocodePoint,
  getDeviceLocation,
  distanceBetweenPointsMeters,
  routeTouchesHazard
} from './utils/geo';
import { playSound, speakNavAI } from './utils/audio';
import { apiFetch } from './utils/api';
import { fetchWeatherForPoint } from './utils/weather';

export function App() {
  const { hazards, activeHazardsList } = useHazards();

  // Navigation & Dock Tab State
  const [activeTab, setActiveTab] = useState('routes');
  const [isDockCollapsed, setIsDockCollapsed] = useState(false);

  // Address Inputs & Coordinates
  const [startQuery, setStartQuery] = useState('');
  const [endQuery, setEndQuery] = useState('');
  const [startCoords, setStartCoords] = useState(null);
  const [endCoords, setEndCoords] = useState(null);

  // Autocomplete Suggestions
  const [startSuggestions, setStartSuggestions] = useState([]);
  const [endSuggestions, setEndSuggestions] = useState([]);

  // Routing State
  const [routing, setRouting] = useState(false);
  const [routeResults, setRouteResults] = useState([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [routingError, setRoutingError] = useState('');
  const [navigationMode, setNavigationMode] = useState(false);

  // GPS Locating
  const [locatingGps, setLocatingGps] = useState(false);
  const [userLocation, setUserLocation] = useState(null);

  // Weather & Atmosphere Telemetry State
  const [weatherData, setWeatherData] = useState(null);
  const [weatherMode, setWeatherMode] = useState('auto');
  const [rainSoundEnabled, setRainSoundEnabled] = useState(false);
  const [windshieldGlass, setWindshieldGlass] = useState(false);

  // Emergency Haven State
  const [selectedHavenType, setSelectedHavenType] = useState('hospital');
  const [emergencyPlaces, setEmergencyPlaces] = useState([]);
  const [emergencyLoading, setEmergencyLoading] = useState(false);

  // Modals
  const [hazardModalOpen, setHazardModalOpen] = useState(false);
  const [modalCoords, setModalCoords] = useState(null);

  const [safetyAuditOpen, setSafetyAuditOpen] = useState(false);
  const [navAIOpen, setNavAIOpen] = useState(false);
  const [alternateRoutePrompt, setAlternateRoutePrompt] = useState(null);
  const [safetyAuditData, setSafetyAuditData] = useState(null);

  const [toasts, setToasts] = useState([]);

  // Toast Helper
  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random().toString(36).substring(2, 6);
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const dismissToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Initial user location and weather fetch
  const loadWeatherForPoint = useCallback(async (point) => {
    try {
      setWeatherData(await fetchWeatherForPoint(point));
    } catch (error) {
      console.warn('Live weather unavailable:', error);
      addToast(error.message || 'Could not load live weather.', 'error');
    }
  }, [addToast]);

  useEffect(() => {
    getDeviceLocation()
      .then((loc) => {
        setUserLocation(loc);
        loadWeatherForPoint(loc);
      })
      .catch(() => {
        const defaultPt = { lat: 28.6139, lng: 77.209 };
        setUserLocation(defaultPt);
        loadWeatherForPoint(defaultPt);
      });
  }, [loadWeatherForPoint]);

  // Autocomplete debouncers
  useEffect(() => {
    if (!startQuery || startQuery.length < 3 || startCoords) {
      setStartSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=4&addressdetails=1&q=${encodeURIComponent(startQuery)}`
        );
        if (res.ok) setStartSuggestions(await res.json());
      } catch {}
    }, 350);
    return () => clearTimeout(t);
  }, [startQuery, startCoords]);

  useEffect(() => {
    if (!endQuery || endQuery.length < 3 || endCoords) {
      setEndSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=4&addressdetails=1&q=${encodeURIComponent(endQuery)}`
        );
        if (res.ok) setEndSuggestions(await res.json());
      } catch {}
    }, 350);
    return () => clearTimeout(t);
  }, [endQuery, endCoords]);

  // Fetch Safe Havens when tab is emergency
  useEffect(() => {
    if (activeTab !== 'emergency') return;
    const pt = startCoords || userLocation || { lat: 28.6139, lng: 77.209 };

    setEmergencyLoading(true);
    setEmergencyPlaces([]);

    const amenity = selectedHavenType;
    const query = `[out:json][timeout:10];
      (
        node["amenity"="${amenity}"](around:8000,${pt.lat},${pt.lng});
        way["amenity"="${amenity}"](around:8000,${pt.lat},${pt.lng});
      );
      out center 8;`;

    fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query
    })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        const items = (data.elements || []).map((el) => {
          const lat = el.lat || el.center?.lat;
          const lng = el.lon || el.center?.lon;
          return {
            id: el.id,
            name: el.tags?.name || `${selectedHavenType.toUpperCase()} Facility`,
            street: el.tags?.['addr:street'] || 'Public Facility',
            phone: el.tags?.phone || '112',
            lat,
            lng,
            distance: distanceBetweenPointsMeters(pt, { lat, lng })
          };
        });
        items.sort((a, b) => a.distance - b.distance);
        setEmergencyPlaces(items);
      })
      .catch(() => {
        setEmergencyPlaces([
          {
            id: 1,
            name: selectedHavenType === 'hospital' ? 'City Emergency Trauma Center' : 'Civil Defense Station',
            street: 'Main Emergency Corridor',
            phone: '112 / 911',
            lat: pt.lat + 0.012,
            lng: pt.lng + 0.008,
            distance: 1450
          },
          {
            id: 2,
            name: selectedHavenType === 'hospital' ? 'Metro Safety Care Hospital' : 'District Police Headquarters',
            street: 'Central Avenue',
            phone: '112',
            lat: pt.lat - 0.014,
            lng: pt.lng + 0.01,
            distance: 2150
          }
        ]);
      })
      .finally(() => setEmergencyLoading(false));
  }, [activeTab, selectedHavenType, startCoords, userLocation]);

  // Handle GPS button click
  const handleUseGps = async () => {
    setLocatingGps(true);
    playSound('click');
    try {
      const pos = await getDeviceLocation();
      setStartCoords(pos);
      setUserLocation(pos);
      loadWeatherForPoint(pos);
      if (window.__naviguard_focus) window.__naviguard_focus(pos);
      const name = await reverseGeocodePoint(pos);
      setStartQuery(name ? name.split(',').slice(0, 2).join(',') : 'Current GPS Location');
      addToast('Start point set to your GPS location.', 'success');
    } catch (err) {
      addToast(err.message || 'Could not fetch GPS location', 'error');
    } finally {
      setLocatingGps(false);
    }
  };

  const handleSwap = () => {
    playSound('click');
    setStartQuery(endQuery);
    setEndQuery(startQuery);
    setStartCoords(endCoords);
    setEndCoords(startCoords);
  };

  const handleSelectPreset = async (preset) => {
    playSound('click');
    setEndQuery(preset.query);
    setEndCoords(null);
    addToast(`Selected destination: ${preset.label}`, 'info');

    const res = await geocodeAddress(preset.query);
    if (res) {
      setEndCoords({ lat: res.lat, lng: res.lng });
      setEndQuery(res.name.split(',').slice(0, 2).join(','));
    }
  };

  const handleSelectSuggestion = (type, sug) => {
    playSound('click');
    const coords = { lat: Number(sug.lat), lng: Number(sug.lon) };
    const label = sug.display_name.split(',').slice(0, 2).join(',');

    if (type === 'start') {
      setStartCoords(coords);
      setStartQuery(label);
      setStartSuggestions([]);
    } else {
      setEndCoords(coords);
      setEndQuery(label);
      setEndSuggestions([]);
    }
  };

  // Compute Route
  const handleResolveRoute = async (e) => {
    if (e) e.preventDefault();
    setRoutingError('');

    let currentStart = startCoords;
    let currentEnd = endCoords;

    if (!currentStart && startQuery.trim()) {
      const res = await geocodeAddress(startQuery);
      if (res) {
        currentStart = { lat: res.lat, lng: res.lng };
        setStartCoords(currentStart);
      } else {
        setRoutingError(`Could not find "${startQuery}". Try clicking on the map.`);
        playSound('warning');
        return;
      }
    }

    if (!currentEnd && endQuery.trim()) {
      const res = await geocodeAddress(endQuery);
      if (res) {
        currentEnd = { lat: res.lat, lng: res.lng };
        setEndCoords(currentEnd);
      } else {
        setRoutingError(`Could not find "${endQuery}". Try clicking on the map.`);
        playSound('warning');
        return;
      }
    }

    if (!currentStart || !currentEnd) {
      setRoutingError('Please select both origin and destination.');
      playSound('warning');
      return;
    }

    setRouting(true);
    try {
      const res = await apiFetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start: currentStart,
          end: currentEnd,
          hazards: activeHazardsList
        })
      });

      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Failed to compute route.');

      const routes = Array.isArray(payload.data) ? payload.data : [];
      if (routes.length === 0) {
        setRoutingError('No passable route found avoiding all hazards.');
        setRouteResults([]);
        playSound('warning');
      } else {
        setRouteResults(routes);
        setSelectedRouteIndex(0);
        playSound('route');
        const detour = routes.some((r) => r.hazardDetour);
        addToast(
          detour
            ? `Safe detour corridor calculated! Bypassed ${payload.hazardsConsidered || 'active'} road hazards.`
            : `Fastest safe route calculated successfully.`,
          'success'
        );
      }
    } catch (err) {
      setRoutingError(err.message || 'Routing calculation failed.');
      playSound('warning');
      addToast(err.message || 'Routing failed.', 'error');
    } finally {
      setRouting(false);
    }
  };


  // Handler when user adds a hazard - checks if it intersects active corridor and asks driver first!
  const handleHazardCreated = async (createdHazard) => {
    const currentRoute = routeResults[selectedRouteIndex];
    if (!currentRoute || !startCoords || !endCoords) return;

    const touches = routeTouchesHazard(currentRoute, createdHazard, 200);
    if (!touches) return;

    try {
      const res = await apiFetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start: startCoords,
          end: endCoords,
          hazards: [...activeHazardsList, createdHazard]
        })
      });

      if (res.ok) {
        const payload = await res.json();
        const routes = Array.isArray(payload.data) ? payload.data : [];
        if (routes.length > 0) {
          const altRoute = routes[0];
          setAlternateRoutePrompt({
            hazard: createdHazard,
            currentRoute,
            alternateRoute: altRoute,
            alternateRoutes: routes
          });
          playSound('warning');
          speakNavAI(
            `Caution: ${createdHazard.title || 'Obstacle'} reported on your path. An alternate safe detour has been calculated. Would you like to switch to the alternate route?`
          );
        }
      }
    } catch (err) {
      console.warn('Detour route calculation error:', err);
    }
  };

  const handleAcceptAlternateDetour = () => {
    if (!alternateRoutePrompt) return;
    setRouteResults(alternateRoutePrompt.alternateRoutes);
    setSelectedRouteIndex(0);
    setAlternateRoutePrompt(null);
    playSound('route');
    addToast('Switched to safe alternate detour! Obstacle safely bypassed.', 'success');
    speakNavAI('Alternate safe detour engaged. Safe travels.');
  };

  const handleKeepCurrentRoute = () => {
    if (!alternateRoutePrompt) return;
    const hTitle = alternateRoutePrompt.hazard?.title || 'obstacle';
    setAlternateRoutePrompt(null);
    playSound('click');
    addToast(`Proceeding on current route. Caution advised near ${hTitle}.`, 'info');
  };

  const handleClearRoute = () => {
    playSound('click');
    setRouteResults([]);
    setStartCoords(null);
    setEndCoords(null);
    setStartQuery('');
    setEndQuery('');
    setRoutingError('');
    setNavigationMode(false);
  };

  const handleSelectEmergencyDestination = (place) => {
    setEndCoords({ lat: place.lat, lng: place.lng });
    setEndQuery(place.name);
    setActiveTab('routes');
    setIsDockCollapsed(false);
    addToast(`Emergency route set to ${place.name}!`, 'success');
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 antialiased selection:bg-blue-500 selection:text-white">
      {/* Top Floating Dynamic Island HUD */}
      <Navbar
        onOpenNavAI={() => setNavAIOpen(true)}
        onOpenReport={() => {
          setModalCoords(null);
          setHazardModalOpen(true);
        }}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          setIsDockCollapsed(false);
        }}
        weatherData={weatherData}
      />

      {/* Main Map Viewport */}
      <main className="w-full h-full relative">
        <MapView
          startCoords={startCoords}
          setStartCoords={setStartCoords}
          setStartQuery={setStartQuery}
          endCoords={endCoords}
          setEndCoords={setEndCoords}
          setEndQuery={setEndQuery}
          routeResults={routeResults}
          selectedRouteIndex={selectedRouteIndex}
          setSelectedRouteIndex={setSelectedRouteIndex}
          navigationMode={navigationMode}
          setNavigationMode={setNavigationMode}
          onOpenReportWithCoords={(pt) => {
            setModalCoords(pt);
            setHazardModalOpen(true);
          }}
          onOpenNavAI={() => setNavAIOpen(true)}
          weatherCode={weatherData?.weathercode}
          manualWeatherMode={weatherMode}
          rainSoundEnabled={rainSoundEnabled}
          windshieldGlass={windshieldGlass}
          onToast={addToast}
          previewAlternateRoute={alternateRoutePrompt?.alternateRoute}
        />
      </main>

      {/* Unified Left Command Dock */}
      {!navigationMode && (
        <SidebarDock
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isCollapsed={isDockCollapsed}
          setIsCollapsed={setIsDockCollapsed}
          // Route Props
          startQuery={startQuery}
          setStartQuery={setStartQuery}
          endQuery={endQuery}
          setEndQuery={setEndQuery}
          startCoords={startCoords}
          endCoords={endCoords}
          onUseGps={handleUseGps}
          locatingGps={locatingGps}
          onSwap={handleSwap}
          onSelectPreset={handleSelectPreset}
          startSuggestions={startSuggestions}
          endSuggestions={endSuggestions}
          onSelectSuggestion={handleSelectSuggestion}
          onResolveRoute={handleResolveRoute}
          routing={routing}
          routingError={routingError}
          routeResults={routeResults}
          selectedRouteIndex={selectedRouteIndex}
          setSelectedRouteIndex={setSelectedRouteIndex}
          onClearRoute={handleClearRoute}
          onStartNavigation={() => setNavigationMode(true)}
          onOpenSafetyAudit={(route, s, e) => {
            setSafetyAuditData({ route, startName: s, endName: e });
            setSafetyAuditOpen(true);
            playSound('click');
          }}
          // Hazard Feed Props
          onFocusHazard={(coords) => {
            if (window.__naviguard_focus) window.__naviguard_focus(coords);
          }}
          onOpenReport={() => {
            setModalCoords(null);
            setHazardModalOpen(true);
          }}
          // Weather Props
          weatherData={weatherData}
          weatherMode={weatherMode}
          setWeatherMode={setWeatherMode}
          rainSoundEnabled={rainSoundEnabled}
          setRainSoundEnabled={setRainSoundEnabled}
          windshieldGlass={windshieldGlass}
          setWindshieldGlass={setWindshieldGlass}
          // Emergency Haven Props
          userCoords={startCoords || userLocation}
          emergencyPlaces={emergencyPlaces}
          emergencyLoading={emergencyLoading}
          selectedHavenType={selectedHavenType}
          setSelectedHavenType={setSelectedHavenType}
          onSelectEmergencyDestination={handleSelectEmergencyDestination}
          onToast={addToast}
          onOpenNavAIModal={() => setNavAIOpen(true)}
        />
      )}

      {/* Hazard Reporting Modal */}
      <HazardModal
        isOpen={hazardModalOpen}
        onClose={() => setHazardModalOpen(false)}
        initialCoords={modalCoords}
        onToast={addToast}
        onHazardCreated={handleHazardCreated}
      />

      {/* Route Safety & Environmental Inspector Modal */}
      <RouteSafetyInspectorModal
        isOpen={safetyAuditOpen}
        onClose={() => setSafetyAuditOpen(false)}
        route={safetyAuditData?.route}
        startName={safetyAuditData?.startName}
        endName={safetyAuditData?.endName}
        hazards={hazards}
        onToast={addToast}
      />


      {/* NavAI Dedicated Real-Time Route Copilot */}
      <NavAIChatModal
        isOpen={navAIOpen}
        onClose={() => setNavAIOpen(false)}
        route={routeResults[selectedRouteIndex]}
        startQuery={startQuery}
        endQuery={endQuery}
        weatherData={weatherData}
        activeHazardsList={hazards}
        onStartNavigation={() => {
          setNavigationMode(true);
          setNavAIOpen(false);
        }}
        onOpenSafetyAudit={(route, s, e) => {
          setSafetyAuditData({ route, startName: s, endName: e });
          setSafetyAuditOpen(true);
        }}
        onFocusHazard={(coords) => {
          if (window.__naviguard_focus) window.__naviguard_focus(coords);
        }}
      />


      {/* Alternate Route Detour Prompt Modal */}
      <AlternateRoutePromptModal
        isOpen={Boolean(alternateRoutePrompt)}
        hazard={alternateRoutePrompt?.hazard}
        currentRoute={alternateRoutePrompt?.currentRoute}
        alternateRoute={alternateRoutePrompt?.alternateRoute}
        onAcceptDetour={handleAcceptAlternateDetour}
        onKeepCurrentRoute={handleKeepCurrentRoute}
      />

      {/* Toast System */}
      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
