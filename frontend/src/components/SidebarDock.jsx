import React, { useState, useMemo } from 'react';
import {
  Navigation,
  AlertTriangle,
  CloudRain,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  LocateFixed,
  Route as RouteIcon,
  ShieldCheck,
  Loader2,
  X,
  MapPin,
  Car,
  ThumbsUp,
  Trash2,
  Search,
  CheckCircle2,
  PhoneCall,
  Copy,
  Check,
  Hospital,
  Shield,
  Flame,
  Fuel,
  Volume2,
  VolumeX,
  Sparkles,
  Wind,
  Droplets,
  Sun,
  CloudLightning,
  AlertOctagon,
  Download,
  Bot
} from 'lucide-react';
import { useHazards } from '../context/HazardContext';
import {
  formatDuration,
  formatDistance,
  getHazardColor,
  getHazardStatus,
  distanceBetweenPointsMeters
} from '../utils/geo';
import { playSound } from '../utils/audio';
import { SidebarNavAIPanel } from './SidebarNavAIPanel';

const PRESET_DESTINATIONS = [
  { label: 'Airport', query: 'Airport', icon: '✈️' },
  { label: 'City Center', query: 'City Center', icon: '🏛️' },
  { label: 'Central Station', query: 'Railway Station', icon: '🚆' },
  { label: 'Hospital', query: 'Hospital', icon: '🏥' },
  { label: 'Downtown Mall', query: 'Shopping Mall', icon: '🛍️' }
];

const HAZARD_CATEGORIES = ['All', 'Flooding', 'Road Damage', 'Debris', 'Accident', 'Construction', 'Other'];

const SAFE_HAVEN_TYPES = [
  { id: 'hospital', label: 'Hospitals / ER', icon: Hospital, amenity: 'hospital' },
  { id: 'police', label: 'Police Stations', icon: Shield, amenity: 'police' },
  { id: 'fire', label: 'Fire Stations', icon: Flame, amenity: 'fire_station' },
  { id: 'fuel', label: 'Gas Stations', icon: Fuel, amenity: 'fuel' }
];

export function SidebarDock({
  activeTab,
  setActiveTab,
  isCollapsed,
  setIsCollapsed,
  // Routing props
  startQuery,
  setStartQuery,
  endQuery,
  setEndQuery,
  startCoords,
  endCoords,
  onUseGps,
  locatingGps,
  onSwap,
  onSelectPreset,
  startSuggestions,
  endSuggestions,
  onSelectSuggestion,
  onResolveRoute,
  routing,
  routingError,
  routeResults,
  selectedRouteIndex,
  setSelectedRouteIndex,
  onClearRoute,
  onStartNavigation,
  onOpenSafetyAudit,
  // Hazard Feed props
  onFocusHazard,
  onOpenReport,
  // Weather props
  weatherData,
  weatherMode,
  setWeatherMode,
  rainSoundEnabled,
  setRainSoundEnabled,
  windshieldGlass,
  setWindshieldGlass,
  // Emergency Haven props
  userCoords,
  emergencyPlaces,
  emergencyLoading,
  selectedHavenType,
  setSelectedHavenType,
  onSelectEmergencyDestination,
  onToast,
  onOpenNavAIModal
}) {
  const { hazards, stats, deleteHazard, confirmHazard } = useHazards();
  const [hazardSearch, setHazardSearch] = useState('');
  const [hazardCategory, setHazardCategory] = useState('All');
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [copiedGps, setCopiedGps] = useState(false);

  // Memoized Filtered Hazards (Prevents continuous recalculations on render)
  const filteredHazards = useMemo(() => {
    const q = hazardSearch.trim().toLowerCase();
    return hazards.filter((h) => {
      const matchesCat = hazardCategory === 'All' || h.category === hazardCategory;
      if (!matchesCat) return false;
      if (!q) return true;
      return (
        h.title?.toLowerCase().includes(q) ||
        h.location?.toLowerCase().includes(q)
      );
    });
  }, [hazards, hazardCategory, hazardSearch]);

  const handleDeleteHazard = async (id, title) => {
    if (!window.confirm(`Mark obstacle "${title}" as cleared?`)) return;
    try {
      await deleteHazard(id);
      playSound('success');
      if (onToast) onToast(`Resolved: "${title}"`, 'success');
    } catch (err) {
      if (onToast) onToast(err.message || 'Could not delete hazard', 'error');
    }
  };

  const handleCopyGps = () => {
    if (!userCoords) return;
    navigator.clipboard.writeText(`${userCoords.lat.toFixed(6)}, ${userCoords.lng.toFixed(6)}`);
    setCopiedGps(true);
    playSound('click');
    setTimeout(() => setCopiedGps(false), 2000);
    if (onToast) onToast('GPS coordinates copied for emergency dispatchers.', 'info');
  };

  const activeRoute = routeResults[selectedRouteIndex];

  return (
    <>
      <aside
        className={`fixed top-20 left-4 z-20 transition-all duration-300 ease-out flex ${
          isCollapsed ? 'w-14' : 'w-[22rem] sm:w-[24.5rem]'
        }`}
      >
        {/* Main Glass Card */}
        <div className="w-full h-[calc(100vh-6.5rem)] rounded-3xl cyber-glass flex flex-col overflow-hidden text-slate-100 shadow-2xl">
          {/* Top Tab Bar */}
          <div className="p-2 border-b border-white/10 flex items-center justify-between gap-1 bg-white/[0.02]">
            {!isCollapsed ? (
              <div className="flex items-center gap-1 flex-1 overflow-x-auto no-scrollbar">
                {[
                  { id: 'routes', label: 'Route', icon: Navigation },
                  { id: 'navai', label: 'NavAI', icon: Bot, badge: 'AI' },
                  { id: 'hazards', label: 'Radar', icon: AlertTriangle, badge: stats.active },
                  { id: 'weather', label: 'Atmosphere', icon: CloudRain },
                  { id: 'emergency', label: 'Safe Haven', icon: ShieldAlert }
                ].map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(tab.id);
                        playSound('click');
                      }}
                      className={`relative flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-bold transition-all shrink-0 ${
                        isActive
                          ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/25'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{tab.label}</span>
                      {tab.badge > 0 && (
                        <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] flex items-center justify-center font-extrabold animate-pulse">
                          {tab.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-2 w-full">
                {[
                  { id: 'routes', icon: Navigation },
                  { id: 'navai', icon: Bot, badge: 'AI' },
                  { id: 'hazards', icon: AlertTriangle, badge: stats.active },
                  { id: 'weather', icon: CloudRain },
                  { id: 'emergency', icon: ShieldAlert }
                ].map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(tab.id);
                        setIsCollapsed(false);
                        playSound('click');
                      }}
                      className={`relative p-2.5 rounded-2xl transition-all ${
                        isActive
                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                          : 'text-slate-400 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {tab.badge > 0 && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] flex items-center justify-center font-bold">
                          {tab.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Collapse / Expand Button */}
            <button
              type="button"
              onClick={() => {
                setIsCollapsed(!isCollapsed);
                playSound('click');
              }}
              className="p-2 rounded-2xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
              title={isCollapsed ? 'Expand panel' : 'Collapse panel'}
            >
              {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>

          {/* Collapsed State Icon Bar */}
          {isCollapsed ? (
            <div className="flex-1 flex flex-col items-center justify-end pb-4 text-[10px] text-slate-500 font-mono">
              <span style={{ writingMode: 'vertical-rl' }}>NAVIPRO</span>
            </div>
          ) : (
            /* Expanded Tab Body */
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* TAB 1: ROUTES & DETOUR NAVIGATION */}
              {activeTab === 'routes' && (
                <div className="space-y-3.5 animate-in fade-in duration-200">
                  <form onSubmit={onResolveRoute} className="space-y-3">
                    {/* Origin Input */}
                    <div className="relative group">
                      <div className="relative flex items-center">
                        <span className="w-3 h-3 rounded-full bg-emerald-500 absolute left-3 shrink-0 ring-4 ring-emerald-500/20 shadow-xs" />
                        <input
                          type="text"
                          value={startQuery}
                          onChange={(e) => setStartQuery(e.target.value)}
                          placeholder="Origin: address, landmark or map click..."
                          className="w-full pl-9 pr-9 py-2.5 text-xs font-semibold rounded-2xl border border-white/10 bg-black/20 dark:bg-slate-900/40 text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/80 transition-all shadow-inner"
                        />
                        <button
                          type="button"
                          onClick={onUseGps}
                          disabled={locatingGps}
                          title="Use current GPS location"
                          className="absolute right-2.5 p-1 rounded-xl text-slate-400 hover:text-emerald-400 transition-colors"
                        >
                          {locatingGps ? (
                            <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                          ) : (
                            <LocateFixed className="w-4 h-4" />
                          )}
                        </button>
                      </div>

                      {/* Origin Suggestions Dropdown */}
                      {startSuggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 z-30 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden text-xs">
                          {startSuggestions.map((sug, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => onSelectSuggestion('start', sug)}
                              className="w-full text-left px-3 py-2.5 hover:bg-slate-800 flex items-center gap-2 border-b border-slate-800 last:border-0"
                            >
                              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="truncate">{sug.display_name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Swap Origin / Destination */}
                    <div className="flex items-center justify-between px-2">
                      <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                      <button
                        type="button"
                        onClick={onSwap}
                        className="mx-2 p-1.5 rounded-full border border-white/10 bg-white/5 hover:bg-white/15 text-slate-400 hover:text-blue-400 transition-all active:scale-90"
                        title="Swap Origin and Destination"
                      >
                        <ArrowUpDown className="w-3.5 h-3.5" />
                      </button>
                      <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                    </div>

                    {/* Destination Input */}
                    <div className="relative group">
                      <div className="relative flex items-center">
                        <span className="w-3 h-3 rounded-full bg-indigo-500 absolute left-3 shrink-0 ring-4 ring-indigo-500/20 shadow-xs" />
                        <input
                          type="text"
                          value={endQuery}
                          onChange={(e) => setEndQuery(e.target.value)}
                          placeholder="Destination: enter place..."
                          className="w-full pl-9 pr-8 py-2.5 text-xs font-semibold rounded-2xl border border-white/10 bg-black/20 dark:bg-slate-900/40 text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/80 transition-all shadow-inner"
                        />
                        {endQuery && (
                          <button
                            type="button"
                            onClick={() => setEndQuery('')}
                            className="absolute right-2.5 text-slate-400 hover:text-slate-200"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {/* Destination Suggestions Dropdown */}
                      {endSuggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 z-30 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden text-xs">
                          {endSuggestions.map((sug, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => onSelectSuggestion('end', sug)}
                              className="w-full text-left px-3 py-2.5 hover:bg-slate-800 flex items-center gap-2 border-b border-slate-800 last:border-0"
                            >
                              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="truncate">{sug.display_name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Quick Preset Destination Chips */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] no-scrollbar">
                      {PRESET_DESTINATIONS.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => onSelectPreset(preset)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl border border-white/10 bg-white/5 hover:bg-white/15 text-slate-300 hover:text-blue-400 transition-all shrink-0 font-medium"
                        >
                          <span>{preset.icon}</span>
                          <span>{preset.label}</span>
                        </button>
                      ))}
                    </div>

                    {/* Compute Route Button */}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="submit"
                        disabled={routing || (!startQuery && !startCoords)}
                        className={`flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-500 hover:from-blue-500 hover:to-indigo-500 active:scale-98 text-white text-xs font-black shadow-lg shadow-blue-500/30 disabled:opacity-50 transition-all ${
                          routing ? 'shimmer-bg' : ''
                        }`}
                      >
                        {routing ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Routing with Dijkstra...</span>
                          </>
                        ) : (
                          <>
                            <RouteIcon className="w-4 h-4" />
                            <span>Compute Safe Route</span>
                          </>
                        )}
                      </button>

                      {(routeResults.length > 0 || startCoords || endCoords) && (
                        <button
                          type="button"
                          onClick={onClearRoute}
                          className="p-3 rounded-2xl border border-white/10 bg-white/5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          title="Clear route"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </form>

                  {/* Routing Error Notice */}
                  {routingError && (
                    <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2 animate-in fade-in">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                      <span>{routingError}</span>
                    </div>
                  )}

                  {/* Route Alternatives Selection Cards */}
                  {routeResults.length > 0 && (
                    <div className="pt-2 border-t border-white/10 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                          Route Options ({routeResults.length})
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenSafetyAudit(activeRoute, startQuery, endQuery)}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 hover:underline"
                            title="Open safety audit & download GPX"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>Audit & GPX</span>
                          </button>
                          <span className="text-slate-600">•</span>
                          <button
                            type="button"
                            onClick={() => {
                              if (onOpenNavAIModal) onOpenNavAIModal();
                              else setActiveTab('navai');
                              playSound('ai');
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-cyan-400 hover:underline"
                            title="Consult NavAI route copilot"
                          >
                            <Bot className="w-3.5 h-3.5" />
                            <span>NavAI</span>
                          </button>
                          <span className="text-slate-600">•</span>
                          <button
                            type="button"
                            onClick={onStartNavigation}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-400 hover:underline"
                          >
                            <Car className="w-3.5 h-3.5" />
                            <span>Navigate</span>
                          </button>
                        </div>
                      </div>

                      {routeResults.map((route, idx) => {
                        const isSelected = idx === selectedRouteIndex;
                        const isDetour = route.hazardDetour === true;

                        return (
                          <div
                            key={idx}
                            onClick={() => {
                              setSelectedRouteIndex(idx);
                              playSound('click');
                            }}
                            className={`p-3 rounded-2xl border text-xs cursor-pointer transition-all flex items-center justify-between gap-3 ${
                              isSelected
                                ? 'border-blue-500 bg-blue-500/15 shadow-md shadow-blue-500/20 ring-1 ring-blue-500/40'
                                : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.08]'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <div
                                className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold ${
                                  isDetour
                                    ? 'bg-emerald-500/20 text-emerald-400'
                                    : 'bg-blue-500/20 text-blue-400'
                                }`}
                              >
                                {isDetour ? <ShieldCheck className="w-5 h-5" /> : <Navigation className="w-5 h-5" />}
                              </div>

                              <div>
                                <div className="flex items-center gap-2 font-extrabold text-white text-sm">
                                  <span>{formatDuration(route.duration)}</span>
                                  <span className="text-slate-600">•</span>
                                  <span className="text-slate-400 text-xs font-semibold">
                                    {formatDistance(route.distance)}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-400">
                                  {isDetour ? 'Safe Detour avoiding hazards' : 'Fastest direct corridor'}
                                </p>
                              </div>
                            </div>

                            <span
                              className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                isDetour
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                  : 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                              }`}
                            >
                              {isDetour ? 'SAFE DETOUR' : 'FASTEST'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: LIVE HAZARDS RADAR FEED */}
              {activeTab === 'hazards' && (
                <div className="space-y-3.5 animate-in fade-in duration-200">
                  {/* Pulse Stats Bar */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2.5 rounded-2xl bg-white/[0.04] border border-white/5 text-center">
                      <div className="text-base font-black text-rose-400">{stats.active}</div>
                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Active</div>
                    </div>
                    <div className="p-2.5 rounded-2xl bg-white/[0.04] border border-white/5 text-center">
                      <div className="text-base font-black text-blue-400">{stats.scheduled}</div>
                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Scheduled</div>
                    </div>
                    <div className="p-2.5 rounded-2xl bg-white/[0.04] border border-white/5 text-center">
                      <div className="text-base font-black text-emerald-400">{stats.expired}</div>
                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Resolved</div>
                    </div>
                  </div>

                  {/* Search and Category Filter */}
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
                      <input
                        type="text"
                        value={hazardSearch}
                        onChange={(e) => setHazardSearch(e.target.value)}
                        placeholder="Search street, obstacle, or city..."
                        className="w-full pl-9 pr-3 py-2 text-xs font-medium rounded-xl border border-white/10 bg-black/20 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
                      {HAZARD_CATEGORIES.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => {
                            setHazardCategory(cat);
                            playSound('click');
                          }}
                          className={`px-2.5 py-1 rounded-xl shrink-0 font-semibold text-[11px] transition-all ${
                            hazardCategory === cat
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'bg-white/5 text-slate-400 hover:bg-white/10'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Hazard Items */}
                  <div className="space-y-2.5 max-h-[calc(100vh-18rem)] overflow-y-auto pr-1">
                    {filteredHazards.length === 0 ? (
                      <div className="py-16 text-center text-xs text-slate-400">
                        <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2 opacity-80" />
                        <span className="font-bold block text-sm text-slate-200">No active hazards reported</span>
                        <span>Corridors are clear in this category!</span>
                      </div>
                    ) : (
                      filteredHazards.map((h) => {
                        const status = getHazardStatus(h);
                        const color = getHazardColor(h.category, h.severity);

                        return (
                          <div
                            key={h.id}
                            className="p-3.5 rounded-2xl border border-white/10 bg-white/[0.03] hover:border-blue-500/40 transition-all shadow-xs space-y-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/10 text-slate-200">
                                    {h.category}
                                  </span>
                                  <span
                                    className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                                    style={{
                                      backgroundColor: `${color}25`,
                                      color: color,
                                      border: `1px solid ${color}40`
                                    }}
                                  >
                                    {h.severity}
                                  </span>
                                  {status === 'scheduled' && (
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                      Scheduled
                                    </span>
                                  )}
                                </div>

                                <h4 className="font-bold text-slate-100 text-xs leading-snug truncate">
                                  {h.title}
                                </h4>
                                <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                                  <MapPin className="w-3 h-3 shrink-0 text-slate-400" />
                                  <span>{h.location}</span>
                                </p>
                              </div>

                              {h.imageUrl && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedPhoto(h.imageUrl)}
                                  className="w-14 h-14 rounded-xl overflow-hidden border border-white/15 shrink-0 hover:ring-2 hover:ring-blue-500 transition-all"
                                >
                                  <img src={h.imageUrl} alt={h.title} className="w-full h-full object-cover" />
                                </button>
                              )}
                            </div>

                            {/* Community Verification & Action Row */}
                            <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[11px]">
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await confirmHazard(h.id);
                                    playSound('click');
                                    if (onToast) onToast(`Confirmed active: ${h.title}`, 'info');
                                  } catch (err) {
                                    if (onToast) onToast(err.message, 'error');
                                  }
                                }}
                                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-xl bg-white/5 hover:bg-emerald-500/20 text-slate-300 hover:text-emerald-400 transition-all"
                                title="Confirm this hazard still exists"
                              >
                                <ThumbsUp className="w-3 h-3 text-emerald-400" />
                                <span className="font-bold">Still there ({h.confirmations || 1})</span>
                              </button>

                              <div className="flex items-center gap-1">
                                {h.coordinates && (
                                  <button
                                    type="button"
                                    onClick={() => onFocusHazard(h.coordinates)}
                                    className="px-2 py-1 text-blue-400 hover:underline font-bold"
                                  >
                                    Map
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteHazard(h.id, h.title)}
                                  className="p-1 text-slate-400 hover:text-rose-400 transition-colors"
                                  title="Mark resolved"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: ATMOSPHERE & WEATHER */}
              {activeTab === 'weather' && (
                <div className="space-y-3.5 animate-in fade-in duration-200">
                  {weatherData ? (
                    <div className="p-4 rounded-3xl bg-gradient-to-br from-blue-600/20 via-indigo-600/10 to-transparent border border-blue-500/30 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-2xl font-black text-white">
                            {Math.round(weatherData.temperature)}°C
                          </div>
                          <span className="text-xs text-blue-300 font-bold">
                            Wind: {weatherData.windspeed} km/h • WMO #{weatherData.weathercode}
                          </span>
                        </div>
                        <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center text-blue-400">
                          <CloudRain className="w-7 h-7" />
                        </div>
                      </div>

                      <div className="p-3 rounded-2xl bg-black/30 border border-white/10 text-xs space-y-1">
                        <span className="font-bold text-white block">Road Traction Index</span>
                        <p className="text-[11px] text-slate-300">
                          {weatherData.weathercode >= 61
                            ? 'Wet asphalt & puddle accumulation risk. Safe braking distance recommended.'
                            : 'Good pavement adhesion and standard visibility.'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-center text-xs text-slate-400">
                      Loading local telemetry data...
                    </div>
                  )}

                  {/* Atmosphere Simulation Selector */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                      Map Atmosphere Simulation
                    </span>

                    <div className="grid grid-cols-3 gap-1.5 text-xs font-bold">
                      {[
                        { id: 'auto', label: 'Auto (Live)', icon: '🔄' },
                        { id: 'rain', label: 'Rain 🌧️', icon: '🌧️' },
                        { id: 'storm', label: 'Storm ⚡', icon: '⚡' },
                        { id: 'snow', label: 'Snow ❄️', icon: '❄️' },
                        { id: 'fog', label: 'Fog 🌫️', icon: '🌫️' },
                        { id: 'clear', label: 'Clear ☀️', icon: '☀️' }
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setWeatherMode(opt.id);
                            playSound('click');
                          }}
                          className={`py-2 px-2 rounded-2xl border text-center transition-all ${
                            weatherMode === opt.id
                              ? 'border-blue-500 bg-blue-500/25 text-white font-black shadow-md shadow-blue-500/25'
                              : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Audio & Glass Toggles */}
                  <div className="space-y-2 pt-2 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => {
                        setRainSoundEnabled(!rainSoundEnabled);
                        playSound('click');
                      }}
                      className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-all text-xs font-bold ${
                        rainSoundEnabled
                          ? 'border-blue-500/50 bg-blue-500/20 text-blue-300'
                          : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {rainSoundEnabled ? <Volume2 className="w-4 h-4 text-blue-400" /> : <VolumeX className="w-4 h-4" />}
                        <span>Ambient Rainfall Audio</span>
                      </div>
                      <span className="text-[10px]">{rainSoundEnabled ? 'Active' : 'Off'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setWindshieldGlass(!windshieldGlass);
                        playSound('click');
                      }}
                      className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-all text-xs font-bold ${
                        windshieldGlass
                          ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-300'
                          : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-cyan-400" />
                        <span>Windshield Droplets HUD</span>
                      </div>
                      <span className="text-[10px]">{windshieldGlass ? 'Active' : 'Off'}</span>
                    </button>
                  </div>
                </div>
              )}


              {/* TAB 5: NAVAI ROUTE COPILOT */}
              {activeTab === 'navai' && (
                <SidebarNavAIPanel
                  route={activeRoute}
                  startQuery={startQuery}
                  endQuery={endQuery}
                  weatherData={weatherData}
                  activeHazardsList={hazards}
                  onStartNavigation={onStartNavigation}
                  onOpenSafetyAudit={onOpenSafetyAudit}
                  onPopOutModal={onOpenNavAIModal}
                />
              )}

              {/* TAB 4: EMERGENCY SAFE HAVENS */}
              {activeTab === 'emergency' && (
                <div className="space-y-3.5 animate-in fade-in duration-200">
                  {/* GPS Locator Banner */}
                  {userCoords && (
                    <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-[9px] uppercase font-black text-rose-400 block">
                          Your Emergency GPS Fix
                        </span>
                        <span className="font-mono font-bold text-slate-200">
                          {userCoords.lat.toFixed(5)}, {userCoords.lng.toFixed(5)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyGps}
                        className="px-2.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] flex items-center gap-1 shadow-xs transition-all"
                      >
                        {copiedGps ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedGps ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  )}

                  {/* Safe Haven Filter Selector */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {SAFE_HAVEN_TYPES.map((t) => {
                      const Icon = t.icon;
                      const isSel = selectedHavenType === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setSelectedHavenType(t.id);
                            playSound('click');
                          }}
                          className={`flex flex-col items-center justify-center p-2 rounded-2xl border text-center transition-all ${
                            isSel
                              ? 'border-rose-500 bg-rose-500/20 text-rose-300 font-bold shadow-xs'
                              : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10'
                          }`}
                        >
                          <Icon className="w-4 h-4 mb-1" />
                          <span className="text-[9px] truncate">{t.label.split('/')[0]}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Nearest Emergency Facilities */}
                  <div className="space-y-2 max-h-[calc(100vh-22rem)] overflow-y-auto pr-1">
                    {emergencyLoading ? (
                      <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                        <Loader2 className="w-6 h-6 animate-spin text-rose-500" />
                        <span>Locating nearest emergency facilities...</span>
                      </div>
                    ) : emergencyPlaces.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-400">
                        No facilities found in immediate radius.
                      </div>
                    ) : (
                      emergencyPlaces.map((place) => (
                        <div
                          key={place.id}
                          className="p-3 rounded-2xl border border-white/10 bg-white/[0.03] hover:border-rose-500/40 transition-all flex items-center justify-between gap-2"
                        >
                          <div className="flex-1 min-w-0">
                            <h5 className="font-bold text-xs text-slate-200 truncate">
                              {place.name}
                            </h5>
                            <p className="text-[10px] text-slate-400 truncate mt-0.5">
                              {place.street} • <span className="text-rose-400 font-bold">{formatDistance(place.distance)}</span>
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              onSelectEmergencyDestination(place);
                              playSound('route');
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-extrabold text-[11px] shadow-sm shadow-rose-600/30 transition-all"
                          >
                            <Navigation className="w-3 h-3" />
                            <span>Route</span>
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Enlarged Photo Modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="relative max-w-2xl max-h-[85vh] rounded-3xl overflow-hidden bg-slate-900 border border-white/10 shadow-2xl">
            <button
              type="button"
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-3 right-3 p-2 bg-black/60 hover:bg-black/90 text-white rounded-full transition-colors z-10"
            >
              <X className="w-5 h-5" />
            </button>
            <img src={selectedPhoto} alt="Hazard photo" className="w-full h-auto max-h-[80vh] object-contain" />
          </div>
        </div>
      )}
    </>
  );
}
