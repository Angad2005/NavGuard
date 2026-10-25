import { apiFetch } from './api';

export async function fetchWeatherForPoint(point) {
  const params = new URLSearchParams({
    lat: String(point.lat),
    lng: String(point.lng)
  });
  const response = await apiFetch(`/api/weather?${params}`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Could not load live weather.');
  }
  return payload.data;
}
