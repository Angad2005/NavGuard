import React from 'react';
import {
  AlertTriangle,
  Navigation,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  Clock,
  MapPin,
  Check,
  X,
  Volume2,
  Sparkles
} from 'lucide-react';
import { formatDuration, formatDistance, getHazardColor } from '../utils/geo';
import { playSound, speakNavAI } from '../utils/audio';

export function AlternateRoutePromptModal({
  isOpen,
  hazard,
  currentRoute,
  alternateRoute,
  onAcceptDetour,
  onKeepCurrentRoute
}) {
  if (!isOpen || !hazard || !alternateRoute) return null;

  const currentDist = currentRoute ? currentRoute.distance : 0;
  const currentDur = currentRoute ? currentRoute.duration : 0;
  const altDist = alternateRoute.distance;
  const altDur = alternateRoute.duration;

  const distDiffMeters = altDist - currentDist;
  const durDiffSec = altDur - currentDur;

  const distDiffText =
    distDiffMeters > 0
      ? `+${formatDistance(distDiffMeters)}`
      : distDiffMeters < 0
      ? `-${formatDistance(Math.abs(distDiffMeters))}`
      : 'Same distance';

  const durDiffText =
    durDiffSec > 0
      ? `+${formatDuration(durDiffSec)}`
      : durDiffSec < 0
      ? `-${formatDuration(Math.abs(durDiffSec))}`
      : 'Same time';

  const hazardColor = getHazardColor(hazard.category, hazard.severity);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-lg rounded-3xl cyber-glass border border-amber-500/40 p-5 sm:p-6 shadow-[0_25px_60px_-15px_rgba(245,158,11,0.35)] overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Amber Ambient Top Glow */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-500 via-rose-500 to-amber-500 animate-pulse" />

        {/* Header Alert Bar */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/20">
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-rose-500 ring-2 ring-slate-950 animate-ping" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-sm uppercase tracking-wider text-amber-400">
                  Obstacle Detected On Route
                </span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  REROUTE OFFER
                </span>
              </div>
              <h3 className="font-extrabold text-base text-white tracking-tight">
                Switch to Alternate Safe Detour?
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onKeepCurrentRoute}
            className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/10 transition-colors"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Hazard Briefing Card */}
        <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/25 mb-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: hazardColor }}
              />
              <span className="font-bold text-sm text-white truncate">
                {hazard.title || 'Reported Road Obstacle'}
              </span>
            </div>

            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30 shrink-0">
              {hazard.severity || 'Medium'} Severity
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-300">
            <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span className="truncate">{hazard.location || 'Reported along your active trajectory'}</span>
          </div>
          {hazard.description && (
            <p className="text-[11px] text-slate-400 italic">
              "{hazard.description}"
            </p>
          )}
        </div>

        {/* Comparison: Current vs Alternate Detour */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          {/* Current Path */}
          <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-slate-400 mb-1">
                <ShieldAlert className="w-3 h-3 text-rose-400" />
                <span>Current Route</span>
              </div>
              <div className="font-extrabold text-white text-sm">
                {currentRoute ? formatDuration(currentRoute.duration) : '--'}
              </div>
              <div className="text-[11px] text-slate-400">
                {currentRoute ? formatDistance(currentRoute.distance) : '--'}
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-white/5 text-[10px] font-semibold text-rose-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              <span>Passes hazard zone</span>
            </div>
          </div>

          {/* Alternate Safe Detour */}
          <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col justify-between shadow-sm shadow-emerald-500/10">
            <div>
              <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-emerald-400 mb-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                <span>Safe Alternate</span>
              </div>
              <div className="font-extrabold text-white text-sm">
                {formatDuration(altDur)}
              </div>
              <div className="text-[11px] text-emerald-300 font-semibold">
                {formatDistance(altDist)} ({distDiffText})
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-emerald-500/20 text-[10px] font-bold text-emerald-300 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-emerald-400" />
              <span>Bypasses hazard safely</span>
            </div>
          </div>
        </div>

        {/* Informative Note */}
        <p className="text-[11px] text-slate-300 mb-5 leading-relaxed bg-white/[0.02] p-2.5 rounded-xl border border-white/5">
          <strong className="text-white">NavAI Guidance:</strong> An alternate corridor was computed to keep you outside the 100-meter danger zone. Would you like to switch now?
        </p>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onKeepCurrentRoute}
            className="flex-1 py-3 px-4 rounded-2xl bg-white/5 hover:bg-white/10 active:scale-95 border border-white/10 text-xs font-bold text-slate-300 hover:text-white transition-all text-center"
          >
            Keep Current Route
          </button>

          <button
            type="button"
            onClick={onAcceptDetour}
            className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 active:scale-95 text-white text-xs font-black shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all"
          >
            <Navigation className="w-4 h-4 fill-white" />
            <span>Accept Detour</span>
          </button>
        </div>
      </div>
    </div>
  );
}
