import React, { useState, useEffect } from 'react';
import { useHazards } from '../context/HazardContext';
import { reverseGeocodePoint, getDeviceLocation } from '../utils/geo';
import {
  X,
  AlertTriangle,
  Upload,
  Calendar,
  MapPin,
  Clock,
  Loader2,
  Image as ImageIcon,
  LocateFixed
} from 'lucide-react';

const CATEGORIES = [
  { id: 'Flooding', label: 'Flooding', icon: '🌊' },
  { id: 'Road Damage', label: 'Road Damage', icon: '🚧' },
  { id: 'Debris', label: 'Debris', icon: '🪵' },
  { id: 'Accident', label: 'Accident', icon: '💥' },
  { id: 'Construction', label: 'Construction', icon: '🏗️' },
  { id: 'Other', label: 'Other', icon: '⚠️' }
];

const SEVERITIES = [
  { id: 'Low', label: 'Low', color: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30' },
  { id: 'Medium', label: 'Medium', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30' },
  { id: 'High', label: 'High', color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30' },
  { id: 'Critical', label: 'Critical', color: 'bg-red-600/10 text-red-600 dark:text-red-400 border-red-600/40' }
];

export function HazardModal({ isOpen, onClose, initialCoords, onToast, onHazardCreated }) {
  const { createHazard } = useHazards();

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Flooding');
  const [severity, setSeverity] = useState('Medium');
  const [locationName, setLocationName] = useState('');
  const [description, setDescription] = useState('');
  const [coords, setCoords] = useState(initialCoords || null);

  // Schedule Window State
  const [isScheduled, setIsScheduled] = useState(false);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  // Image Upload State
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [locatingGps, setLocatingGps] = useState(false);

  // Synchronize when initialCoords changes
  useEffect(() => {
    if (initialCoords && Number.isFinite(initialCoords.lat) && Number.isFinite(initialCoords.lng)) {
      setCoords(initialCoords);
      reverseGeocodePoint(initialCoords).then((name) => {
        if (name && !locationName) {
          setLocationName(name.split(',').slice(0, 2).join(',').trim());
        }
      });
    }
  }, [initialCoords]);

  // Reset form when modal closes or opens
  useEffect(() => {
    if (!isOpen) {
      setTitle('');
      setCategory('Flooding');
      setSeverity('Medium');
      setLocationName('');
      setDescription('');
      setIsScheduled(false);
      setStartTime('');
      setEndTime('');
      setImageFile(null);
      setImagePreview(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype || file.type)) {
      if (onToast) onToast('Please select a JPEG, PNG, WebP, or GIF image.', 'error');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      if (onToast) onToast('Photo must be 5 MB or smaller.', 'error');
      return;
    }

    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (evt) => setImagePreview(evt.target.result);
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  const handleUseGps = async () => {
    setLocatingGps(true);
    try {
      const loc = await getDeviceLocation();
      setCoords(loc);
      const name = await reverseGeocodePoint(loc);
      if (name) {
        setLocationName(name.split(',').slice(0, 2).join(',').trim());
      }
      if (onToast) onToast('Location pinned to GPS coordinates.', 'info');
    } catch (err) {
      if (onToast) onToast(err.message || 'Could not fetch GPS coordinates.', 'warn');
    } finally {
      setLocatingGps(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      if (onToast) onToast('Please provide a title for the hazard.', 'warn');
      return;
    }
    if (!locationName.trim()) {
      if (onToast) onToast('Please provide a location description or landmark.', 'warn');
      return;
    }

    if (isScheduled) {
      if (!startTime || !endTime) {
        if (onToast) onToast('Please enter both start and end times for scheduled hazard.', 'warn');
        return;
      }
      if (new Date(startTime).getTime() >= new Date(endTime).getTime()) {
        if (onToast) onToast('Start time must be before end time.', 'warn');
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        category,
        severity,
        location: locationName.trim(),
        description: description.trim(),
        coordinates: coords
          ? {
              lat: Number(Number(coords.lat).toFixed(6)),
              lng: Number(Number(coords.lng).toFixed(6))
            }
          : null,
        window: {
          scheduled: isScheduled,
          start: isScheduled ? new Date(startTime).toISOString() : null,
          end: isScheduled ? new Date(endTime).toISOString() : null
        }
      };

      const created = await createHazard(payload, imageFile);
      if (onToast) onToast('Hazard reported successfully!', 'success');
      onClose();
      if (onHazardCreated) onHazardCreated(created);
    } catch (err) {
      if (onToast) onToast(err.message || 'Failed to submit hazard.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
      <div
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-2xl p-6 transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200/70 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Report Road Hazard</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Help fellow drivers safely navigate around obstacles
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
              Incident Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Flooded underpass, Pothole, Fallen powerline"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300/80 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Category Pills */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
              Category
            </label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map((cat) => {
                const selected = category === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                      selected
                        ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400 shadow-sm'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <span>{cat.icon}</span>
                    <span className="truncate">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Severity Buttons */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
              Severity Level
            </label>
            <div className="grid grid-cols-4 gap-2">
              {SEVERITIES.map((sev) => {
                const selected = severity === sev.id;
                return (
                  <button
                    key={sev.id}
                    type="button"
                    onClick={() => setSeverity(sev.id)}
                    className={`px-2.5 py-2 rounded-xl text-xs font-semibold border text-center transition-all ${
                      selected
                        ? `${sev.color} ring-2 ring-blue-500/50`
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {sev.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Location & GPS */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                Location / Street Name *
              </label>
              <button
                type="button"
                onClick={handleUseGps}
                disabled={locatingGps}
                className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
              >
                {locatingGps ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <LocateFixed className="w-3.5 h-3.5" />
                )}
                <span>Pin My GPS</span>
              </button>
            </div>
            <div className="relative">
              <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                required
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                placeholder="e.g., Highway 101 near Exit 4, Main Street"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300/80 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {coords && (
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                Coordinates: {Number(coords.lat).toFixed(5)}, {Number(coords.lng).toFixed(5)}
              </p>
            )}
          </div>

          {/* Optional Schedule Window Toggle */}
          <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800/80">
            <label className="flex items-center justify-between cursor-pointer py-1">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <span>Scheduled / Temporary Closure</span>
              </span>
              <input
                type="checkbox"
                checked={isScheduled}
                onChange={(e) => setIsScheduled(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-700"
              />
            </label>

            {isScheduled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Starts
                  </label>
                  <input
                    type="datetime-local"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Ends
                  </label>
                  <input
                    type="datetime-local"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Photo Upload */}
          <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800/80">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
              Incident Photo (Optional)
            </label>

            {imagePreview ? (
              <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 max-h-44 group">
                <img src={imagePreview} alt="Incident preview" className="w-full h-44 object-cover" />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-lg backdrop-blur-sm transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl cursor-pointer hover:border-blue-500/60 dark:hover:border-blue-500/60 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 transition-all">
                <Upload className="w-6 h-6 text-slate-400 mb-1.5" />
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Click or drag photo to upload
                </span>
                <span className="text-[10px] text-slate-400 mt-0.5">JPEG, PNG, WebP up to 5 MB</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleImageChange}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* Submit Actions */}
          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-200/70 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-98 text-white text-sm font-semibold shadow-lg shadow-blue-500/25 transition-all disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Reporting...</span>
                </>
              ) : (
                <span>Publish Hazard</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
