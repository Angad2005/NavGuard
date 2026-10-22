import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext(null);

const DEFAULT_PREFS = {
  theme: 'light',
  contrast: '',
  font: 'font-default',
  size: 'fs-medium'
};

export function ThemeProvider({ children }) {
  const [prefs, setPrefs] = useState(() => {
    try {
      const stored = localStorage.getItem('rp_prefs');
      return stored ? { ...DEFAULT_PREFS, ...JSON.parse(stored) } : DEFAULT_PREFS;
    } catch {
      return DEFAULT_PREFS;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('rp_prefs', JSON.stringify(prefs));
    } catch (e) {
      console.warn('Could not save preferences', e);
    }

    const body = document.body;
    body.classList.remove(
      'theme-dark',
      'contrast-high',
      'contrast-warm',
      'font-default',
      'font-readable',
      'font-serif',
      'fs-small',
      'fs-medium',
      'fs-large',
      'fs-xlarge'
    );

    if (prefs.theme === 'dark') body.classList.add('theme-dark');
    if (prefs.contrast) body.classList.add(prefs.contrast);
    if (prefs.font) body.classList.add(prefs.font);
    if (prefs.size) body.classList.add(prefs.size);
  }, [prefs]);

  const setTheme = (theme) => setPrefs((p) => ({ ...p, theme }));
  const toggleTheme = () =>
    setPrefs((p) => ({ ...p, theme: p.theme === 'dark' ? 'light' : 'dark' }));
  const setContrast = (contrast) => setPrefs((p) => ({ ...p, contrast }));
  const setFont = (font) => setPrefs((p) => ({ ...p, font }));
  const setSize = (size) => setPrefs((p) => ({ ...p, size }));

  return (
    <ThemeContext.Provider
      value={{
        ...prefs,
        setTheme,
        toggleTheme,
        setContrast,
        setFont,
        setSize
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
