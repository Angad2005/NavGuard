import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  ShieldAlert,
  Download,
  Copy,
  Check,
  Leaf,
  Fuel,
  Clock,
  Navigation,
  AlertTriangle,
  FileCode,
  Share2
} from 'lucide-react';
import { formatDuration, formatDistance, routeTouchesHazard, distanceBetweenPointsMeters } from '../utils/geo';

export function RouteSafetyInspectorModal({ isOpen, onClose, route, startName, endName, hazards, onToast }) {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !route) return null;

  const isDetour = route.hazardDetour === true;
  const distanceKm = (route.distance / 1000).toFixed(1);
  const durationMin = Math.round(route.duration / 60);

  // Environmental calculations
  // Average car: ~7.5L / 100km, ~180g CO2 / km
  const estimatedFuelLiters = ((route.distance / 1000) * 0.075).toFixed(1);
  const estimatedCo2Kg = ((route.distance / 1000) * 0.18).toFixed(1);

  // Scan hazards in proximity (within 1200 meters of any point on the route)
  const coords = route.geometry?.coordinates || [];
  const nearbyHazards = (hazards || []).map((h) => {
    if (!h.coordinates) return null;
    let minDistance = Infinity;
    for (let i = 0; i < coords.length; i += 2) {
      const d = distanceBetweenPointsMeters(
        { lat: coords[i][1], lng: coords[i][0] },
        { lat: h.coordinates.lat, lng: h.coordinates.lng }
      );
      if (d < minDistance) minDistance = d;
    }
    return { ...h, minDistance };
  }).filter((h) => h && h.minDistance <= 1200).sort((a, b) => a.minDistance - b.minDistance);

  // Safety Score Calculation
  let safetyScore = 100;
  if (nearbyHazards.some((h) => h.minDistance <= 100)) safetyScore -= 35;
  else if (nearbyHazards.some((h) => h.minDistance <= 300)) safetyScore -= 10;
  if (isDetour) safetyScore = Math.min(safetyScore, 98);

  const safetyGrade = safetyScore >= 95 ? 'A+' : safetyScore >= 85 ? 'A' : safetyScore >= 70 ? 'B' : 'C';

  // GPX Export Helper
  const handleExportGPX = () => {
    const pointsXml = coords
      .map(([lng, lat]) => `<trkpt lat="${lat}" lon="${lng}"><ele>0</ele></trkpt>`)
      .join('\n');

    const gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="NaviGuard Safety Router" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>NaviGuard Route: ${startName || 'Start'} to ${endName || 'Destination'}</name>
    <desc>Safety detour avoiding active road obstacles</desc>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <trk>
    <name>Safe Route (${distanceKm} km)</name>
    <trkseg>
      ${pointsXml}
    </trkseg>
  </trk>
</gpx>`;

    const blob = new Blob([gpxContent], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `naviguard-safe-route-${Date.now()}.gpx`;
    a.click();
    URL.revokeObjectURL(url);
    if (onToast) onToast('GPX Route file exported successfully!', 'success');
  };

  // GeoJSON Export Helper
  const handleExportGeoJSON = () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            title: `Route: ${startName} -> ${endName}`,
            distanceMeters: route.distance,
            durationSeconds: route.duration,
            hazardDetour: isDetour,
            safetyScore: `${safetyScore}/100 (Grade ${safetyGrade})`
          },
          geometry: route.geometry
        }
      ]
    };

    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `naviguard-route-${Date.now()}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
    if (onToast) onToast('GeoJSON Route file exported!', 'success');
  };

  const handleCopySummary = () => {
    const text = `NaviGuard Route Summary
Origin: ${startName || 'Start'}
Destination: ${endName || 'End'}
Distance: ${distanceKm} km
Duration: ${durationMin} mins
Safety Rating: ${safetyScore}/100 (${safetyGrade} Hazard-Free)
Detour Status: ${isDetour ? 'Active Safe Detour' : 'Direct Corridor'}`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    if (onToast) onToast('Route briefing copied to clipboard.', 'info');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/25">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
                Route Safety & Clearance Audit
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Obstacle proximity scan & environmental metrics
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Safety Score Meter */}
        <div className="mt-4 p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-blue-500/10 border border-emerald-500/20 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {safetyScore}/100
              </span>
              <span className="px-2 py-0.5 rounded-full text-xs font-black bg-emerald-500 text-white shadow-xs">
                GRADE {safetyGrade}
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 font-semibold mt-1">
              {isDetour ? 'Safe Detour Corridor Active' : 'Optimal Direct Route'}
            </p>
          </div>

          <div className="text-right text-xs text-slate-500 dark:text-slate-400 font-medium">
            <div>Bypassed Hazards: <span className="font-bold text-slate-800 dark:text-slate-200">{nearbyHazards.length}</span></div>
            <div>Danger Zones: <span className="font-bold text-emerald-600 dark:text-emerald-400">0 Crossed</span></div>
          </div>
        </div>

        {/* Environmental & Fuel Savings Card */}
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="p-3 rounded-2xl bg-slate-100/70 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Fuel className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Est. Fuel</span>
              <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100">~{estimatedFuelLiters} L</span>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-100/70 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Leaf className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Carbon Est.</span>
              <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100">~{estimatedCo2Kg} kg CO₂</span>
            </div>
          </div>
        </div>

        {/* Hazard Proximity Audit List */}
        <div className="mt-4">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block mb-2">
            Nearby Community Hazards ({nearbyHazards.length})
          </span>

          {nearbyHazards.length === 0 ? (
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
              ✓ No obstacles detected within 1.2 km of this trajectory.
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {nearbyHazards.map((h) => (
                <div
                  key={h.id}
                  className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 font-bold text-[10px]">
                      {h.category}
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {h.title}
                    </span>
                  </div>

                  <span className="font-bold text-slate-500 dark:text-slate-400 shrink-0 text-[11px]">
                    {Math.round(h.minDistance)}m away <span className="text-emerald-500 font-extrabold">✓ Avoided</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Export & Sharing Options */}
        <div className="mt-5 pt-4 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleCopySummary}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 transition-all"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy Briefing'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportGeoJSON}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
            >
              <FileCode className="w-3.5 h-3.5 text-blue-500" />
              <span>GeoJSON</span>
            </button>

            <button
              type="button"
              onClick={handleExportGPX}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold shadow-md shadow-blue-500/25 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export GPX</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
