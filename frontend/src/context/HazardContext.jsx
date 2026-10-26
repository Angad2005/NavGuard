import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { getHazardStatus, isActiveHazard } from '../utils/geo';
import { useAuth } from './AuthContext';
import { apiFetch } from '../utils/api';

const HazardContext = createContext(null);

function readHazardCache(userId) {
  if (!userId) return [];
  try {
    const saved = JSON.parse(localStorage.getItem(`naviguard_hazards_${userId}`) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch (error) {
    console.warn('Could not read cached NaviGuard hazards:', error);
    return [];
  }
}

export function HazardProvider({ children, onToast }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [hazards, setHazards] = useState(() => readHazardCache(userId));
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
      const response = await apiFetch('/api/hazards');
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
    if (userId) fetchHazards();
    else setHazards([]);
  }, [fetchHazards, userId]);

  useEffect(() => {
    if (!userId) return;
    try {
      localStorage.setItem(`naviguard_hazards_${userId}`, JSON.stringify(hazards));
    } catch (error) {
      console.warn('Could not cache NaviGuard hazards locally:', error);
    }
  }, [hazards, userId]);

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

    const response = await apiFetch('/api/hazards', {
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
    const response = await apiFetch(`/api/hazards/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Could not remove hazard');
    }
    setHazards((prev) => prev.filter((h) => h.id !== id));
    return payload.data;
  };

  const confirmHazard = async (id) => {
    const response = await apiFetch(`/api/hazards/${encodeURIComponent(id)}/confirm`, {
      method: 'POST'
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Could not confirm hazard');
    }
    setHazards((prev) => prev.map((hazard) => hazard.id === id ? payload.data : hazard));
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
        deleteHazard,
        confirmHazard
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
