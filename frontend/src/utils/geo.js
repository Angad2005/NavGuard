export const HAZARD_AVOIDANCE_RADIUS_METERS = 100;

export function distanceBetweenPointsMeters(a, b) {
  if (!a || !b) return 0;
  const earthRadius = 6371000;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function distanceToSegmentMeters(point, start, end) {
  const latitudeScale = 111320;
  const longitudeScale = latitudeScale * Math.cos((point.lat * Math.PI) / 180);
  const px = point.lng * longitudeScale;
  const py = point.lat * latitudeScale;
  const ax = start.lng * longitudeScale;
  const ay = start.lat * latitudeScale;
  const bx = end.lng * longitudeScale;
  const by = end.lat * latitudeScale;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const projection =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return distanceBetweenPointsMeters(point, {
    lat: (ay + projection * dy) / latitudeScale,
    lng: (ax + projection * dx) / longitudeScale
  });
}

export function isActiveHazard(hazard, now = Date.now()) {
  if (!hazard) return false;
  const windowInfo = hazard.window || {};
  if (!windowInfo.scheduled) return true;
  const start = windowInfo.start ? new Date(windowInfo.start).getTime() : NaN;
  const end = windowInfo.end ? new Date(windowInfo.end).getTime() : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    return true;
  }
  return now >= start && now <= end;
}

export function getHazardStatus(hazard, now = Date.now()) {
  if (!hazard) return 'active';
  const windowInfo = hazard.window || {};
  if (!windowInfo.scheduled) return 'active';
  const start = windowInfo.start ? new Date(windowInfo.start).getTime() : null;
  const end = windowInfo.end ? new Date(windowInfo.end).getTime() : null;
  if (end && now > end) return 'expired';
  if (start && now < start) return 'scheduled';
  return 'active';
}

export function routeTouchesHazard(route, hazard, radius = HAZARD_AVOIDANCE_RADIUS_METERS) {
  if (!route?.geometry?.coordinates || !hazard?.coordinates) return false;
  const coordinates = route.geometry.coordinates;
  const point = { lat: Number(hazard.coordinates.lat), lng: Number(hazard.coordinates.lng) };
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return false;

  for (let i = 0; i < coordinates.length; i += 1) {
    const current = { lat: coordinates[i][1], lng: coordinates[i][0] };
    if (distanceBetweenPointsMeters(point, current) <= radius) return true;
    if (i > 0) {
      const previous = { lat: coordinates[i - 1][1], lng: coordinates[i - 1][0] };
      if (distanceToSegmentMeters(point, previous, current) <= radius) return true;
    }
  }
  return false;
}

export function routeSignature(route) {
  return (route.geometry?.coordinates || [])
    .filter(
      (point) =>
        Array.isArray(point) &&
        Number.isFinite(Number(point[0])) &&
        Number.isFinite(Number(point[1]))
    )
    .map((point) => `${Number(point[0]).toFixed(5)},${Number(point[1]).toFixed(5)}`)
    .join('|');
}

export function getHazardColor(category, severity) {
  const cat = (category || '').toLowerCase();
  const sev = (severity || '').toLowerCase();
  if (sev === 'high' || cat === 'accident') return '#ef4444'; // Red
  if (sev === 'medium' || cat === 'construction' || cat === 'debris') return '#f59e0b'; // Amber / Orange
  if (cat === 'weather' || cat === 'flooding') return '#0284c7'; // Blue / Sky
  if (cat === 'police' || cat === 'speed camera') return '#8b5cf6'; // Purple
  return '#10b981'; // Green / Default
}

export function formatDuration(seconds) {
  const numericSeconds = Number(seconds);
  if (!Number.isFinite(numericSeconds) || numericSeconds < 0) return 'Time unavailable';
  const minutes = Math.max(1, Math.round(numericSeconds / 60));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
}

export function formatDistance(meters) {
  const numericMeters = Number(meters);
  if (!Number.isFinite(numericMeters) || numericMeters < 0) return '0 km';
  if (numericMeters < 1000) return `${Math.round(numericMeters)} m`;
  return `${(numericMeters / 1000).toFixed(1)} km`;
}

export async function geocodeAddress(addressQuery, nearPoint = null) {
  if (!addressQuery || !addressQuery.trim()) return null;
  try {
    const params = new URLSearchParams({
      format: 'jsonv2',
      limit: '1',
      addressdetails: '1',
      q: addressQuery.trim()
    });
    if (
      nearPoint &&
      Number.isFinite(nearPoint.lat) &&
      Number.isFinite(nearPoint.lng)
    ) {
      const span = 1;
      params.set(
        'viewbox',
        `${nearPoint.lng - span},${nearPoint.lat + span},${nearPoint.lng + span},${nearPoint.lat - span}`
      );
      params.set('bounded', '1');
    }
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?${params.toString()}`
    );
    if (!response.ok) throw new Error('Geocoder unavailable');
    const results = await response.json();
    if (!results.length) return null;
    return {
      lat: Number(results[0].lat),
      lng: Number(results[0].lon),
      name: results[0].display_name
    };
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

export async function reverseGeocodePoint(point) {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${point.lat}&lon=${point.lng}&zoom=18&addressdetails=1`
    );
    if (!response.ok) return null;
    const payload = await response.json();
    return payload.display_name || null;
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return null;
  }
}

export function getDeviceLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      (error) => {
        reject(new Error(error.message || 'Could not access your location.'));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}
