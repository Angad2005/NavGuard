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
import { useAuth } from './context/AuthContext';
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

function readAccountList(userId, listName) {
  if (!userId) return [];
  try {
    const value = JSON.parse(localStorage.getItem(`naviguard_${listName}_${userId}`) || '[]');
    return Array.isArray(value) ? value : [];
  } catch (error) {
    console.warn(`Could not read saved ${listName}:`, error);
    return [];
  }
}

function mergeRouteSegments(segments) {
  const coordinates = [];
  segments.forEach((route) => {
    const points = route.geometry?.coordinates || [];
    coordinates.push(...(coordinates.length ? points.slice(1) : points));
  });
  return {
    ...segments[0],
    geometry: { type: 'LineString', coordinates },
    distance: segments.reduce((total, route) => total + Number(route.distance || 0), 0),
    duration: segments.reduce((total, route) => total + Number(route.duration || 0), 0),
    hazardDetour: segments.some((route) => route.hazardDetour === true)
  };
}

export function App() {
  const { hazards, activeHazardsList } = useHazards();
  const { user } = useAuth();

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
  const [routeWaypoints, setRouteWaypoints] = useState([]);
  const [savedPlaces, setSavedPlaces] = useState([]);
  const [savedRoutes, setSavedRoutes] = useState(() => readAccountList(user?.id, 'routes'));

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
  const [emergencyError, setEmergencyError] = useState('');

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
    if (!user?.id) return undefined;
    let cancelled = false;
    const loadPlaces = async () => {
      try {
        const response = await apiFetch('/api/places');
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not load saved places.');
        let places = Array.isArray(payload.data) ? payload.data : [];
        if (places.length === 0) {
          const previousPlaces = readAccountList(user.id, 'places');
          for (const previousPlace of previousPlaces) {
            const migrationResponse = await apiFetch('/api/places', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: previousPlace.name,
                coordinates: previousPlace.coordinates
              })
            });
            const migrationPayload = await migrationResponse.json();
            if (!migrationResponse.ok) {
              throw new Error(migrationPayload.error || `Could not migrate saved place "${previousPlace.name}".`);
            }
            places = [migrationPayload.data, ...places];
          }
        }
        if (!cancelled) {
          setSavedPlaces((currentPlaces) => {
            const loadedIds = new Set(places.map((place) => place.id));
            return [
              ...places,
              ...currentPlaces.filter((place) => !loadedIds.has(place.id))
            ];
          });
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('Could not load saved places:', error);
          addToast(error.message || 'Could not load saved places.', 'error');
        }
      }
    };
    loadPlaces();
    return () => {
      cancelled = true;
    };
  }, [user?.id, addToast]);

  useEffect(() => {
    if (!user?.id) return;
    try {
      localStorage.setItem(`naviguard_routes_${user.id}`, JSON.stringify(savedRoutes));
    } catch (error) {
      console.warn('Could not save saved routes locally:', error);
      addToast('Could not save routes on this device.', 'error');
    }
  }, [savedRoutes, user?.id, addToast]);

  useEffect(() => {
    getDeviceLocation()
      .then((loc) => {
        setUserLocation(loc);
        loadWeatherForPoint(loc);
      })
      .catch(() => {
        const defaultPt = { lat: 28.6139, lng: 77.209 };
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

  // Fetch Safe Havens when tab is emergency
  useEffect(() => {
    if (activeTab !== 'emergency') return;
    if (!userLocation) {
      setEmergencyPlaces([]);
      setEmergencyError('Allow location access to find nearby emergency services.');
      setEmergencyLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const pt = userLocation;
    setEmergencyLoading(true);
    setEmergencyPlaces([]);
    setEmergencyError('');

    const amenity = selectedHavenType === 'fire' ? 'fire_station' : selectedHavenType;
    const query = `[out:json][timeout:10];
      (
        node["amenity"="${amenity}"](around:8000,${pt.lat},${pt.lng});
        way["amenity"="${amenity}"](around:8000,${pt.lat},${pt.lng});
        relation["amenity"="${amenity}"](around:8000,${pt.lat},${pt.lng});
      );
      out center;`;

    fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
      signal: controller.signal
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Emergency service map is unavailable.'))))
      .then((data) => {
        const items = (data.elements || []).map((el) => {
          const lat = Number(el.lat ?? el.center?.lat);
          const lng = Number(el.lon ?? el.center?.lon);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          return {
            id: el.id,
            name: el.tags?.name || `${selectedHavenType.toUpperCase()} Facility`,
            street: el.tags?.['addr:street'] || 'Public Facility',
            phone: el.tags?.phone || el.tags?.['contact:phone'] || null,
            lat,
            lng,
            distance: distanceBetweenPointsMeters(pt, { lat, lng })
          };
        }).filter(Boolean);
        items.sort((a, b) => a.distance - b.distance);
        if (!cancelled) setEmergencyPlaces(items.slice(0, 8));
      })
      .catch((error) => {
        if (!cancelled && error.name !== 'AbortError') {
          console.warn('Emergency POI fetch failed:', error);
          setEmergencyPlaces([]);
          setEmergencyError(error.message || 'Could not load nearby emergency services.');
        }
      })
      .finally(() => {
        if (!cancelled) setEmergencyLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeTab, selectedHavenType, userLocation]);

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
    setRouteWaypoints((previous) => [...previous].reverse());
  };

  const handleSelectSuggestion = (sug) => {
    playSound('click');
    const coords = { lat: Number(sug.lat), lng: Number(sug.lon) };
    const label = sug.display_name.split(',').slice(0, 2).join(',');

    setStartCoords(coords);
    setStartQuery(label);
    setStartSuggestions([]);
  };

  const requestRoutesForPlan = async (currentStart, currentEnd, stops, hazards) => {
    if (!stops.length) {
      const response = await apiFetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: currentStart, end: currentEnd, hazards })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to compute route.');
      return Array.isArray(payload.data) ? payload.data : [];
    }

    const segmentRoutes = [];
    const points = [currentStart, ...stops, currentEnd];
    for (let index = 0; index < points.length - 1; index += 1) {
      const response = await apiFetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: points[index], end: points[index + 1], hazards })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to compute route.');
      const routes = Array.isArray(payload.data) ? payload.data : [];
      if (!routes.length) return [];
      segmentRoutes.push(routes[0]);
    }
    return [mergeRouteSegments(segmentRoutes)];
  };

  const calculateRoutePlan = async (currentStart, currentEnd, stops = routeWaypoints, hazards = activeHazardsList) => {
    setRoutingError('');
    setRouting(true);
    try {
      const routes = await requestRoutesForPlan(
        currentStart,
        currentEnd,
        stops.map((point) => point.coordinates || point),
        hazards
      );
      if (routes.length === 0) {
        setRoutingError('No passable route found between all selected stops while avoiding hazards.');
        setRouteResults([]);
        playSound('warning');
      } else {
        setRouteResults(routes);
        setSelectedRouteIndex(0);
        playSound('route');
        const detour = routes.some((r) => r.hazardDetour);
        addToast(
          detour
            ? `Safe detour corridor calculated! Avoiding ${hazards.length || 'active'} road hazards.`
            : stops.length
              ? `Safe route calculated through ${stops.length} saved stop${stops.length === 1 ? '' : 's'}.`
              : 'Fastest safe route calculated successfully.',
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

  // Resolve free-text addresses near the current origin, then calculate every route leg.
  const handleResolveRoute = async (e) => {
    if (e) e.preventDefault();
    setRoutingError('');

    let currentStart = startCoords;
    let currentEnd = endCoords;
    if (!currentStart && startQuery.trim()) {
      const result = await geocodeAddress(startQuery, userLocation);
      if (result) {
        currentStart = { lat: result.lat, lng: result.lng };
        setStartCoords(currentStart);
      } else {
        setRoutingError(`Could not find "${startQuery}" near your current location.`);
        playSound('warning');
        return;
      }
    }
    if (!currentEnd && endQuery.trim()) {
      const result = await geocodeAddress(endQuery, currentStart || userLocation);
      if (result) {
        currentEnd = { lat: result.lat, lng: result.lng };
        setEndCoords(currentEnd);
      } else {
        setRoutingError(`Could not find "${endQuery}" near your origin.`);
        playSound('warning');
        return;
      }
    }
    if (!currentStart || !currentEnd) {
      setRoutingError('Please select both origin and destination.');
      playSound('warning');
      return;
    }
    await calculateRoutePlan(currentStart, currentEnd);
  };

  const handleSaveLocation = async (name, coordinates, imageFile = null) => {
    if (!coordinates || !user?.id) return;
    if (imageFile && !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(imageFile.type)) {
      addToast('Choose a JPEG, PNG, WebP, or GIF image.', 'error');
      return;
    }
    if (imageFile && imageFile.size > 5 * 1024 * 1024) {
      addToast('Images must be 5 MB or smaller.', 'error');
      return;
    }

    const request = imageFile ? new FormData() : null;
    if (request) {
      request.append('name', name.trim() || 'Saved place');
      request.append('coordinates', JSON.stringify(coordinates));
      request.append('image', imageFile);
    }

    try {
      const response = await apiFetch('/api/places', {
        method: 'POST',
        headers: request ? undefined : { 'Content-Type': 'application/json' },
        body: request || JSON.stringify({
          name: name.trim() || 'Saved place',
          coordinates
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not save this place.');
      setSavedPlaces((places) => [payload.data, ...places]);
      addToast(`Saved ${payload.data.name}${imageFile ? ' with photo' : ''}.`, 'success');
    } catch (error) {
      console.warn('Could not save place:', error);
      addToast(error.message || 'Could not save this place.', 'error');
    }
  };

  const handleAddWaypoint = (place) => {
    setRouteWaypoints((previous) => (
      previous.some((waypoint) => waypoint.id === place.id) ? previous : [...previous, place]
    ));
    addToast(`${place.name} added as a route stop.`, 'info');
  };

  const handleRemoveWaypoint = (placeId) => {
    setRouteWaypoints((previous) => previous.filter((waypoint) => waypoint.id !== placeId));
  };

  const handleDeleteSavedPlace = async (placeId) => {
    try {
      const response = await apiFetch(`/api/places/${encodeURIComponent(placeId)}`, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not delete saved place.');
      setSavedPlaces((places) => places.filter((place) => place.id !== placeId));
      setRouteWaypoints((previous) => previous.filter((waypoint) => waypoint.id !== placeId));
    } catch (error) {
      addToast(error.message || 'Could not delete saved place.', 'error');
    }
  };

  const handleDeleteSavedRoute = (routeId) => {
    setSavedRoutes((routes) => routes.filter((route) => route.id !== routeId));
  };

  const handleSelectSavedPlace = (place) => {
    setEndQuery(place.name);
    setEndCoords(place.coordinates);
    setActiveTab('routes');
    setIsDockCollapsed(false);
  };

  const handleSaveRoute = () => {
    if (!startCoords || !endCoords || !user?.id) return;
    const route = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: `${startQuery || 'Origin'} → ${endQuery || 'Destination'}`,
      start: { ...startCoords },
      end: { ...endCoords },
      startName: startQuery || 'Origin',
      endName: endQuery || 'Destination',
      waypoints: routeWaypoints.map((waypoint) => ({
        id: waypoint.id,
        name: waypoint.name,
        coordinates: { ...waypoint.coordinates }
      }))
    };
    setSavedRoutes((routes) => [route, ...routes]);
    addToast('Route saved on this device.', 'success');
  };

  const handleLoadSavedRoute = async (route) => {
    setStartCoords(route.start);
    setEndCoords(route.end);
    setStartQuery(route.startName);
    setEndQuery(route.endName);
    setRouteWaypoints(route.waypoints || []);
    setActiveTab('routes');
    setIsDockCollapsed(false);
    await calculateRoutePlan(route.start, route.end, route.waypoints || []);
  };

  // Handler when user adds a hazard - checks if it intersects active corridor and asks driver first!
  const handleHazardCreated = async (createdHazard) => {
    const currentRoute = routeResults[selectedRouteIndex];
    if (!currentRoute || !startCoords || !endCoords) return;

    const touches = routeTouchesHazard(currentRoute, createdHazard, 200);
    if (!touches) return;

    try {
      const routes = await requestRoutesForPlan(
        startCoords,
        endCoords,
        routeWaypoints.map((waypoint) => waypoint.coordinates),
        [...activeHazardsList, createdHazard]
      );
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
    setRouteWaypoints([]);
    setRoutingError('');
    setNavigationMode(false);
  };

  const handleSelectEmergencyDestination = async (place) => {
    const destination = place.coordinates || place.coords || { lat: place.lat, lng: place.lng };
    if (!userLocation || !Number.isFinite(destination.lat) || !Number.isFinite(destination.lng)) {
      addToast('A current GPS location is required to route to emergency services.', 'error');
      return;
    }
    setStartCoords(userLocation);
    setStartQuery('Your location');
    setEndCoords(destination);
    setEndQuery(place.name);
    setActiveTab('routes');
    setIsDockCollapsed(false);
    setRouteWaypoints([]);
    addToast(`Calculating an emergency route to ${place.name}...`, 'info');
    await calculateRoutePlan(userLocation, destination, []);
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
          routeWaypoints={routeWaypoints}
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
          setStartCoords={setStartCoords}
          endCoords={endCoords}
          setEndCoords={setEndCoords}
          routeWaypoints={routeWaypoints}
          onRemoveWaypoint={handleRemoveWaypoint}
          onUseGps={handleUseGps}
          locatingGps={locatingGps}
          onSwap={handleSwap}
          startSuggestions={startSuggestions}
          onSelectSuggestion={handleSelectSuggestion}
          onResolveRoute={handleResolveRoute}
          routing={routing}
          routingError={routingError}
          routeResults={routeResults}
          selectedRouteIndex={selectedRouteIndex}
          setSelectedRouteIndex={setSelectedRouteIndex}
          onClearRoute={handleClearRoute}
          savedPlaces={savedPlaces}
          savedRoutes={savedRoutes}
          onSaveLocation={handleSaveLocation}
          onAddWaypoint={handleAddWaypoint}
          onSelectSavedPlace={handleSelectSavedPlace}
          onDeleteSavedPlace={handleDeleteSavedPlace}
          onSaveRoute={handleSaveRoute}
          onLoadSavedRoute={handleLoadSavedRoute}
          onDeleteSavedRoute={handleDeleteSavedRoute}
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
          userCoords={userLocation}
          emergencyPlaces={emergencyPlaces}
          emergencyLoading={emergencyLoading}
          emergencyError={emergencyError}
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
