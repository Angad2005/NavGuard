import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { getHazardStatus, isActiveHazard } from '../utils/geo';

const HazardContext = createContext(null);

export function HazardProvider({ children, onToast }) {
  const [hazards, setHazards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const saved = sessionStorage.getItem('rp_session_tab');
      return ['active', 'scheduled', 'expired'].includes(saved) ? saved : 'active';
    } catch {
      return 'active';
    }
  });

  const fetchHazards = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/hazards');
      if (!response.ok) throw new Error('Could not load hazards.');
      const payload = await response.json();
      setHazards(Array.isArray(payload.data) ? payload.data : []);
    } catch (error) {
      console.warn('fetchHazards error:', error);
      if (onToast) onToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    fetchHazards();
  }, [fetchHazards]);

  const handleSetActiveTab = (tab) => {
    setActiveTab(tab);
    try {
      sessionStorage.setItem('rp_session_tab', tab);
    } catch {}
  };

  const createHazard = async (hazardData, imageFile = null) => {
    let body = JSON.stringify(hazardData);
    const headers = { 'Content-Type': 'application/json' };
    if (imageFile) {
      body = new FormData();
      body.append('hazard', JSON.stringify(hazardData));
      body.append('image', imageFile);
      delete headers['Content-Type'];
    }

    const response = await fetch('/api/hazards', {
      method: 'POST',
      headers,
      body
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Failed to create hazard');
    }
    const created = payload.data;
    setHazards((prev) => [...prev, created]);
    const status = getHazardStatus(created);
    handleSetActiveTab(status);
    return created;
  };

  const deleteHazard = async (id) => {
    const response = await fetch(`/api/hazards/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Could not remove hazard');
    }
    setHazards((prev) => prev.filter((h) => h.id !== id));
    return payload.data;
  };

  const stats = useMemo(() => {
    let active = 0;
    let scheduled = 0;
    let expired = 0;
    for (const h of hazards) {
      const status = getHazardStatus(h);
      if (status === 'active') active++;
      else if (status === 'scheduled') scheduled++;
      else if (status === 'expired') expired++;
    }
    return { active, scheduled, expired };
  }, [hazards]);

  const activeHazardsList = useMemo(() => {
    return hazards.filter((h) => isActiveHazard(h) && h.coordinates);
  }, [hazards]);

  return (
    <HazardContext.Provider
      value={{
        hazards,
        activeHazardsList,
        loading,
        activeTab,
        setActiveTab: handleSetActiveTab,
        stats,
        fetchHazards,
        createHazard,
        deleteHazard
      }}
    >
      {children}
    </HazardContext.Provider>
  );
}

export function useHazards() {
  const context = useContext(HazardContext);
  if (!context) {
    throw new Error('useHazards must be used within a HazardProvider');
  }
  return context;
}
