import React, { useState, useEffect } from 'react';
import { useHazards } from '../context/HazardContext';
import { reverseGeocodePoint, getDeviceLocation } from '../utils/geo';
import { X, AlertTriangle, MapPin, Calendar, Clock, Loader2 } from 'lucide-react';

export function HazardModal({ isOpen, initialPoint, onClose, onCreated, onToast }) {
  const { createHazard } = useHazards();

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [severity, setSeverity] = useState('Medium');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [scheduled, setScheduled] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [coordinates, setCoordinates] = useState(null);

  const [loadingLocation, setLoadingLocation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setTitle('');
      setCategory('');
      setSeverity('Medium');
      setLocation('');
      setDescription('');
      setImageFile(null);
      setScheduled(false);
      setStart('');
      setEnd('');
      setCoordinates(null);
      setErrorMessage('');
      return;
    }

    async function resolveInitLocation() {
      setLoadingLocation(true);
      try {
        let point = initialPoint;
        if (!point) {
          point = await getDeviceLocation();
        }
        setCoordinates(point);
        const address = await reverseGeocodePoint(point);
        setLocation(
          address || `Pinned location (${point.lat.toFixed(5)}, ${point.lng.toFixed(5)})`
        );
      } catch (err) {
        if (initialPoint) {
          setCoordinates(initialPoint);
          setLocation(
            `Pinned location (${initialPoint.lat.toFixed(5)}, ${initialPoint.lng.toFixed(5)})`
          );
        } else {
          setLocation('');
        }
      } finally {
        setLoadingLocation(false);
      }
    }

    resolveInitLocation();
  }, [isOpen, initialPoint]);

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl('');
      return undefined;
    }

    const previewUrl = URL.createObjectURL(imageFile);
    setImagePreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [imageFile]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!title.trim() || title.trim().length < 3) {
      setErrorMessage('Title must be at least 3 characters long.');
      return;
    }
    if (!category) {
      setErrorMessage('Please select a hazard category.');
      return;
    }
    if (!location.trim()) {
      setErrorMessage('Location description is required.');
      return;
    }
    if (imageFile && imageFile.size > 5 * 1024 * 1024) {
      setErrorMessage('Image must be 5 MB or smaller.');
      return;
    }

    if (scheduled) {
      if (!start || !end) {
        setErrorMessage('Start and end times are required for scheduled hazards.');
        return;
      }
      if (new Date(start) >= new Date(end)) {
        setErrorMessage('Scheduled start time must be before end time.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const hazardData = {
        title: title.trim(),
        category,
        severity,
        location: location.trim(),
        description: description.trim(),
        coordinates: coordinates
          ? { lat: coordinates.lat, lng: coordinates.lng }
          : null,
        window: {
          scheduled,
          start: scheduled ? start : null,
          end: scheduled ? end : null
        }
      };

      const created = await createHazard(hazardData, imageFile);
      if (onToast) onToast('Hazard reported successfully!', 'success');
      if (onCreated) onCreated(created);
      onClose();
    } catch (error) {
      setErrorMessage(error.message || 'Failed to submit hazard report.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-hazard-title"
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={20} style={{ color: 'var(--danger)' }} />
            <h2 id="report-hazard-title" className="modal-title">
              Report Route Hazard
            </h2>
          </div>
          <button
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {errorMessage && (
              <div
                style={{
                  background: 'var(--danger-light)',
                  border: '1px solid var(--danger-border)',
                  color: 'var(--danger)',
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.85rem',
                  fontWeight: 500
                }}
              >
                {errorMessage}
              </div>
            )}

            <div className="form-field-group">
              <label htmlFor="hz-title" className="field-label">
                Hazard Title
              </label>
              <input
                id="hz-title"
                type="text"
                className="form-input"
                placeholder="e.g. Flooded underpass, Road construction"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                minLength={3}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="form-field-group">
                <label htmlFor="hz-category" className="field-label">
                  Category
                </label>
                <select
                  id="hz-category"
                  className="form-input"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  required
                >
                  <option value="">Select category...</option>
                  <option value="Road Damage">Road Damage</option>
                  <option value="Flooding">Flooding</option>
                  <option value="Debris">Debris</option>
                  <option value="Accident">Accident</option>
                  <option value="Weather">Weather</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="form-field-group">
                <label htmlFor="hz-severity" className="field-label">
                  Severity
                </label>
                <select
                  id="hz-severity"
                  className="form-input"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                >
                  <option value="Low">Low (Caution)</option>
                  <option value="Medium">Medium (Delay expected)</option>
                  <option value="High">High (Severe / Impassable)</option>
                </select>
              </div>
            </div>

            <div className="form-field-group">
              <label htmlFor="hz-location" className="field-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <MapPin size={14} /> Location Address / Landmarks
              </label>
              <div className="input-with-button">
                <input
                  id="hz-location"
                  type="text"
                  className="form-input"
                  placeholder={loadingLocation ? 'Locating current coordinates...' : 'Enter location or address'}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  required
                />
                {loadingLocation && (
                  <span className="input-suffix-btn" style={{ pointerEvents: 'none' }}>
                    <Loader2 size={16} className="spin" />
                  </span>
                )}
              </div>
              {coordinates && (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  GPS: {coordinates.lat.toFixed(5)}, {coordinates.lng.toFixed(5)}
                </span>
              )}
            </div>

            <div className="form-field-group">
              <label htmlFor="hz-description" className="field-label">
                Additional Details (Optional)
              </label>
              <textarea
                id="hz-description"
                className="form-input"
                rows={2}
                placeholder="Give other drivers context, lane closures, or suggested detours..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="form-field-group">
              <label htmlFor="hz-image" className="field-label">
                Hazard Photo (Optional)
              </label>
              <input
                id="hz-image"
                type="file"
                className="form-input"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(event) => setImageFile(event.target.files?.[0] || null)}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                JPEG, PNG, WebP, or GIF · up to 5 MB
              </span>
              {imagePreviewUrl && (
                <img
                  className="hazard-upload-preview"
                  src={imagePreviewUrl}
                  alt="Selected hazard preview"
                />
              )}
            </div>

            {/* Scheduled window toggle */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: 'var(--bg-surface-alt)',
                padding: '0.65rem 0.85rem',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                border: '1px solid var(--border-subtle)'
              }}
              onClick={() => setScheduled(!scheduled)}
            >
              <input
                type="checkbox"
                id="hz-scheduled"
                checked={scheduled}
                onChange={(e) => setScheduled(e.target.checked)}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                onClick={(e) => e.stopPropagation()}
              />
              <label
                htmlFor="hz-scheduled"
                style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Calendar size={15} /> This hazard has an active time window
              </label>
            </div>

            {scheduled && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-field-group">
                  <label htmlFor="hz-start" className="field-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Clock size={13} /> Start Time
                  </label>
                  <input
                    id="hz-start"
                    type="datetime-local"
                    className="form-input"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    required={scheduled}
                  />
                </div>
                <div className="form-field-group">
                  <label htmlFor="hz-end" className="field-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Clock size={13} /> End Time
                  </label>
                  <input
                    id="hz-end"
                    type="datetime-local"
                    className="form-input"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    required={scheduled}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="spin" /> Submitting...
                </>
              ) : (
                'Report Hazard'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
