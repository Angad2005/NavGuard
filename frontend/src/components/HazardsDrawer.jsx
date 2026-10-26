import React, { useState } from 'react';
import { useHazards } from '../context/HazardContext';
import { ProtectedHazardImage } from './ProtectedHazardImage';
import { getHazardStatus, formatDuration, getHazardColor } from '../utils/geo';
import {
  X,
  Search,
  AlertTriangle,
  MapPin,
  Trash2,
  ExternalLink,
  Clock,
  ShieldAlert,
  ChevronRight,
  Filter,
  CheckCircle2,
  Calendar,
  Sparkles,
  ThumbsUp
} from 'lucide-react';

const CATEGORIES = ['All', 'Flooding', 'Road Damage', 'Debris', 'Accident', 'Construction', 'Other'];

export function HazardsDrawer({ isOpen, onClose, onFocusHazard, onToast }) {
  const { hazards, stats, deleteHazard, confirmHazard } = useHazards();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  if (!isOpen) return null;

  const filtered = hazards.filter((h) => {
    const matchesCategory = categoryFilter === 'All' || h.category === categoryFilter;
    const matchesQuery =
      !search ||
      h.title?.toLowerCase().includes(search.toLowerCase()) ||
      h.location?.toLowerCase().includes(search.toLowerCase()) ||
      h.description?.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesQuery;
  });

  const handleDelete = async (id, title) => {
    if (!window.confirm(`Mark hazard "${title}" as cleared/resolved?`)) return;
    try {
      await deleteHazard(id);
      if (onToast) onToast(`Resolved: "${title}"`, 'success');
    } catch (err) {
      if (onToast) onToast(err.message || 'Could not delete hazard', 'error');
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div className="fixed top-0 right-0 z-50 h-full w-full max-w-md bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col transition-all animate-in slide-in-from-right duration-250">
        {/* Drawer Header */}
        <div className="p-5 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-orange-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold shadow-xs">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900 dark:text-slate-100">
                Your Hazards
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Your saved incident reports and road alerts
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mini Pulse Stats */}
        <div className="px-5 py-3 border-b border-slate-200/60 dark:border-slate-800/80 grid grid-cols-3 gap-2">
          <div className="p-2.5 rounded-xl bg-slate-100/70 dark:bg-slate-800/50 text-center">
            <div className="text-base font-extrabold text-rose-600 dark:text-rose-400">{stats.active}</div>
            <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Active</div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-100/70 dark:bg-slate-800/50 text-center">
            <div className="text-base font-extrabold text-blue-600 dark:text-blue-400">{stats.scheduled}</div>
            <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Scheduled</div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-100/70 dark:bg-slate-800/50 text-center">
            <div className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">{stats.expired}</div>
            <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Expired</div>
          </div>
        </div>

        {/* Search & Category Filter Pills */}
        <div className="p-4 border-b border-slate-200/60 dark:border-slate-800/80 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, location or category..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1 rounded-lg shrink-0 font-semibold transition-all ${
                  categoryFilter === cat
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Hazards List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-20 px-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-500/80 mx-auto mb-3 animate-pulse" />
              <h4 className="font-extrabold text-sm text-slate-800 dark:text-slate-200">
                All Corridors Clear
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto">
                No active hazards found under this filter. Tap "+ Report Hazard" anytime you encounter an obstacle.
              </p>
            </div>
          ) : (
            filtered.map((hazard) => {
              const status = getHazardStatus(hazard);
              const isScheduled = status === 'scheduled';
              const color = getHazardColor(hazard.category, hazard.severity);

              return (
                <div
                  key={hazard.id}
                  className="p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white/80 dark:bg-slate-800/40 hover:border-blue-500/40 transition-all shadow-xs group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {hazard.category}
                        </span>
                        <span
                          className="text-[11px] font-bold px-2 py-0.5 rounded-md"
                          style={{
                            backgroundColor: `${color}18`,
                            color: color,
                            border: `1px solid ${color}33`
                          }}
                        >
                          {hazard.severity} Severity
                        </span>
                        {isScheduled && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                            Scheduled
                          </span>
                        )}
                      </div>

                      <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm leading-snug">
                        {hazard.title}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-1 truncate">
                        <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                        <span>{hazard.location}</span>
                      </p>
                      {hazard.description && (
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 line-clamp-2">
                          {hazard.description}
                        </p>
                      )}
                    </div>

                    {hazard.imageUrl && (
                      <button
                        type="button"
                        onClick={() => setSelectedPhoto(hazard.imageUrl)}
                        className="w-16 h-16 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0 relative group/img cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all shadow-xs"
                      >
                        <ProtectedHazardImage
                          src={hazard.imageUrl}
                          alt={hazard.title}
                          className="w-full h-full object-cover group-hover/img:scale-105 transition-transform"
                        />
                      </button>
                    )}
                  </div>

                  {/* Your report status and actions */}
                  <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 text-xs">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await confirmHazard(hazard.id);
                          if (onToast) onToast(`Confirmed: ${hazard.title} is still active.`, 'info');
                        } catch (e) {
                          if (onToast) onToast(e.message, 'error');
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-slate-700 dark:text-slate-300 hover:text-emerald-600 text-[11px] font-semibold transition-all"
                      title="Confirm this hazard still exists"
                    >
                      <ThumbsUp className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Confirmed ({hazard.confirmations || 1})</span>
                    </button>

                    <div className="flex items-center gap-2">
                      {hazard.coordinates && (
                        <button
                          type="button"
                          onClick={() => {
                            if (onFocusHazard) onFocusHazard(hazard.coordinates);
                            onClose();
                          }}
                          className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline font-bold"
                        >
                          <span>Center on map</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDelete(hazard.id, hazard.title)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                        title="Mark resolved & remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Photo Modal Lightbox */}
        {selectedPhoto && (
          <div
            className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
            onClick={() => setSelectedPhoto(null)}
          >
            <div className="relative max-w-2xl max-h-[85vh] rounded-2xl overflow-hidden bg-slate-900 shadow-2xl">
              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                className="absolute top-3 right-3 p-2 bg-black/60 hover:bg-black/90 text-white rounded-full transition-colors z-10"
              >
                <X className="w-5 h-5" />
              </button>
              <ProtectedHazardImage
                src={selectedPhoto}
                alt="Hazard photograph"
                className="w-full h-auto max-h-[80vh] object-contain"
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
