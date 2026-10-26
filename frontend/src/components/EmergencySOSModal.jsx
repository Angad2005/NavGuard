import React, { useState, useEffect } from 'react';
import {
  X,
  AlertOctagon,
  PhoneCall,
  Hospital,
  Shield,
  Flame,
  Navigation,
  Loader2,
  Copy,
  Check,
  MapPin,
  ExternalLink
} from 'lucide-react';
import { formatDistance, distanceBetweenPointsMeters } from '../utils/geo';

const SAFE_HAVEN_TYPES = [
  { id: 'hospital', label: 'Hospitals / ER', icon: Hospital, amenity: 'hospital', color: 'text-rose-500 bg-rose-500/10' },
  { id: 'police', label: 'Police Stations', icon: Shield, amenity: 'police', color: 'text-blue-500 bg-blue-500/10' },
  { id: 'fire', label: 'Fire Stations', icon: Flame, amenity: 'fire_station', color: 'text-amber-500 bg-amber-500/10' }
];

export function EmergencySOSModal({ isOpen, onClose, userCoords, onSelectEmergencyDestination, onToast }) {
  const [selectedType, setSelectedType] = useState('hospital');
  const [loading, setLoading] = useState(false);
  const [places, setPlaces] = useState([]);
  const [copiedCoords, setCopiedCoords] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (!userCoords) {
      setPlaces([]);
      setError('Allow location access to find nearby emergency services.');
      return;
    }

    const controller = new AbortController();
    const fetchSafeHavens = async () => {
      setLoading(true);
      setPlaces([]);
      setError('');
      try {
        const typeObj = SAFE_HAVEN_TYPES.find((t) => t.id === selectedType);
        const amenity = typeObj ? typeObj.amenity : 'hospital';

        const query = `[out:json][timeout:10];
          (
            node["amenity"="${amenity}"](around:8000,${userCoords.lat},${userCoords.lng});
            way["amenity"="${amenity}"](around:8000,${userCoords.lat},${userCoords.lng});
            relation["amenity"="${amenity}"](around:8000,${userCoords.lat},${userCoords.lng});
          );
          out center;`;

        const res = await fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          body: query,
          signal: controller.signal
        });

        if (!res.ok) throw new Error('Overpass server busy');
        const data = await res.json();
        const results = (data.elements || []).map((el) => {
          const lat = Number(el.lat ?? el.center?.lat);
          const lng = Number(el.lon ?? el.center?.lon);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          const dist = distanceBetweenPointsMeters(userCoords, { lat, lng });
          return {
            id: el.id,
            name: el.tags?.name || `${typeObj.label.slice(0, -1)} Facility`,
            street: el.tags?.['addr:street'] || el.tags?.address || 'Public Facility',
            phone: el.tags?.phone || el.tags?.['contact:phone'] || null,
            emergency: el.tags?.emergency === 'yes',
            lat,
            lng,
            distance: dist
          };
        }).filter(Boolean);

        results.sort((a, b) => a.distance - b.distance);
        if (!controller.signal.aborted) setPlaces(results.slice(0, 8));
      } catch (err) {
        if (!controller.signal.aborted) {
          console.warn('Emergency POI fetch warning:', err);
          setPlaces([]);
          setError(err.message || 'Could not load nearby emergency services.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    fetchSafeHavens();
    return () => controller.abort();
  }, [isOpen, selectedType, userCoords]);

  if (!isOpen) return null;

  const handleCopyCoords = () => {
    if (!userCoords) return;
    const str = `${userCoords.lat.toFixed(6)}, ${userCoords.lng.toFixed(6)}`;
    navigator.clipboard.writeText(str);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2000);
    if (onToast) onToast('Coordinates copied to clipboard for dispatchers.', 'info');
  };

  const handleRouteTo = (place) => {
    onSelectEmergencyDestination({
      name: place.name,
      coords: { lat: place.lat, lng: place.lng }
    });
    onClose();
    if (onToast) onToast(`Emergency route set to ${place.name}! Calculating safe detour...`, 'success');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl border border-rose-500/30 rounded-3xl shadow-2xl p-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-rose-600 flex items-center justify-center text-white shadow-lg shadow-rose-600/30">
              <AlertOctagon className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
                  Emergency Safe Haven
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                  SOS ASSIST
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                1-click emergency routing to nearest hospitals, police, & services
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

        {/* Current GPS Coordinates Card for Emergency Responders */}
        {userCoords && (
          <div className="mt-4 p-3.5 rounded-2xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                Your Exact Location (For Dispatch)
              </span>
              <span className="font-mono font-bold text-xs text-slate-900 dark:text-slate-100">
                {userCoords.lat.toFixed(6)}, {userCoords.lng.toFixed(6)}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopyCoords}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold shadow-xs hover:bg-slate-50 transition-all"
            >
              {copiedCoords ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCoords ? 'Copied' : 'Copy GPS'}</span>
            </button>
          </div>
        )}

        {/* Safe Haven Category Selector */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          {SAFE_HAVEN_TYPES.map((t) => {
            const Icon = t.icon;
            const selected = selectedType === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedType(t.id)}
                className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border text-center transition-all ${
                  selected
                    ? 'border-rose-500 bg-rose-50/80 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-bold shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400'
                }`}
              >
                <Icon className="w-5 h-5 mb-1" />
                <span className="text-[10px] truncate max-w-full">{t.label.split('/')[0]}</span>
              </button>
            );
          })}
        </div>

        {/* POI Results List */}
        <div className="mt-4 space-y-2.5 max-h-64 overflow-y-auto">
          {loading ? (
            <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-rose-500" />
              <span>Scanning live map for nearest {selectedType}s...</span>
            </div>
          ) : places.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              {error || 'No emergency facilities found within 8 km.'}
            </div>
          ) : (
            places.map((place) => (
              <div
                key={place.id}
                className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center justify-between gap-3 hover:border-rose-500/40 transition-all"
              >
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">
                    {place.name}
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {place.street} • <span className="font-semibold text-rose-600 dark:text-rose-400">{formatDistance(place.distance)} away</span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {place.phone && (
                    <a
                      href={`tel:${place.phone}`}
                      className="p-2 rounded-xl bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:text-blue-600 transition-colors"
                      title={`Call ${place.phone}`}
                    >
                      <PhoneCall className="w-3.5 h-3.5" />
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={() => handleRouteTo(place)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-xs font-bold shadow-md shadow-rose-600/20 transition-all"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span>Route Now</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Emergency Call */}
        <div className="mt-5 pt-3 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Immediate Danger? Call emergency services:
          </span>
          <a
            href="tel:112"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow-md shadow-rose-600/30 transition-all"
          >
            <PhoneCall className="w-3.5 h-3.5" />
            <span>Call 112 / 911</span>
          </a>
        </div>
      </div>
    </div>
  );
}
