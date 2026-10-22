(async () => {
  let session = null;
  try {
    session = JSON.parse(localStorage.getItem('rp_session') || 'null');
  } catch (_error) {
    session = null;
  }

  if (!session || typeof session !== 'object') {
    window.location.replace('login.html');
    return;
  }

  document.getElementById('userName').textContent = String(session.name || 'User');
  document.getElementById('userEmail').textContent = String(session.email || '');
  document.getElementById('avatar').textContent = String(session.name || '?').charAt(0).toUpperCase();

  document.getElementById('signOutBtn').addEventListener('click', () => {
    localStorage.removeItem('rp_session');
    window.location.href = 'login.html';
  });

  const body = document.body;
  const accessibilityBtn = document.getElementById('accessibilityBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const accessibilityPanel = document.getElementById('accessibilityPanel');
  const settingsPanel = document.getElementById('settingsPanel');
  const fontSelect = document.getElementById('fontSelect');
  const sizeButtons = document.querySelectorAll('.size-btn');
  const colorButtons = document.querySelectorAll('.color-btn');
  const themeButtons = document.querySelectorAll('.theme-opt');

  const FONT_CLASSES = ['font-default', 'font-readable', 'font-serif'];
  const SIZE_CLASSES = ['fs-small', 'fs-medium', 'fs-large', 'fs-xlarge'];
  const CONTRAST_CLASSES = ['contrast-high', 'contrast-warm'];

  function loadPrefs() {
    try {
      return JSON.parse(localStorage.getItem('rp_prefs') || '{}');
    } catch (e) {
      return {};
    }
  }

  function savePrefs(prefs) {
    localStorage.setItem('rp_prefs', JSON.stringify(prefs));
  }

  let prefs = Object.assign({
    font: 'font-default',
    size: 'fs-medium',
    contrast: '',
    theme: 'light'
  }, loadPrefs());

  if (!FONT_CLASSES.includes(prefs.font)) prefs.font = 'font-default';
  if (!SIZE_CLASSES.includes(prefs.size)) prefs.size = 'fs-medium';
  if (!['', ...CONTRAST_CLASSES].includes(prefs.contrast)) prefs.contrast = '';
  if (!['light', 'dark'].includes(prefs.theme)) prefs.theme = 'light';

  function applyPrefs() {
    body.classList.remove(...FONT_CLASSES, ...SIZE_CLASSES, ...CONTRAST_CLASSES, 'theme-dark');

    body.classList.add(prefs.font || 'font-default');
    body.classList.add(prefs.size || 'fs-medium');

    if (prefs.contrast) body.classList.add(prefs.contrast);
    if (prefs.theme === 'dark') body.classList.add('theme-dark');

    fontSelect.value = prefs.font || 'font-default';

    sizeButtons.forEach(b => b.classList.toggle(
      'selected',
      b.dataset.size === (prefs.size || 'fs-medium')
    ));

    colorButtons.forEach(b => b.classList.toggle(
      'selected',
      b.dataset.contrast === (prefs.contrast || '')
    ));

    themeButtons.forEach(b => b.classList.toggle(
      'selected',
      b.dataset.theme === (prefs.theme || 'light')
    ));
  }

  applyPrefs();

  function closePanels() {
    accessibilityPanel.classList.remove('open');
    settingsPanel.classList.remove('open');
    accessibilityBtn.classList.remove('active');
    settingsBtn.classList.remove('active');
  }

  accessibilityBtn.addEventListener('click', e => {
    e.stopPropagation();
    const willOpen = !accessibilityPanel.classList.contains('open');
    closePanels();

    if (willOpen) {
      accessibilityPanel.classList.add('open');
      accessibilityBtn.classList.add('active');
    }
  });

  settingsBtn.addEventListener('click', e => {
    e.stopPropagation();
    const willOpen = !settingsPanel.classList.contains('open');
    closePanels();

    if (willOpen) {
      settingsPanel.classList.add('open');
      settingsBtn.classList.add('active');
    }
  });

  document.addEventListener('click', e => {
    if (!accessibilityPanel.contains(e.target) && !settingsPanel.contains(e.target)) {
      closePanels();
    }
  });

  fontSelect.addEventListener('change', () => {
    prefs.font = fontSelect.value;
    savePrefs(prefs);
    applyPrefs();
  });

  sizeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      prefs.size = btn.dataset.size;
      savePrefs(prefs);
      applyPrefs();
    });
  });

  colorButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      prefs.contrast = btn.dataset.contrast;
      savePrefs(prefs);
      applyPrefs();
    });
  });

  themeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      prefs.theme = btn.dataset.theme;
      savePrefs(prefs);
      applyPrefs();
    });
  });

  const map = L.map('map').setView([28.6139, 77.2090], 12);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  let startCoords = null;
  let endCoords = null;
  let endLocationName = null;
  let startMarker = null;
  let endMarker = null;
  let routeLayers = [];
  let routeCandidates = [];
  let selectedRouteIndex = 0;
  let routingRequestId = 0;
  let hazardLayers = [];
  const HAZARD_AVOIDANCE_RADIUS_METERS = 100;

  function getHazardColor(category, severity) {
    const cat = (category || '').toLowerCase();
    const sev = (severity || '').toLowerCase();
    if (sev === 'high' || cat === 'accident') return '#d93025'; // Red
    if (sev === 'medium' || cat === 'construction') return '#f2994a'; // Orange
    if (cat === 'weather') return '#2f80ed'; // Blue
    if (cat === 'police' || cat === 'speed camera') return '#9b51e0'; // Purple
    return '#27ae60'; // Green / Default
  }

  async function geocodeAddress(addressQuery) {
    if (!addressQuery) return null;
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=${encodeURIComponent(addressQuery)}`);
      if (!response.ok) throw new Error('Geocoder unavailable');
      const results = await response.json();
      if (!results.length) return null;
      return { lat: Number(results[0].lat), lng: Number(results[0].lon), name: results[0].display_name };
    } catch (error) { console.error('Geocoding error:', error); return null; }
  }

  document.getElementById('startGpsBtn').addEventListener('click', () => {
    document.getElementById('startInput').placeholder = 'Locating via device GPS...';
    map.locate({ setView: true, maxZoom: 15 });
  });
  map.on('locationfound', event => {
    startCoords = event.latlng;
    document.getElementById('startInput').value = 'Current location';
    document.getElementById('startInput').placeholder = 'Choose starting point...';
    if (startMarker) map.removeLayer(startMarker);
    startMarker = L.marker(startCoords).addTo(map).bindPopup('Your current location').openPopup();
  });
  map.on('locationerror', () => {
    alert('Could not access browser location permissions.');
    document.getElementById('startInput').placeholder = 'Choose starting point...';
  });

  function isActiveHazard(hazard) {
    const windowInfo = hazard.window || {};
    if (!windowInfo.scheduled) return true;
    const now = Date.now();
    const start = windowInfo.start ? new Date(windowInfo.start).getTime() : null;
    const end = windowInfo.end ? new Date(windowInfo.end).getTime() : null;
    return !(end && now > end) && !(start && now < start);
  }
  function distanceBetweenPointsMeters(a, b) {
    const earthRadius = 6371000;
    const lat1 = a.lat * Math.PI / 180, lat2 = b.lat * Math.PI / 180;
    const dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * earthRadius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
  function distanceToSegmentMeters(point, start, end) {
    const latitudeScale = 111320;
    const longitudeScale = latitudeScale * Math.cos(point.lat * Math.PI / 180);
    const px = point.lng * longitudeScale, py = point.lat * latitudeScale;
    const ax = start.lng * longitudeScale, ay = start.lat * latitudeScale;
    const bx = end.lng * longitudeScale, by = end.lat * latitudeScale;
    const dx = bx - ax, dy = by - ay, lengthSquared = dx * dx + dy * dy;
    const projection = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
    return distanceBetweenPointsMeters(point, { lat: (ay + projection * dy) / latitudeScale, lng: (ax + projection * dx) / longitudeScale });
  }
  function routeTouchesHazard(route, hazard) {
    const coordinates = route.geometry?.coordinates || [];
    const point = L.latLng(hazard.coordinates.lat, hazard.coordinates.lng);
    for (let i = 0; i < coordinates.length; i += 1) {
      const current = L.latLng(coordinates[i][1], coordinates[i][0]);
      if (distanceBetweenPointsMeters(point, current) <= HAZARD_AVOIDANCE_RADIUS_METERS) return true;
      if (i > 0) {
        const previous = L.latLng(coordinates[i - 1][1], coordinates[i - 1][0]);
        if (distanceToSegmentMeters(point, previous, current) <= HAZARD_AVOIDANCE_RADIUS_METERS) return true;
      }
    }
    return false;
  }
  function routeSignature(route) {
    return (route.geometry?.coordinates || []).filter(point => Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]))).map(point => `${Number(point[0]).toFixed(5)},${Number(point[1]).toFixed(5)}`).join('|');
  }
  async function loadActiveHazards() {
    const response = await fetch('/api/hazards');
    if (!response.ok) throw new Error('Could not load hazards before routing.');
    const payload = await response.json();
    return (payload.data || []).filter(hazard => isActiveHazard(hazard) && hazard.coordinates && Number.isFinite(Number(hazard.coordinates.lat)) && Number.isFinite(Number(hazard.coordinates.lng)));
  }
  function formatDuration(seconds) {
    const numericSeconds = Number(seconds);
    if (!Number.isFinite(numericSeconds) || numericSeconds < 0) return 'Time unavailable';
    const minutes = Math.max(1, Math.round(numericSeconds / 60));
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
  }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }
  function routeLabel(route, index) {
    const fastest = routeCandidates.reduce((best, item) => item.duration < best.duration ? item : best, routeCandidates[0]);
    const shortest = routeCandidates.reduce((best, item) => item.distance < best.distance ? item : best, routeCandidates[0]);
    if (route === fastest && route === shortest) return 'Fastest & shortest';
    if (route === fastest) return 'Fastest';
    if (route === shortest) return 'Shortest';
    if (index === 0) return 'Best overall';
    return `Alternative ${index}`;
  }
  function clearRouteLayers() { routeLayers.forEach(layer => map.removeLayer(layer)); routeLayers = []; }
  function updateRouteSelection(index) {
    if (!Number.isInteger(index) || index < 0 || index >= routeCandidates.length) return;
    selectedRouteIndex = index;
    routeLayers.forEach((layer, layerIndex) => layer.setStyle({ color: layerIndex === index ? '#1a73e8' : '#7aa7e8', opacity: layerIndex === index ? .95 : .42, weight: layerIndex === index ? 7 : 5 }));
    routeLayers[index]?.bringToFront();
    document.querySelectorAll('.route-option').forEach((card, cardIndex) => card.classList.toggle('selected', cardIndex === index));
    renderSelectedRoute(routeCandidates[index]);
  }
  function renderRouteOptions() {
    return routeCandidates.map((route, index) => `
      <button class="route-option${index === selectedRouteIndex ? ' selected' : ''}" type="button" data-route-index="${index}">
        <span class="route-option-top"><strong>${formatDuration(route.duration)}</strong><span class="route-badge">${escapeHtml(routeLabel(route, index))}</span></span>
        <span class="route-option-meta">${(route.distance / 1000).toFixed(1)} km · ${route.hazardCount === 0 ? 'Hazard-free' : `${route.hazardCount} hazard${route.hazardCount === 1 ? '' : 's'} on route`}</span>
      </button>`).join('');
  }
  function renderSelectedRoute(route) {
    if (!route) return;
    const steps = (Array.isArray(route.legs) ? route.legs : [])
      .flatMap(leg => Array.isArray(leg.steps) ? leg.steps : [])
      .filter(step => step && (step.name || step.maneuver));
    const directions = steps.map(step => {
      const instruction = step.maneuver?.instruction || step.name || 'Continue';
      const name = step.name && !instruction.toLowerCase().includes(String(step.name).toLowerCase())
        ? ` via <b>${escapeHtml(step.name)}</b>`
        : '';
      const distance = Number.isFinite(Number(step.distance)) ? Math.round(Number(step.distance)) : 0;
      return `<li><span class="step-icon">${step.maneuver?.type === 'arrive' ? '●' : '↗'}</span><span>${escapeHtml(instruction)}${name}<small>${distance} m</small></span></li>`;
    }).join('');

    const hasHazards = route.hazardCount > 0;
    const summaryBadge = hasHazards
      ? `<span class="route-check" style="color:var(--danger)">⚠ Caution</span>`
      : `<span class="route-check">✓ Safe</span>`;
    const summaryText = hasHazards
      ? `${(route.distance / 1000).toFixed(1)} km · <span style="color:var(--danger)">Passes ${route.hazardCount} active hazard${route.hazardCount === 1 ? '' : 's'}</span>`
      : `${(route.distance / 1000).toFixed(1)} km · Avoids all active hazards`;
    const routeComparison = routeCandidates.length > 1
      ? `<div class="route-options-label">Compare routes</div><div class="route-options">${renderRouteOptions()}</div>`
      : '';

    document.getElementById('directionsContainer').innerHTML = `
      <div class="route-summary"><div><span class="route-kicker">RECOMMENDED ROUTE</span><h3>${formatDuration(route.duration)}</h3><p>${summaryText}</p></div>${summaryBadge}</div>
      ${routeComparison}
      <div class="directions-title">Turn-by-turn directions</div><ol class="turn-list">${directions || '<li>Follow the highlighted route to your destination.</li>'}</ol>`;
    document.querySelectorAll('.route-option').forEach(card => card.addEventListener('click', () => updateRouteSelection(Number(card.dataset.routeIndex))));
  }
  async function requestDijkstraRoutes(activeHazards) {
    const response = await fetch('/api/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start: { lat: startCoords.lat, lng: startCoords.lng },
        end: { lat: endCoords.lat, lng: endCoords.lng },
        hazards: activeHazards
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Routing service unavailable.');
    if (!payload.data?.length) throw new Error('No safe route was found around the active hazards.');
    return payload.data;
  }
  async function calculateAndDisplayRoute(additionalHazards = []) {
    const requestId = ++routingRequestId;
    const directionsContainer = document.getElementById('directionsContainer');
    directionsContainer.innerHTML = '<div class="route-loading"><span class="loading-dot"></span> Checking live route alternatives and marked hazards…</div>';
    clearRouteLayers();
    try {
      const loadedHazards = await loadActiveHazards();
      const activeHazards = [...new Map(
        [...loadedHazards, ...additionalHazards]
          .filter(hazard => hazard && isActiveHazard(hazard) && hazard.coordinates
            && Number.isFinite(Number(hazard.coordinates.lat))
            && Number.isFinite(Number(hazard.coordinates.lng)))
          .map(hazard => [
            hazard.id || `${Number(hazard.coordinates.lat).toFixed(6)},${Number(hazard.coordinates.lng).toFixed(6)}`,
            hazard
          ])
      ).values()];
      if (requestId !== routingRequestId) return;
      const routes = await requestDijkstraRoutes(activeHazards);
      if (requestId !== routingRequestId) return;

      const evaluatedRoutes = routes.map(route => ({
        ...route,
        hazardCount: activeHazards.filter(hazard => routeTouchesHazard(route, hazard)).length
      })).filter(route => Array.isArray(route.geometry?.coordinates) && route.geometry.coordinates.length > 0);

      if (!evaluatedRoutes.length) {
        directionsContainer.innerHTML = '<div class="directions-placeholder route-error"><b>No route found.</b><br>Could not generate a path on the road graph.</div>';
        return;
      }

      const uniqueRoutes = [...new Map(evaluatedRoutes.map(route => [routeSignature(route), route])).values()];
      routeCandidates = uniqueRoutes.sort((a, b) => (a.hazardCount - b.hazardCount) || (a.duration - b.duration)).slice(0, 3);
      selectedRouteIndex = 0;
      routeLayers = routeCandidates.map((route, index) => L.geoJSON(route.geometry, { style: { color: index === 0 ? '#1a73e8' : '#7aa7e8', opacity: index === 0 ? .95 : .42, weight: index === 0 ? 7 : 5, lineCap: 'round', lineJoin: 'round' }, interactive: true }).addTo(map));
      routeLayers.forEach((layer, index) => layer.on('click', () => updateRouteSelection(index)));
      routeLayers[0]?.bringToFront();
      renderSelectedRoute(routeCandidates[0]);
      const selectedGeometry = routeCandidates[0].geometry.coordinates.map(point => L.latLng(point[1], point[0]));
      map.fitBounds(L.latLngBounds(selectedGeometry), { padding: [55, 55], maxZoom: 15 });
    } catch (error) {
      if (requestId !== routingRequestId) return;
      directionsContainer.innerHTML = `<div class="directions-placeholder route-error"><b>Could not calculate a route.</b><br>${escapeHtml(error.message)} Please try again in a moment.</div>`;
    }
  }

  document.getElementById('routeBtn').addEventListener('click', async () => {
    const startInput = document.getElementById('startInput');
    const endInput = document.getElementById('endInput');
    const startQuery = startInput.value.trim();
    const endQuery = endInput.value.trim();
    if (!endQuery) { alert('Please enter a destination.'); return; }
    if (!startCoords && startQuery) {
      const resolvedStart = await geocodeAddress(startQuery);
      if (!resolvedStart) { alert('Could not resolve the starting point.'); return; }
      startCoords = L.latLng(resolvedStart.lat, resolvedStart.lng);
      if (startMarker) map.removeLayer(startMarker);
      startMarker = L.marker(startCoords).addTo(map).bindPopup(`Start: ${escapeHtml(resolvedStart.name)}`);
    }
    if (!startCoords) { alert('Please enter a starting point or use GPS.'); return; }
    if (!endCoords) {
      const resolvedEnd = await geocodeAddress(endQuery);
      if (!resolvedEnd) { alert('Could not resolve the destination.'); return; }
      endCoords = L.latLng(resolvedEnd.lat, resolvedEnd.lng);
      endLocationName = resolvedEnd.name;
    }
    if (endMarker) map.removeLayer(endMarker);
    endMarker = L.marker(endCoords).addTo(map).bindPopup(`Destination: ${escapeHtml(endLocationName || endQuery)}`).openPopup();
    await calculateAndDisplayRoute();
  });

  document.getElementById('startInput').addEventListener('input', () => {
    startCoords = null;
    if (startMarker) map.removeLayer(startMarker);
    startMarker = null;
  });
  document.getElementById('endInput').addEventListener('input', () => {
    endCoords = null;
    endLocationName = null;
    if (endMarker) map.removeLayer(endMarker);
    endMarker = null;
  });

  document.getElementById('clearBtn').addEventListener('click', () => {
    routingRequestId += 1; clearRouteLayers(); routeCandidates = [];
    if (startMarker) map.removeLayer(startMarker); if (endMarker) map.removeLayer(endMarker);
    startCoords = null; endCoords = null; startMarker = null; endMarker = null; selectedRouteIndex = 0;
    endLocationName = null;
    document.getElementById('startInput').value = ''; document.getElementById('endInput').value = '';
    resetPlaceholder(); map.flyTo([28.6139, 77.2090], 12);
  });
  function resetPlaceholder() { document.getElementById('directionsContainer').innerHTML = '<div class="directions-placeholder" id="placeholderText">Enter a start address and a destination location above, then click <b>Navigate</b> to compare live routes.</div>'; }

  // Global handler to delete a hazard via API and refresh routes
  window.deleteHazard = async function (hazardId) {
    if (!confirm('Are you sure you want to remove this hazard?')) return;
    try {
      const response = await fetch(`/api/hazards/${hazardId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Could not delete hazard.');
      await loadReportedHazards();
      if (startCoords && endCoords) {
        await calculateAndDisplayRoute();
      }
    } catch (error) {
      alert(error.message);
    }
  };

  const mapHazardModal = document.getElementById('mapHazardModal');
  const mapHazardForm = document.getElementById('mapHazardForm');
  const mapHazardCoordinates = document.getElementById('mapHazardCoordinates');
  const mapHazardHelp = document.getElementById('mapHazardHelp');
  const mapHazardLocation = document.getElementById('mapHazardLocation');
  const mapHazardScheduleToggle = document.getElementById('mapHazardScheduleToggle');
  const mapHazardScheduleFields = document.getElementById('mapHazardScheduleFields');
  let selectedHazardPoint = null;
  let hazardMarker = null;

  async function reverseGeocodePoint(point) {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${point.lat}&lon=${point.lng}&zoom=18&addressdetails=1`);
      if (!response.ok) return null;
      const payload = await response.json();
      return payload.display_name || null;
    } catch (error) { return null; }
  }

  function getDeviceLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error('Location is not supported by this browser.')); return; }
      navigator.geolocation.getCurrentPosition(
        position => resolve(L.latLng(position.coords.latitude, position.coords.longitude)),
        () => reject(new Error('Could not access your location. You can click the map to choose one.')),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  }

  async function openHazardReport(point = null) {
    mapHazardForm.reset();
    mapHazardScheduleFields.hidden = true;
    mapHazardScheduleToggle.checked = false;
    document.getElementById('mapHazardStart').required = false;
    document.getElementById('mapHazardEnd').required = false;
    selectedHazardPoint = null;
    mapHazardLocation.value = 'Locating your current position...';
    mapHazardHelp.style.color = '';
    mapHazardModal.classList.add('open');
    mapHazardModal.setAttribute('aria-hidden', 'false');
    document.getElementById('mapHazardCategory').focus();
    try {
      const locationPoint = point || await getDeviceLocation();
      setHazardPoint(locationPoint);
      if (!point) map.flyTo(locationPoint, Math.max(map.getZoom(), 15));
      const address = await reverseGeocodePoint(locationPoint);
      mapHazardLocation.value = address || `Current location (${locationPoint.lat.toFixed(5)}, ${locationPoint.lng.toFixed(5)})`;
    } catch (error) {
      if (point) setHazardPoint(point);
      mapHazardLocation.value = point ? `Map pin (${point.lat.toFixed(5)}, ${point.lng.toFixed(5)})` : '';
      mapHazardHelp.textContent = error.message;
      mapHazardHelp.style.color = 'var(--danger)';
    }
  }

  function closeHazardReport() {
    mapHazardModal.classList.remove('open');
    mapHazardModal.setAttribute('aria-hidden', 'true');
  }

  function setHazardPoint(point) {
    selectedHazardPoint = L.latLng(point.lat, point.lng);
    mapHazardCoordinates.textContent = `Pinned location: ${selectedHazardPoint.lat.toFixed(5)}, ${selectedHazardPoint.lng.toFixed(5)}`;
    mapHazardHelp.textContent = 'This report will be attached to the pinned map location.';
    if (!mapHazardLocation.value || mapHazardLocation.value === 'Locating your current position...') mapHazardLocation.value = `Current location (${selectedHazardPoint.lat.toFixed(5)}, ${selectedHazardPoint.lng.toFixed(5)})`;
    if (hazardMarker) map.removeLayer(hazardMarker);
    hazardMarker = L.marker(selectedHazardPoint).addTo(map).bindPopup('Hazard location selected').openPopup();
  }

  document.getElementById('mapReportBtn').addEventListener('click', () => openHazardReport());
  document.getElementById('closeMapHazard').addEventListener('click', closeHazardReport);
  document.getElementById('cancelMapHazard').addEventListener('click', closeHazardReport);
  mapHazardModal.addEventListener('click', event => { if (event.target === mapHazardModal) closeHazardReport(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && mapHazardModal.classList.contains('open')) closeHazardReport(); });
  mapHazardScheduleToggle.addEventListener('change', () => {
    mapHazardScheduleFields.hidden = !mapHazardScheduleToggle.checked;
    document.getElementById('mapHazardStart').required = mapHazardScheduleToggle.checked;
    document.getElementById('mapHazardEnd').required = mapHazardScheduleToggle.checked;
  });

  map.on('click', event => { if (!mapHazardModal.classList.contains('open')) openHazardReport(event.latlng); });

  mapHazardForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!selectedHazardPoint) {
      mapHazardHelp.textContent = 'Choose a location before submitting this report.';
      mapHazardHelp.style.color = 'var(--danger)';
      return;
    }
    const start = document.getElementById('mapHazardStart').value;
    const end = document.getElementById('mapHazardEnd').value;
    if (!mapHazardForm.checkValidity() || (mapHazardScheduleToggle.checked && start && end && new Date(start) >= new Date(end))) {
      mapHazardHelp.textContent = 'Please complete the required fields and make sure the time window is valid.';
      mapHazardHelp.style.color = 'var(--danger)';
      return;
    }

    const submitButton = mapHazardForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    try {
      const response = await fetch('/api/hazards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: document.getElementById('mapHazardTitleInput').value.trim(),
          category: document.getElementById('mapHazardCategory').value,
          severity: document.getElementById('mapHazardSeverity').value,
          location: mapHazardLocation.value.trim(),
          description: document.getElementById('mapHazardDescription').value.trim(),
          coordinates: { lat: selectedHazardPoint.lat, lng: selectedHazardPoint.lng },
          window: { scheduled: mapHazardScheduleToggle.checked, start: mapHazardScheduleToggle.checked ? start : null, end: mapHazardScheduleToggle.checked ? end : null }
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not save hazard');
      const savedHazard = payload.data;
      mapHazardForm.reset();
      closeHazardReport();
      if (hazardMarker) map.removeLayer(hazardMarker);
      hazardMarker = null;
      selectedHazardPoint = null;

      // Automatically recalculate routes when a new hazard is added between locations
      if (startCoords && endCoords) {
        await Promise.all([
          loadReportedHazards(),
          calculateAndDisplayRoute(savedHazard ? [savedHazard] : [])
        ]);
      } else {
        await loadReportedHazards();
      }
    } catch (error) {
      mapHazardHelp.textContent = error.message;
      mapHazardHelp.style.color = 'var(--danger)';
    } finally { submitButton.disabled = false; }
  });

  async function loadReportedHazards() {
    try {
      // Clear existing hazard markers to prevent duplicate stacking
      hazardLayers.forEach(layer => map.removeLayer(layer));
      hazardLayers = [];

      const response = await fetch('/api/hazards');
      if (!response.ok) return;
      const payload = await response.json();
      (payload.data || []).filter(hazard => hazard.coordinates).forEach(hazard => {
        const point = L.latLng(hazard.coordinates.lat, hazard.coordinates.lng);
        const color = getHazardColor(hazard.category, hazard.severity);
        const popupHtml = `
          <div>
            <b>${escapeHtml(hazard.title)}</b><br>
            Category: ${escapeHtml(hazard.category)}<br>
            Severity: ${escapeHtml(hazard.severity)}<br>
            <button onclick="window.deleteHazard('${hazard.id}')" style="margin-top:8px;background:#d93025;color:#fff;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:12px;">
              Delete Hazard
            </button>
          </div>
        `;
        const marker = L.circleMarker(point, { radius: 8, color: color, fillColor: color, fillOpacity: 0.85, weight: 2 })
          .addTo(map)
          .bindPopup(popupHtml);
        hazardLayers.push(marker);
      });
    } catch (error) { console.warn('Could not load reported hazards:', error); }
  }

  loadReportedHazards();
})();
