import React, { useState, useEffect } from 'react';
import {
  CloudRain,
  Sun,
  CloudLightning,
  Cloud,
  Eye,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  MapPin,
  RefreshCw,
  Wind,
  Droplets,
  ShieldAlert,
  Volume2,
  VolumeX,
  Sparkles,
  Snowflake
} from 'lucide-react';
import { fetchWeatherForPoint } from '../utils/weather';

const WEATHER_CODES = {
  0: { label: 'Clear Sky', advisory: 'Optimum road grip & dry pavement', risk: 'low', badge: 'DRY ROADS' },
  1: { label: 'Mainly Clear', advisory: 'Clear visibility & dry conditions', risk: 'low', badge: 'OPTIMAL' },
  2: { label: 'Partly Cloudy', advisory: 'Good driving visibility', risk: 'low', badge: 'NORMAL' },
  3: { label: 'Overcast', advisory: 'Normal visibility', risk: 'low', badge: 'NORMAL' },
  45: { label: 'Foggy Conditions', advisory: 'Reduced visibility. Use low-beam fog lights', risk: 'medium', badge: 'FOG ALERT' },
  48: { label: 'Dense Freezing Fog', advisory: 'Hazardous visibility. Risk of black ice', risk: 'high', badge: 'ICE & FOG' },
  51: { label: 'Light Drizzle', advisory: 'Slightly damp pavement. Extend braking distance', risk: 'medium', badge: 'DAMP ROADS' },
  61: { label: 'Rain', advisory: 'Wet asphalt & reduced traction. Moderate your speed', risk: 'medium', badge: 'WET ROADS' },
  63: { label: 'Moderate Rain', advisory: 'Water spray and puddle accumulation risk', risk: 'medium', badge: 'PUDDLING' },
  65: { label: 'Heavy Downpour', advisory: 'High risk of hydroplaning and waterlogged underpasses', risk: 'high', badge: 'HYDROPLANING RISK' },
  71: { label: 'Snowfall', advisory: 'Slippery and packed snow. Traction devices recommended', risk: 'high', badge: 'SNOW HAZARD' },
  80: { label: 'Sudden Showers', advisory: 'Rapid visibility drops possible', risk: 'medium', badge: 'RAIN SQUALL' },
  95: { label: 'Thunderstorm', advisory: 'Severe wind gusts and flash road flooding', risk: 'high', badge: 'STORM WARNING' }
};

export function WeatherAdvisoryCard({
  centerCoords,
  onReportWeatherHazard,
  onWeatherChange,
  weatherMode = 'auto',
  onWeatherModeChange,
  soundEnabled = false,
  onToggleSound
}) {
  const [collapsed, setCollapsed] = useState(true);
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchWeather = async (coords) => {
    if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) return;
    setLoading(true);
    try {
      const currentWeather = await fetchWeatherForPoint(coords);
      setWeather(currentWeather);
      if (onWeatherChange) onWeatherChange(currentWeather);
    } catch (err) {
      console.warn('Weather fetch warning:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (centerCoords) {
      fetchWeather(centerCoords);
    }
  }, [centerCoords?.lat, centerCoords?.lng]);

  if (!weather) return null;

  const info = WEATHER_CODES[weather.weathercode] || {
    label: 'Variable Weather',
    advisory: 'Exercise caution while navigating',
    risk: 'low',
    badge: 'MONITOR'
  };

  const isHighRisk = info.risk === 'high';
  const isMedRisk = info.risk === 'medium';

  return (
    <div className="rounded-3xl backdrop-blur-2xl bg-white/90 dark:bg-slate-900/90 border border-slate-200/90 dark:border-slate-800 shadow-[0_20px_50px_rgba(0,0,0,0.25)] overflow-hidden transition-all text-xs">
      {/* Mini Bar Header */}
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
            {isHighRisk ? (
              <CloudLightning className="w-4 h-4 text-rose-500 animate-pulse" />
            ) : isMedRisk ? (
              <CloudRain className="w-4 h-4 text-blue-500 animate-bounce" />
            ) : (
              <Sun className="w-4 h-4 text-amber-500" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-1.5 font-extrabold text-slate-900 dark:text-slate-100">
              <span>{Math.round(weather.temperature)}°C</span>
              <span className="text-slate-300 dark:text-slate-600">•</span>
              <span className="text-slate-600 dark:text-slate-300 font-semibold">{info.label}</span>
            </div>
            <div className="text-[10px] text-slate-400 font-medium">
              Wind: {weather.windspeed} km/h • Code #{weather.weathercode}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold tracking-wide ${
              isHighRisk
                ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 animate-pulse'
                : isMedRisk
                ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30'
                : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
            }`}
          >
            {info.badge}
          </span>

          <div className="text-slate-400 p-1">
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </div>
        </div>
      </div>

      {/* Expanded Advisory & Atmosphere Controls */}
      {!collapsed && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-200/70 dark:border-slate-800 space-y-3 animate-in fade-in duration-200">
          <div className="p-3 rounded-2xl bg-slate-100/70 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 text-xs">
              <ShieldAlert className="w-4 h-4 text-blue-500" />
              <span>Road Grip & Traction Advisory</span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
              {info.advisory}
            </p>
          </div>

          {/* Interactive Map Weather Atmosphere Selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-blue-500" />
                <span>Map Atmosphere</span>
              </span>
              {onToggleSound && (
                <button
                  type="button"
                  onClick={onToggleSound}
                  className={`inline-flex items-center gap-1 font-semibold transition-colors ${
                    soundEnabled ? 'text-blue-500' : 'text-slate-400'
                  }`}
                  title="Toggle ambient rain sound"
                >
                  {soundEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
                  <span>{soundEnabled ? 'Rain Ambience On' : 'Rain Ambience Off'}</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-1.5 text-[11px] font-semibold">
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
                  onClick={() => onWeatherModeChange && onWeatherModeChange(opt.id)}
                  className={`py-1.5 px-2 rounded-xl border text-center transition-all ${
                    weatherMode === opt.id
                      ? 'border-blue-500 bg-blue-500/15 text-blue-600 dark:text-blue-400 font-bold shadow-xs'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 flex items-center gap-2">
              <Wind className="w-3.5 h-3.5 text-slate-400" />
              <div>
                <span className="text-slate-400 block text-[9px] uppercase font-bold">Wind Velocity</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{weather.windspeed} km/h</span>
              </div>
            </div>

            <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 flex items-center gap-2">
              <Droplets className="w-3.5 h-3.5 text-slate-400" />
              <div>
                <span className="text-slate-400 block text-[9px] uppercase font-bold">Condition Code</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">WMO #{weather.weathercode}</span>
              </div>
            </div>
          </div>

          {onReportWeatherHazard && (
            <button
              type="button"
              onClick={() => onReportWeatherHazard(info.label)}
              className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-[11px] shadow-md shadow-blue-500/20 active:scale-98 transition-all flex items-center justify-center gap-1.5"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Report Hazard for Current Weather</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
