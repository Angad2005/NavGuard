import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { X, Sun, Moon, Type, Eye, Palette } from 'lucide-react';

export function AccessibilityModal({ isOpen, onClose }) {
  const {
    theme,
    setTheme,
    contrast,
    setContrast,
    font,
    setFont,
    size,
    setSize
  } = useTheme();

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="accessibility-title"
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Eye size={20} style={{ color: 'var(--primary)' }} />
            <h2 id="accessibility-title" className="modal-title">
              Display & Accessibility
            </h2>
          </div>
          <button
            className="icon-btn"
            onClick={onClose}
            aria-label="Close settings"
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {/* Appearance / Theme */}
          <div className="form-field-group">
            <span className="field-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Palette size={15} /> Color Theme
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <button
                type="button"
                className={`btn ${theme === 'light' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setTheme('light')}
                style={{ fontSize: '0.85rem' }}
              >
                <Sun size={16} /> Light Mode
              </button>
              <button
                type="button"
                className={`btn ${theme === 'dark' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setTheme('dark')}
                style={{ fontSize: '0.85rem' }}
              >
                <Moon size={16} /> Dark Mode
              </button>
            </div>
          </div>

          {/* Contrast Mode */}
          <div className="form-field-group" style={{ marginTop: '0.5rem' }}>
            <span className="field-label">Contrast & Palette</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
              <button
                type="button"
                className={`btn ${contrast === '' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setContrast('')}
                style={{ fontSize: '0.8rem', padding: '0.5rem' }}
              >
                Default
              </button>
              <button
                type="button"
                className={`btn ${contrast === 'contrast-high' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setContrast('contrast-high')}
                style={{ fontSize: '0.8rem', padding: '0.5rem' }}
              >
                High Contrast
              </button>
              <button
                type="button"
                className={`btn ${contrast === 'contrast-warm' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setContrast('contrast-warm')}
                style={{ fontSize: '0.8rem', padding: '0.5rem' }}
              >
                Warm Sepia
              </button>
            </div>
          </div>

          {/* Font Family */}
          <div className="form-field-group" style={{ marginTop: '0.5rem' }}>
            <span className="field-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Type size={15} /> Font Style
            </span>
            <select
              className="form-input"
              value={font}
              onChange={(e) => setFont(e.target.value)}
            >
              <option value="font-default">Default (Inter Modern)</option>
              <option value="font-readable">High Legibility (Open Sans)</option>
              <option value="font-serif">Serif (Editorial)</option>
            </select>
          </div>

          {/* Font Size */}
          <div className="form-field-group" style={{ marginTop: '0.5rem' }}>
            <span className="field-label">Text Size</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
              {[
                { label: 'A-', val: 'fs-small' },
                { label: 'A', val: 'fs-medium' },
                { label: 'A+', val: 'fs-large' },
                { label: 'A++', val: 'fs-xlarge' }
              ].map((s) => (
                <button
                  key={s.val}
                  type="button"
                  className={`btn ${size === s.val ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setSize(s.val)}
                  style={{ fontWeight: 700, fontSize: '0.85rem' }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
