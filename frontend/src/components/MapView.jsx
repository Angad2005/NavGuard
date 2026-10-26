import React, { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useHazards } from '../context/HazardContext';
import {
  formatDuration,
  formatDistance,
  getHazardColor,
  reverseGeocodePoint,
  distanceBetweenPointsMeters
} from '../utils/geo';
import { WeatherCanvasOverlay } from './WeatherCanvasOverlay';
import { playSound } from '../utils/audio';
import {
  Navigation,
  MapPin,
  LocateFixed,
  Route as RouteIcon,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  X,
  Compass,
  ZoomIn,
  ZoomOut,
  AlertTriangle,
  Layers,
  Play,
  Pause,
  Sparkles,
  Eye,
  EyeOff,
  Car,
  Volume2,
  VolumeX,
  Clock,
  Bot
} from 'lucide-react';

const MAP_LAYERS = {
  streets: {
    name: 'Streets',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  },
  dark: {
    name: 'Dark Cyber',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CARTO, &copy; OpenStreetMap contributors',
    maxZoom: 20
  },
  light: {
    name: 'Clean Light',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CARTO, &copy; OpenStreetMap contributors',
    maxZoom: 20
  },
  satellite: {
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri & GIS Community',
    maxZoom: 18
  }
};

function createLocationMarker(label, color) {
  return L.divIcon({
    className: 'custom-location-marker-wrapper',
    html: `
      <div style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;">
        <div class="radar-ring" style="background-color: ${color}33;"></div>
        <div style="
          position: relative;
          z-index: 2;
          background: ${color};
          color: white;
          width: 32px;
          height: 32px;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 6px 18px rgba(0,0,0,0.35);
          border: 2px solid white;
        ">
          <span style="transform: rotate(45deg); font-weight: 800; font-size: 13px;">${label}</span>
        </div>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36]
  });
}

function createHazardMarker(category, severity) {
  const color = getHazardColor(category, severity);
  let emoji = '⚠️';
  if (category === 'Flooding') emoji = '🌊';
  else if (category === 'Road Damage') emoji = '🚧';
  else if (category === 'Debris') emoji = '🪵';
  else if (category === 'Accident') emoji = '💥';
  else if (category === 'Construction') emoji = '🏗️';

  return L.divIcon({
    className: 'custom-hazard-marker-wrapper',
    html: `
      <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;">
        <div class="radar-ring" style="background-color: ${color};"></div>
        <div style="
          position: relative;
          z-index: 2;
          background: ${color};
          color: white;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 16px ${color}88;
          border: 2px solid white;
          font-size: 15px;
        ">
          ${emoji}
        </div>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -17]
  });
}

function createVehicleMarker() {
  return L.divIcon({
    className: 'custom-vehicle-marker-wrapper',
    html: `
      <div style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;">
        <div class="radar-ring vehicle-ping-ring" style="background-color: #3b82f6;"></div>
        <div style="
          position: relative;
          z-index: 3;
          background: #2563eb;
          color: white;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 14px rgba(37,99,235,0.6);
          border: 2.5px solid white;
        ">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 19 21 12 17 5 21 12 2"></polygon>
          </svg>
        </div>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18]
  });
}

// Isolated Telemetry Capsule (Memoized to prevent MapView re-renders on clock ticks or map movement)
const TelemetryCapsule = React.memo(function TelemetryCapsule({ mapInstanceRef }) {
  const [currentTime, setCurrentTime] = useState(() =>
    new Date().toLocaleTimeString([], { hour12: false })
  );
  const [compassAngle, setCompassAngle] = useState(352);

  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(new Date().toLocaleTimeString([], { hour12: false }));
    };
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const map = mapInstanceRef?.current;
    if (!map) return;

    let ticking = false;
    let rAfId = null;

    const handleMove = () => {
      if (!ticking) {
        ticking = true;
        rAfId = requestAnimationFrame(() => {
          setCompassAngle((prev) => (prev + 0.3) % 360);
          ticking = false;
        });
      }
    };

    map.on('move', handleMove);
    return () => {
      map.off('move', handleMove);
      if (rAfId) cancelAnimationFrame(rAfId);
    };
  }, [mapInstanceRef]);

  return (
    <div className="hidden sm:flex items-center gap-3 px-3.5 py-2 rounded-2xl cyber-glass text-xs font-bold text-slate-300 shadow-xl">
      <div className="flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5 text-blue-400" />
        <span className="font-mono">{currentTime}</span>
      </div>

      <span className="text-slate-600">•</span>

      <div className="flex items-center gap-1.5">
        <Compass
          className="w-4 h-4 text-cyan-400 transition-transform duration-300"
          style={{ transform: `rotate(${compassAngle}deg)` }}
        />
        <span className="font-mono">{Math.round(compassAngle)}° N</span>
      </div>
    </div>
  );
});

export function MapView({
  startCoords,
  setStartCoords,
  setStartQuery,
  endCoords,
  setEndCoords,
  setEndQuery,
  routeResults,
  selectedRouteIndex,
  setSelectedRouteIndex,
  navigationMode,
  setNavigationMode,
  onOpenReportWithCoords,
  weatherCode,
  manualWeatherMode,
  rainSoundEnabled,
  windshieldGlass,
  onToast,
  onOpenNavAI,
  previewAlternateRoute
}) {
  const { activeHazardsList } = useHazards();

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const activeTileLayerRef = useRef(null);
  const routeLayersRef = useRef([]);
  const hazardLayersRef = useRef([]);
  const startMarkerRef = useRef(null);
  const endMarkerRef = useRef(null);
  const vehicleMarkerRef = useRef(null);

  const selectedLayerKey = 'streets';
  const [showAvoidanceZones, setShowAvoidanceZones] = useState(true);

  // Simulation & Audio Guidance
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [simulationIndex, setSimulationIndex] = useState(0);
  const [simulatedSpeed, setSimulatedSpeed] = useState(48);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  // Voice Guidance (Text-To-Speech)
  const speakGuidance = useCallback((text) => {
    if (!voiceEnabled || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('Speech error:', err);
    }
  }, [voiceEnabled]);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      worldCopyJump: true
    }).setView([28.6139, 77.209], 12);

    const initialDef = MAP_LAYERS[selectedLayerKey] || MAP_LAYERS.streets;
    const tileLayer = L.tileLayer(initialDef.url, {
      attribution: initialDef.attribution,
      maxZoom: initialDef.maxZoom
    }).addTo(map);

    activeTileLayerRef.current = tileLayer;

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);


  // Handle Map Clicks to Set Origin, Destination, or Report
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const handleMapClick = async (e) => {
      if (navigationMode) return;
      const point = { lat: e.latlng.lat, lng: e.latlng.lng };

      if (!startCoords) {
        setStartCoords(point);
        const name = await reverseGeocodePoint(point);
        setStartQuery(name ? name.split(',').slice(0, 2).join(',') : `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`);
        playSound('click');
        if (onToast) onToast('Origin pinned on map.', 'info');
      } else if (!endCoords) {
        setEndCoords(point);
        const name = await reverseGeocodePoint(point);
        setEndQuery(name ? name.split(',').slice(0, 2).join(',') : `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`);
        playSound('click');
        if (onToast) onToast('Destination pinned on map.', 'info');
      } else {
        L.popup()
          .setLatLng(e.latlng)
          .setContent(`
            <div style="font-size: 12px; padding: 6px; display: flex; flex-direction: column; gap: 8px;">
              <span style="font-weight: 700; color: #1e293b; font-size: 13px;">Map Coordinates</span>
              <button id="pop-set-start" style="padding: 6px 12px; border-radius: 8px; background: #10b981; color: white; border: none; cursor: pointer; font-weight: 600; font-size: 12px;">Set as Start (A)</button>
              <button id="pop-set-end" style="padding: 6px 12px; border-radius: 8px; background: #6366f1; color: white; border: none; cursor: pointer; font-weight: 600; font-size: 12px;">Set as Destination (B)</button>
              <button id="pop-rep-haz" style="padding: 6px 12px; border-radius: 8px; background: #ef4444; color: white; border: none; cursor: pointer; font-weight: 600; font-size: 12px;">Report Hazard Here ⚠️</button>
            </div>
          `)
          .openOn(map);

        setTimeout(() => {
          document.getElementById('pop-set-start')?.addEventListener('click', async () => {
            map.closePopup();
            setStartCoords(point);
            const name = await reverseGeocodePoint(point);
            setStartQuery(name ? name.split(',').slice(0, 2).join(',') : `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`);
            playSound('click');
          });
          document.getElementById('pop-set-end')?.addEventListener('click', async () => {
            map.closePopup();
            setEndCoords(point);
            const name = await reverseGeocodePoint(point);
            setEndQuery(name ? name.split(',').slice(0, 2).join(',') : `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`);
            playSound('click');
          });
          document.getElementById('pop-rep-haz')?.addEventListener('click', () => {
            map.closePopup();
            onOpenReportWithCoords(point);
            playSound('click');
          });
        }, 50);
      }
    };

    map.on('click', handleMapClick);
    return () => map.off('click', handleMapClick);
  }, [startCoords, endCoords, navigationMode, onOpenReportWithCoords, onToast]);

  // Update Start & Destination Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (startCoords) {
      if (startMarkerRef.current) startMarkerRef.current.remove();
      startMarkerRef.current = L.marker([startCoords.lat, startCoords.lng], {
        icon: createLocationMarker('A', '#10b981'),
        draggable: true
      })
        .addTo(map)
        .bindPopup('<b>Starting Point (A)</b>');

      startMarkerRef.current.on('dragend', async (e) => {
        const pt = e.target.getLatLng();
        setStartCoords({ lat: pt.lat, lng: pt.lng });
        const name = await reverseGeocodePoint(pt);
        if (name) setStartQuery(name.split(',').slice(0, 2).join(','));
      });
    } else if (startMarkerRef.current) {
      startMarkerRef.current.remove();
      startMarkerRef.current = null;
    }

    if (endCoords) {
      if (endMarkerRef.current) endMarkerRef.current.remove();
      endMarkerRef.current = L.marker([endCoords.lat, endCoords.lng], {
        icon: createLocationMarker('B', '#6366f1'),
        draggable: true
      })
        .addTo(map)
        .bindPopup('<b>Destination (B)</b>');

      endMarkerRef.current.on('dragend', async (e) => {
        const pt = e.target.getLatLng();
        setEndCoords({ lat: pt.lat, lng: pt.lng });
        const name = await reverseGeocodePoint(pt);
        if (name) setEndQuery(name.split(',').slice(0, 2).join(','));
      });
    } else if (endMarkerRef.current) {
      endMarkerRef.current.remove();
      endMarkerRef.current = null;
    }
  }, [startCoords, endCoords]);

  // Render Hazards and Danger Zones
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    hazardLayersRef.current.forEach((layer) => layer.remove());
    hazardLayersRef.current = [];

    activeHazardsList.forEach((h) => {
      if (!h.coordinates || !Number.isFinite(h.coordinates.lat) || !Number.isFinite(h.coordinates.lng)) return;

      const marker = L.marker([h.coordinates.lat, h.coordinates.lng], {
        icon: createHazardMarker(h.category, h.severity)
      }).addTo(map);

      let circle = null;
      if (showAvoidanceZones) {
        circle = L.circle([h.coordinates.lat, h.coordinates.lng], {
          radius: 100,
          color: getHazardColor(h.category, h.severity),
          fillColor: getHazardColor(h.category, h.severity),
          fillOpacity: 0.16,
          weight: 1.5,
          dashArray: '5, 5'
        }).addTo(map);
      }

      marker.bindPopup(`
        <div style="font-size: 12px; min-width: 200px; padding: 2px;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
            <span style="font-weight: 800; font-size: 13px; color: #0f172a;">${h.title}</span>
            <span style="background: ${getHazardColor(h.category, h.severity)}22; color: ${getHazardColor(h.category, h.severity)}; padding: 2px 6px; border-radius: 6px; font-weight: 700; font-size: 10px;">${h.severity}</span>
          </div>
          <div style="color: #64748b; font-size: 11px; margin-bottom: 6px;">${h.category} • ${h.location}</div>
          ${h.imageUrl ? `<img src="${h.imageUrl}" style="width: 100%; height: 110px; object-fit: cover; border-radius: 10px; margin-bottom: 6px;" />` : ''}
          ${h.description ? `<p style="color: #475569; font-size: 11px; line-height: 1.4; margin-bottom: 6px;">${h.description}</p>` : ''}
          <div style="font-size: 10px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 4px;">Obstacle (${h.confirmations || 1} verified)</div>
        </div>
      `);

      hazardLayersRef.current.push(marker);
      if (circle) hazardLayersRef.current.push(circle);
    });
  }, [activeHazardsList, showAvoidanceZones]);

  // Render Routes with Sexy Neon Drop Shadows
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    routeLayersRef.current.forEach((layer) => layer.remove());
    routeLayersRef.current = [];

    if (!routeResults || routeResults.length === 0) return;

    routeResults.forEach((route, idx) => {
      const isSelected = idx === selectedRouteIndex;
      const isDetour = route.hazardDetour === true;
      const coords = (route.geometry?.coordinates || []).map(([lng, lat]) => [lat, lng]);
      if (coords.length === 0) return;

      const mainColor = isSelected ? (isDetour ? '#10b981' : '#3b82f6') : '#64748b';
      const glowColor = isSelected ? (isDetour ? '#10b981' : '#3b82f6') : '#94a3b8';
      const glowFilterClass = isSelected ? (isDetour ? 'leaflet-route-detour-glow' : 'leaflet-route-glow') : '';

      // Glowing Halo backdrop line
      const glowLine = L.polyline(coords, {
        color: glowColor,
        weight: isSelected ? 14 : 7,
        opacity: isSelected ? 0.45 : 0.15,
        lineCap: 'round',
        lineJoin: 'round',
        className: glowFilterClass
      }).addTo(map);

      // Core Polyline
      const coreLine = L.polyline(coords, {
        color: mainColor,
        weight: isSelected ? 6 : 4,
        opacity: isSelected ? 0.98 : 0.65,
        lineCap: 'round',
        lineJoin: 'round',
        className: glowFilterClass
      }).addTo(map);

      const handlePolylineClick = (e) => {
        setSelectedRouteIndex(idx);
        playSound('click');
        if (e.latlng && !navigationMode) {
          L.popup()
            .setLatLng(e.latlng)
            .setContent(`
              <div style="font-family: system-ui, sans-serif; padding: 4px; text-align: center;">
                <div style="font-size: 11px; font-weight: 700; color: #0f172a; margin-bottom: 6px;">
                  Active Route Corridor
                </div>
                <button id="pop-rep-haz-line-${idx}" style="padding: 7px 12px; border-radius: 8px; background: #ef4444; color: white; border: none; cursor: pointer; font-weight: 700; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;">
                  Report Obstacle On Route ⚠️
                </button>
              </div>
            `)
            .openOn(map);

          setTimeout(() => {
            document.getElementById(`pop-rep-haz-line-${idx}`)?.addEventListener('click', () => {
              map.closePopup();
              onOpenReportWithCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
              playSound('click');
            });
          }, 50);
        }
      };
      coreLine.on('click', handlePolylineClick);
      glowLine.on('click', handlePolylineClick);
      routeLayersRef.current.push(glowLine, coreLine);

      // Animated Dash Flow for Active Route
      if (isSelected) {
        const flowLine = L.polyline(coords, {
          color: '#ffffff',
          weight: 2.5,
          opacity: 0.9,
          dashArray: '10, 18',
          className: 'route-animated-flow'
        }).addTo(map);
        routeLayersRef.current.push(flowLine);
      }
    });

    // Render Proposed Alternate Detour Preview if active
    if (previewAlternateRoute?.geometry?.coordinates?.length) {
      const altCoords = previewAlternateRoute.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      const altGlow = L.polyline(altCoords, {
        color: '#06b6d4',
        weight: 12,
        opacity: 0.45,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);

      const altCore = L.polyline(altCoords, {
        color: '#10b981',
        weight: 5,
        opacity: 0.95,
        dashArray: '8, 12',
        className: 'route-animated-flow'
      }).addTo(map);

      routeLayersRef.current.push(altGlow, altCore);
    }

    const selected = routeResults[selectedRouteIndex];
    if (selected?.geometry?.coordinates?.length && !navigationMode) {
      const latLngs = selected.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      map.fitBounds(L.latLngBounds(latLngs), { padding: [80, 80] });
    }
  }, [routeResults, selectedRouteIndex, navigationMode, previewAlternateRoute]);

  // Turn-by-Turn Drive Simulation along Route
  useEffect(() => {
    let timer = null;
    const selected = routeResults[selectedRouteIndex];
    const coords = (selected?.geometry?.coordinates || []).map(([lng, lat]) => [lat, lng]);

    if (simulationRunning && coords.length > 0) {
      timer = setInterval(() => {
        setSimulationIndex((prev) => {
          const next = prev + 1;
          if (next >= coords.length) {
            setSimulationRunning(false);
            speakGuidance('You have safely arrived at your destination.');
            playSound('success');
            if (onToast) onToast('You have arrived at your destination!', 'success');
            return 0;
          }

          const currentPoint = coords[next];
          if (vehicleMarkerRef.current) {
            vehicleMarkerRef.current.setLatLng(currentPoint);
          } else if (mapInstanceRef.current) {
            vehicleMarkerRef.current = L.marker(currentPoint, {
              icon: createVehicleMarker(),
              zIndexOffset: 1000
            }).addTo(mapInstanceRef.current);
          }

          setSimulatedSpeed(Math.floor(46 + Math.random() * 8));

          // Proximity hazard warning check
          activeHazardsList.forEach((hz) => {
            if (hz.coordinates) {
              const d = distanceBetweenPointsMeters(
                { lat: currentPoint[0], lng: currentPoint[1] },
                { lat: hz.coordinates.lat, lng: hz.coordinates.lng }
              );
              if (d <= 250 && d > 200 && next % 6 === 0) {
                speakGuidance(`Attention: Bypassing ${hz.category} hazard safely on your detour corridor.`);
                playSound('warning');
              }
            }
          });

          mapInstanceRef.current?.panTo(currentPoint, { animate: true, duration: 0.4 });
          return next;
        });
      }, 500);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [simulationRunning, routeResults, selectedRouteIndex, activeHazardsList, speakGuidance, onToast]);

  const handleStopNavigation = () => {
    setNavigationMode(false);
    setSimulationRunning(false);
    setSimulationIndex(0);
    if (vehicleMarkerRef.current) {
      vehicleMarkerRef.current.remove();
      vehicleMarkerRef.current = null;
    }
  };

  const focusOnPoint = useCallback((point) => {
    const map = mapInstanceRef.current;
    if (!map || !point) return;
    map.flyTo([point.lat, point.lng], 16, { duration: 1.2 });
  }, []);

  useEffect(() => {
    window.__naviguard_focus = focusOnPoint;
    return () => {
      delete window.__naviguard_focus;
    };
  }, [focusOnPoint]);

  const activeRoute = routeResults[selectedRouteIndex];

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950">
      {/* Fullscreen Map Canvas */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Atmospheric Weather Canvas (Rain, Lightning Storm, Snow, Fog) */}
      <WeatherCanvasOverlay
        weatherCode={weatherCode}
        manualWeatherMode={manualWeatherMode}
        soundEnabled={rainSoundEnabled}
      />

      {/* Windshield Glass Droplets Effect */}
      {windshieldGlass && <div className="windshield-glass-overlay" />}

      {/* Map Atmospheric Cyber Vignette */}
      <div className="map-atmospheric-vignette" />

      {/* TOP HUD: Turn-by-Turn Navigation Mode Bar */}
      {navigationMode && activeRoute && (
        <div className="absolute top-18 left-1/2 -translate-x-1/2 z-30 w-full max-w-2xl px-4 animate-in slide-in-from-top duration-300">
          <div className="rounded-3xl cyber-glass text-white p-4 flex items-center justify-between gap-4 shadow-2xl">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/30 shrink-0">
                <Navigation className="w-6 h-6 animate-pulse" />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase font-black tracking-wider text-emerald-400 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Safe Corridor Active</span>
                  </span>
                  <span className="text-slate-500">•</span>
                  <span className="text-xs text-slate-300">
                    Step {simulationIndex + 1} of {activeRoute.geometry?.coordinates?.length || 1}
                  </span>
                </div>
                <h3 className="font-extrabold text-base leading-snug">
                  {formatDuration(activeRoute.duration)} • {formatDistance(activeRoute.distance)}
                </h3>
              </div>
            </div>

            {/* Live Speedometer & Controls */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-black/40 border border-white/10">
                <div className="text-right">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Speed</span>
                  <span className="font-mono font-black text-sm text-emerald-400">{simulatedSpeed} <span className="text-[10px] text-slate-400">km/h</span></span>
                </div>
                <div className="w-6 h-6 rounded-full border-2 border-rose-500 flex items-center justify-center font-bold text-[9px] text-slate-200">
                  50
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setVoiceEnabled(!voiceEnabled);
                  playSound('click');
                  if (onToast) onToast(voiceEnabled ? 'Voice guidance muted.' : 'Voice guidance enabled.', 'info');
                }}
                className={`p-2.5 rounded-2xl border transition-all ${
                  voiceEnabled
                    ? 'border-blue-500/50 bg-blue-500/20 text-blue-400'
                    : 'border-white/10 bg-white/5 text-slate-400'
                }`}
                title={voiceEnabled ? 'Mute voice guidance' : 'Enable voice guidance'}
              >
                {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={() => {
                  setSimulationRunning(!simulationRunning);
                  playSound('click');
                }}
                className={`p-2.5 px-3.5 rounded-2xl font-black text-xs flex items-center gap-1.5 transition-all ${
                  simulationRunning
                    ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                    : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-md shadow-emerald-500/25'
                }`}
              >
                {simulationRunning ? (
                  <>
                    <Pause className="w-4 h-4" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    <span>Sim Drive</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleStopNavigation}
                className="p-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors"
                title="Exit navigation"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM COCKPIT TELEMETRY BAR */}
      <div className="absolute bottom-5 right-5 z-20 flex items-center gap-3">
        
        {/* NavAI Copilot Quick Launcher Pill */}
        <button
          type="button"
          onClick={() => {
            if (onOpenNavAI) onOpenNavAI();
            playSound('ai');
          }}
          className="flex items-center gap-2 px-3.5 py-2 rounded-2xl cyber-glass border border-cyan-500/40 hover:border-cyan-400 bg-slate-950/70 hover:bg-cyan-950/40 text-xs font-black text-cyan-300 shadow-xl transition-all active:scale-95 group cursor-pointer"
          title="Summon NavAI Real-Time Route Copilot"
        >
          <div className="relative">
            <Bot className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          </div>
          <span className="hidden sm:inline tracking-tight">NavAI</span>
          <span className="px-1.5 py-0.2 rounded text-[8px] bg-cyan-500/20 text-cyan-300 font-mono">COPILOT</span>
        </button>

        {/* Telemetry Capsule: Time, Bearing (Isolated Subcomponent) */}
        <TelemetryCapsule mapInstanceRef={mapInstanceRef} />



        {/* Zoom & Recenter Controls */}
        <div className="flex rounded-2xl cyber-glass overflow-hidden p-1 gap-1 shadow-xl">
          <button
            type="button"
            onClick={() => {
              mapInstanceRef.current?.zoomIn();
              playSound('click');
            }}
            className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              mapInstanceRef.current?.zoomOut();
              playSound('click');
            }}
            className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
