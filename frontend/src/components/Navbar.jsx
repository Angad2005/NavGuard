import React from 'react';
import { useHazards } from '../context/HazardContext';
import {
  Shield,
  Plus,
  AlertOctagon,
  CloudRain,
  Activity,
  Bot,
  LogOut
} from 'lucide-react';
import { playSound } from '../utils/audio';
import { useAuth } from '../context/AuthContext';

export function Navbar({ onOpenReport, onSelectTab, onOpenNavAI, weatherData }) {
  const { stats } = useHazards();
  const { user, logout } = useAuth();

  return (
    <header className="fixed top-3 left-1/2 -translate-x-1/2 z-30 w-full max-w-4xl px-4 pointer-events-none">
      <div className="pointer-events-auto h-14 px-3 sm:px-4 rounded-3xl cyber-glass flex items-center justify-between gap-3 shadow-[0_15px_40px_-10px_rgba(0,0,0,0.5)] transition-all">
        {/* Brand Group */}
        <div
          className="flex items-center gap-2.5 cursor-pointer group"
          onClick={() => {
            if (onSelectTab) onSelectTab('routes');
            playSound('click');
          }}
        >
          <div className="relative">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/30 group-hover:scale-105 transition-transform">
              <Shield className="w-5 h-5 fill-white/20" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-slate-900 animate-pulse" />
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-black text-sm tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
                NaviGuard
              </span>
              <span className="px-1.5 py-0.2 rounded-md text-[9px] font-black bg-blue-500/20 text-blue-400 border border-blue-500/30 tracking-wider">
                DEFENSE
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-1 text-[10px] text-slate-400 font-mono">
              <Activity className="w-2.5 h-2.5 text-emerald-400" />
              <span>Dijkstra Core Online</span>
            </div>
          </div>
        </div>

        {/* Center Weather & Telemetry Snapshot */}
        <div className="hidden md:flex items-center gap-2">
          {weatherData && (
            <button
              type="button"
              onClick={() => {
                if (onSelectTab) onSelectTab('weather');
                playSound('click');
              }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs font-semibold text-slate-200 transition-all"
            >
              <CloudRain className="w-3.5 h-3.5 text-blue-400" />
              <span>{Math.round(weatherData.temperature)}°C</span>
              <span className="text-slate-500">•</span>
              <span className="text-[11px] text-slate-400">{weatherData.windspeed} km/h</span>
            </button>
          )}

          {stats.active > 0 && (
            <button
              type="button"
              onClick={() => {
                if (onSelectTab) onSelectTab('hazards');
                playSound('click');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-bold transition-all"
            >
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              <span>{stats.active} Obstacles Active</span>
            </button>
          )}
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2">
          {/* NavAI Route Copilot Button */}
          <button
            type="button"
            onClick={() => {
              if (onOpenNavAI) onOpenNavAI();
              else if (onSelectTab) onSelectTab('navai');
              playSound('ai');
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/35 text-cyan-300 text-xs font-black shadow-sm shadow-cyan-500/20 active:scale-95 transition-all"
            title="Open NavAI Real-Time Route & Safety Copilot"
          >
            <Bot className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span className="hidden sm:inline">NavAI</span>
            <span className="px-1 py-0.2 rounded text-[8px] bg-cyan-400/20 text-cyan-300 font-mono tracking-wider">AI</span>
          </button>

          {/* Emergency Safe Haven SOS Button */}
          <button
            type="button"
            onClick={() => {
              if (onSelectTab) onSelectTab('emergency');
              playSound('warning');
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-gradient-to-r from-rose-600/30 to-red-600/30 hover:from-rose-600/40 hover:to-red-600/40 border border-rose-500/40 text-rose-300 text-xs font-extrabold shadow-sm shadow-rose-600/20 active:scale-95 transition-all"
            title="Emergency Safe Haven: Hospitals, Police, Fire"
          >
            <AlertOctagon className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
            <span className="hidden sm:inline">SOS Haven</span>
          </button>

          {/* Report Hazard Action */}
          <button
            type="button"
            onClick={() => {
              onOpenReport();
              playSound('click');
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-95 text-white text-xs font-black shadow-lg shadow-blue-500/30 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Report Hazard</span>
          </button>
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-1.5 rounded-2xl border border-white/10 bg-white/5 px-2.5 py-2 text-xs font-bold text-slate-300 transition hover:bg-rose-500/15 hover:text-rose-300"
            title={`Sign out${user?.username ? ` (${user.username})` : ''}`}
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden lg:inline">Sign out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
