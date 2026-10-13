const API_BASE = '/api';
const SESSION_KEY = 'rp_session';
let activeTab = 'active';
let hazards = [];

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const hazardListEl = $('#hazardList');
const statActiveEl = $('#statActive');
const statScheduledEl = $('#statScheduled');
const statExpiredEl = $('#statExpired');
const tabButtons = $$('.sn-tab');
const hazardForm = $('#hazardForm');
const scheduleToggle = $('#hzScheduleToggle');
const scheduleFields = $('#scheduleFields');
const formAlert = $('#formAlert');
const toastEl = $('#snToast');
const toastMsgEl = $('#snToastMsg');

function getStatus(hazard) {
  const windowInfo = hazard.window || {};
  if (!windowInfo.scheduled) return 'active';
  const now = Date.now();
  const start = windowInfo.start ? new Date(windowInfo.start).getTime() : null;
  const end = windowInfo.end ? new Date(windowInfo.end).getTime() : null;
  if (end && now > end) return 'expired';
  if (start && now < start) return 'scheduled';
  return 'active';
}

function groupByStatus(list) {
  return list.reduce((groups, hazard) => {
    groups[getStatus(hazard)].push(hazard);
    return groups;
  }, { active: [], scheduled: [], expired: [] });
}

function sortBySeverity(list) {
  const rank = { High: 0, Medium: 1, Low: 2 };
  return [...list].sort((a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3));
}

function escapeHtml(value = '') {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

function hazardLocation(hazard) {
  return hazard.location || (hazard.coordinates ? `${hazard.coordinates.lat.toFixed(5)}, ${hazard.coordinates.lng.toFixed(5)}` : 'Unknown location');
}

function timeLabel(hazard, status) {
  const { start, end } = hazard.window || {};
  if (status === 'scheduled' && start) return `Starts ${new Date(start).toLocaleString()}`;
  if (status === 'active' && end) return `Until ${new Date(end).toLocaleString()}`;
  if (status === 'expired' && end) return `Ended ${new Date(end).toLocaleString()}`;
  return 'No time window';
}

function buildHazardCard(hazard, status) {
  const card = document.createElement('div');
  const severityClass = { Low: 'sn-chip-low', Medium: 'sn-chip-medium', High: 'sn-chip-high' }[hazard.severity] || 'sn-chip-medium';
  const icon = { active: 'bi-broadcast', scheduled: 'bi-clock-history', expired: 'bi-archive' }[status];
  card.className = `sn-hazard-card status-${status}`;
  card.dataset.id = hazard.id;
  card.innerHTML = `
    <div class="sn-hz-main">
      <div class="sn-hz-title">${escapeHtml(hazard.title)}</div>
      <div class="sn-hz-meta">
        <span><i class="bi ${icon}"></i>${status[0].toUpperCase() + status.slice(1)}</span>
        <span><i class="bi bi-geo-alt"></i>${escapeHtml(hazardLocation(hazard))}</span>
        <span><i class="bi bi-tag"></i>${escapeHtml(hazard.category)}</span>
        <span class="sn-chip ${severityClass}">${escapeHtml(hazard.severity)}</span>
        <span><i class="bi bi-clock"></i>${timeLabel(hazard, status)}</span>
      </div>
      ${hazard.description ? `<div class="sn-hz-desc">${escapeHtml(hazard.description)}</div>` : ''}
    </div>
    <div class="sn-hz-actions"><button class="sn-icon-btn" data-action="delete" title="Remove hazard" aria-label="Remove hazard"><i class="bi bi-trash3"></i></button></div>`;
  return card;
}

function render() {
  const groups = groupByStatus(hazards);
  statActiveEl.textContent = groups.active.length;
  statScheduledEl.textContent = groups.scheduled.length;
  statExpiredEl.textContent = groups.expired.length;
  hazardListEl.replaceChildren();
  const current = sortBySeverity(groups[activeTab]);
  if (!current.length) {
    const empty = document.createElement('div');
    empty.className = 'sn-empty';
    empty.innerHTML = `<i class="bi bi-cloud-slash"></i><span>${({ active: 'No active hazards. Roads look clear right now.', scheduled: 'Nothing scheduled. Time-window hazards will show up here.', expired: 'No expired hazards yet.' })[activeTab]}</span>`;
    hazardListEl.appendChild(empty);
    return;
  }
  current.forEach(hazard => hazardListEl.appendChild(buildHazardCard(hazard, activeTab)));
}

async function fetchHazards() {
  const response = await fetch(`${API_BASE}/hazards`);
  if (!response.ok) throw new Error('Could not load hazards from the backend.');
  const payload = await response.json();
  hazards = Array.isArray(payload.data) ? payload.data : [];
  render();
}

async function createHazard(data) {
  const response = await fetch(`${API_BASE}/hazards`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Could not save hazard.');
  hazards.push(payload.data);
  return payload.data;
}

async function deleteHazard(id) {
  const response = await fetch(`${API_BASE}/hazards/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Could not remove hazard.');
  hazards = hazards.filter(hazard => hazard.id !== id);
}

function showToast(message = 'Done') {
  toastMsgEl.textContent = message;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 2200);
}

tabButtons.forEach(button => button.addEventListener('click', () => {
  tabButtons.forEach(item => item.classList.remove('active'));
  button.classList.add('active');
  activeTab = button.dataset.status;
  sessionStorage.setItem(SESSION_KEY, activeTab);
  render();
}));

hazardListEl.addEventListener('click', async event => {
  const button = event.target.closest('[data-action="delete"]');
  if (!button) return;
  try {
    await deleteHazard(button.closest('.sn-hazard-card').dataset.id);
    render();
    showToast('Hazard removed');
  } catch (error) { showToast(error.message); }
});

scheduleToggle.addEventListener('change', event => {
  scheduleFields.classList.toggle('d-none', !event.target.checked);
  $('#hzStart').required = event.target.checked;
  $('#hzEnd').required = event.target.checked;
});

hazardForm.addEventListener('submit', async event => {
  event.preventDefault();
  hazardForm.classList.add('was-validated');
  const start = $('#hzStart').value;
  const end = $('#hzEnd').value;
  $('#hzEnd').setCustomValidity(scheduleToggle.checked && start && end && new Date(start) >= new Date(end) ? 'invalid' : '');
  if (!hazardForm.checkValidity()) {
    formAlert.textContent = 'Please fix the highlighted fields before submitting.';
    formAlert.classList.remove('d-none');
    return;
  }
  try {
    const hazard = await createHazard({
      title: $('#hzTitle').value.trim(), category: $('#hzCategory').value, severity: $('#hzSeverity').value,
      location: $('#hzLocation').value.trim(), description: $('#hzDescription').value.trim(),
      window: { scheduled: scheduleToggle.checked, start: scheduleToggle.checked ? start : null, end: scheduleToggle.checked ? end : null }
    });
    activeTab = getStatus(hazard);
    tabButtons.forEach(button => button.classList.toggle('active', button.dataset.status === activeTab));
    render();
    hazardForm.reset();
    hazardForm.classList.remove('was-validated');
    scheduleFields.classList.add('d-none');
    formAlert.classList.add('d-none');
    bootstrap.Modal.getInstance($('#hazardModal')).hide();
    showToast('Hazard reported to backend');
  } catch (error) { formAlert.textContent = error.message; formAlert.classList.remove('d-none'); }
});

const WEATHER_CODES = { 0: ['Clear sky', 'ok'], 1: ['Mostly clear', 'ok'], 2: ['Partly cloudy', 'ok'], 3: ['Overcast', 'ok'], 45: ['Fog', 'warn'], 48: ['Dense fog', 'danger'], 51: ['Light drizzle', 'warn'], 61: ['Rain', 'warn'], 63: ['Moderate rain', 'warn'], 65: ['Heavy rain', 'danger'], 71: ['Snow', 'danger'], 80: ['Rain showers', 'warn'], 95: ['Thunderstorm', 'danger'], 99: ['Severe thunderstorm', 'danger'] };
function describeWeather(code) { const [label, level] = WEATHER_CODES[code] || ['Unknown conditions', 'ok']; return { label, level }; }
async function geocodeCity(city) { const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`); if (!response.ok) throw new Error('Geocoding service unavailable'); const data = await response.json(); const place = data.results?.[0]; if (!place) throw new Error(`Could not find "${city}"`); return { lat: place.latitude, lon: place.longitude, name: place.name, country: place.country }; }
async function fetchCurrentWeather(lat, lon) { const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`); if (!response.ok) throw new Error('Weather service unavailable'); return (await response.json()).current_weather; }

function renderWeather(place, weather) {
  const info = describeWeather(weather.weathercode);
  const result = $('#weatherResult');
  result.innerHTML = `<div class="sn-weather-card"><div class="sn-weather-temp">${Math.round(weather.temperature)}&deg;C</div><div class="sn-weather-desc">${escapeHtml(info.label)} in ${escapeHtml(place.name)}, ${escapeHtml(place.country || '')} &middot; wind ${Math.round(weather.windspeed)} km/h</div><div class="sn-weather-advice sn-advice-${info.level}"><i class="bi bi-info-circle"></i>${info.level === 'ok' ? 'No road hazard suggested for these conditions.' : info.level === 'danger' ? 'Conditions look severe — flagging a hazard is recommended.' : 'Roads may be slick — consider flagging a hazard.'}</div>${info.level !== 'ok' ? '<button class="btn sn-btn-primary btn-sm w-100" id="quickAddHazard"><i class="bi bi-plus-lg me-1"></i>Add as Hazard</button>' : ''}</div>`;
  $('#quickAddHazard', result)?.addEventListener('click', async () => {
    try { const hazard = await createHazard({ title: `${info.label} affecting routes near ${place.name}`, category: 'Weather', severity: info.level === 'danger' ? 'High' : 'Medium', location: place.name, description: `Suggested from live weather data (${Math.round(weather.temperature)}°C, wind ${Math.round(weather.windspeed)} km/h).`, window: { scheduled: false } }); activeTab = getStatus(hazard); render(); showToast('Hazard added from weather advisory'); } catch (error) { showToast(error.message); }
  });
}

$('#weatherForm').addEventListener('submit', async event => {
  event.preventDefault(); const city = $('#cityInput').value.trim(); if (!city) return;
  const button = $('#weatherBtn'); button.disabled = true; $('#weatherBtnText').innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; $('#weatherResult').innerHTML = '';
  try { const place = await geocodeCity(city); renderWeather(place, await fetchCurrentWeather(place.lat, place.lon)); }
  catch (error) { $('#weatherResult').innerHTML = `<div class="sn-weather-error"><i class="bi bi-exclamation-triangle me-1"></i>${escapeHtml(error.message)}</div>`; }
  finally { button.disabled = false; $('#weatherBtnText').innerHTML = '<i class="bi bi-search"></i>'; }
});

(async function bootApp() {
  const savedTab = sessionStorage.getItem(SESSION_KEY);
  if (savedTab && ['active', 'scheduled', 'expired'].includes(savedTab)) { activeTab = savedTab; tabButtons.forEach(button => button.classList.toggle('active', button.dataset.status === activeTab)); }
  try { await fetchHazards(); } catch (error) { hazardListEl.innerHTML = `<div class="sn-empty"><i class="bi bi-wifi-off"></i><span>${escapeHtml(error.message)}</span></div>`; }
})();
