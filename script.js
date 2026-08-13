"use strict";

/* =========================================================================
   SAFENAV DASHBOARD — application script
   Each block is labelled with the curriculum topic it demonstrates.
   See the in-page "Dev Notes" panel for a rendered version of this map.
   ========================================================================= */

/* -------------------------------------------------------------------------
   1. VARIABLES (var / let / const) & DATA TYPES
   ------------------------------------------------------------------------- */
const STORAGE_KEY = "safenav.hazards";      // const: reference never reassigned
const SESSION_KEY = "safenav.lastTab";      // sessionStorage key
let activeTab = "active";                   // let: reassigned as the user clicks tabs
var appBooted = false;                      // var: function/legacy-scoped flag (kept for the demo)

// Data types on display: string, number, boolean, object, array, undefined
const appMeta = {
  name: "SafeNav",              // string
  version: 1.2,                 // number
  offline: false,                // boolean
  authors: ["Team SafeNav"],    // array (object type)
  lastSync: undefined            // undefined until first save
};

/* -------------------------------------------------------------------------
   2. TYPE CONVERSION, OPERATORS
   ------------------------------------------------------------------------- */
function toSafeNumber(value, fallback = 0) {         // default parameter (ES6)
  const n = Number(value);                            // explicit type conversion
  return Number.isNaN(n) ? fallback : n;               // logical / comparison operators
}

/* -------------------------------------------------------------------------
   3. DOM SHORTCUTS — Selecting Elements
   ------------------------------------------------------------------------- */
const $  = (sel, scope = document) => scope.querySelector(sel);   // arrow fn + default param
const $$ = (sel, scope = document) => [...scope.querySelectorAll(sel)]; // spread -> real array

const hazardListEl   = document.getElementById("hazardList");     // getElementById
const statActiveEl   = $("#statActive");
const statScheduledEl = $("#statScheduled");
const statExpiredEl  = $("#statExpired");
const tabButtons     = $$(".sn-tab");
const hazardForm     = $("#hazardForm");
const scheduleToggle = $("#hzScheduleToggle");
const scheduleFields = $("#scheduleFields");
const formAlert      = $("#formAlert");
const toastEl        = $("#snToast");
const toastMsgEl     = $("#snToastMsg");

/* -------------------------------------------------------------------------
   4. LOCAL / SESSION STORAGE — Browser Data Management
   ------------------------------------------------------------------------- */
function loadHazards() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];          // JSON handling
  } catch (err) {
    console.error("Could not read hazards from storage:", err);
    return [];
  }
}

function saveHazards(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  appMeta.lastSync = new Date().toISOString();
  sessionStorage.setItem("safenav.lastSave", appMeta.lastSync); // sessionStorage demo
}

let hazards = loadHazards();   // let: this array is mutated throughout the app's life

/* -------------------------------------------------------------------------
   5. OBJECTS, DESTRUCTURING, REST/SPREAD — creating a hazard record
   ------------------------------------------------------------------------- */
function createHazard({ title, category, severity, location, description, isScheduled, start, end }) {
  // object shorthand + nested object + spread
  return {
    id: `hz_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    title,
    category,
    severity,
    description: description || "",
    window: {                                  // nested object
      scheduled: isScheduled,
      start: isScheduled ? start : null,
      end: isScheduled ? end : null
    },
    meta: { location, reportedAt: new Date().toISOString() },
  };
}

/* -------------------------------------------------------------------------
   6. CONDITIONAL STATEMENTS + OPERATORS — status of a hazard
   ------------------------------------------------------------------------- */
function getStatus(hazard) {
  const { scheduled, start, end } = hazard.window;   // destructuring
  const now = Date.now();

  if (!scheduled) return "active";                    // simple conditional

  const startTime = start ? new Date(start).getTime() : null;
  const endTime   = end ? new Date(end).getTime() : null;

  if (endTime && now > endTime) return "expired";
  if (startTime && now < startTime) return "scheduled";
  return "active";
}

/* -------------------------------------------------------------------------
   7. HIGHER ORDER FUNCTIONS — filter / map / reduce / sort
   ------------------------------------------------------------------------- */
function groupByStatus(list) {
  // reduce(): single pass -> { active: [...], scheduled: [...], expired: [...] }
  return list.reduce((groups, hz) => {
    const status = getStatus(hz);
    groups[status].push(hz);
    return groups;
  }, { active: [], scheduled: [], expired: [] });
}

function sortBySeverity(list) {
  const rank = { High: 0, Medium: 1, Low: 2 };
  // sort(): higher severity first, stable copy via spread
  return [...list].sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/* -------------------------------------------------------------------------
   8. DOM MANIPULATION — building hazard cards, template literals
   ------------------------------------------------------------------------- */
const STATUS_ICON = { active: "bi-broadcast", scheduled: "bi-clock-history", expired: "bi-archive" };
const SEVERITY_CLASS = { Low: "sn-chip-low", Medium: "sn-chip-medium", High: "sn-chip-high" };

function timeLabel(hazard, status) {
  const { start, end } = hazard.window;
  if (status === "scheduled" && start) return `Starts ${new Date(start).toLocaleString()}`;
  if (status === "active" && end) return `Until ${new Date(end).toLocaleString()}`;
  if (status === "expired" && end) return `Ended ${new Date(end).toLocaleString()}`;
  return "No time window";
}

function buildHazardCard(hazard, status) {
  // createElement + classList — DOM Manipulation topic
  const card = document.createElement("div");
  card.className = `sn-hazard-card status-${status}`;
  card.dataset.id = hazard.id;

  card.innerHTML = `
    <div class="sn-hz-main">
      <div class="sn-hz-title">${escapeHtml(hazard.title)}</div>
      <div class="sn-hz-meta">
        <span><i class="bi ${STATUS_ICON[status]}"></i>${capitalize(status)}</span>
        <span><i class="bi bi-geo-alt"></i>${escapeHtml(hazard.meta.location)}</span>
        <span><i class="bi bi-tag"></i>${escapeHtml(hazard.category)}</span>
        <span class="sn-chip ${SEVERITY_CLASS[hazard.severity]}">${hazard.severity}</span>
        <span><i class="bi bi-clock"></i>${timeLabel(hazard, status)}</span>
      </div>
      ${hazard.description ? `<div class="sn-hz-desc">${escapeHtml(hazard.description)}</div>` : ""}
    </div>
    <div class="sn-hz-actions">
      <button class="sn-icon-btn" data-action="delete" title="Remove hazard">
        <i class="bi bi-trash3"></i>
      </button>
    </div>
  `;
  return card;
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function escapeHtml(str = "") {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderEmptyState(status) {
  const copy = {
    active: "No active hazards. Roads look clear right now.",
    scheduled: "Nothing scheduled. Time-window hazards will show up here.",
    expired: "No expired hazards yet.",
  };
  const empty = document.createElement("div");
  empty.className = "sn-empty";
  empty.innerHTML = `<i class="bi bi-cloud-slash"></i><span>${copy[status]}</span>`;
  return empty;
}

/* -------------------------------------------------------------------------
   9. RENDER PIPELINE — loops (for...of), DOM traversal / removal
   ------------------------------------------------------------------------- */
function render() {
  const groups = groupByStatus(hazards);

  // update stat cards — array length via reduce/filter results
  statActiveEl.textContent = groups.active.length;
  statScheduledEl.textContent = groups.scheduled.length;
  statExpiredEl.textContent = groups.expired.length;

  // clear existing DOM node children (DOM traversal / removal)
  while (hazardListEl.firstChild) {
    hazardListEl.removeChild(hazardListEl.firstChild);
  }

  const currentList = sortBySeverity(groups[activeTab]);

  if (currentList.length === 0) {
    hazardListEl.appendChild(renderEmptyState(activeTab));
    return;
  }

  // for...of loop building DOM nodes
  for (const hazard of currentList) {
    hazardListEl.appendChild(buildHazardCard(hazard, activeTab));
  }
}

/* -------------------------------------------------------------------------
   10. EVENT HANDLING — tabs (click), delegation, keyboard
   ------------------------------------------------------------------------- */
tabButtons.forEach((btn) => {                       // forEach — higher order function
  btn.addEventListener("click", (event) => {
    tabButtons.forEach((b) => b.classList.remove("active"));
    event.currentTarget.classList.add("active");
    activeTab = event.currentTarget.dataset.status;   // let reassigned here
    sessionStorage.setItem(SESSION_KEY, activeTab);
    render();
  });
});

// Event delegation: one listener handles every delete button, current & future
hazardListEl.addEventListener("click", (event) => {
  const btn = event.target.closest('[data-action="delete"]');
  if (!btn) return;
  const card = btn.closest(".sn-hazard-card");
  const id = card?.dataset.id;
  hazards = hazards.filter((hz) => hz.id !== id);   // filter() removes the record
  saveHazards(hazards);
  render();
  showToast("Hazard removed");
});

// Keyboard event — Esc closes the report modal even if focus is inside a field
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    const modalEl = document.getElementById("hazardModal");
    const instance = bootstrap.Modal.getInstance(modalEl);
    instance?.hide();
  }
});

/* -------------------------------------------------------------------------
   11. FORMS, VALIDATION, USER INPUT HANDLING
   ------------------------------------------------------------------------- */
scheduleToggle.addEventListener("change", (event) => {
  scheduleFields.classList.toggle("d-none", !event.target.checked);
  $("#hzStart").required = event.target.checked;
  $("#hzEnd").required = event.target.checked;
});

function validateHazardForm() {
  let isValid = true;                       // let: mutated as checks run
  hazardForm.classList.add("was-validated");

  const start = $("#hzStart").value;
  const end = $("#hzEnd").value;

  if (scheduleToggle.checked && start && end) {
    const startOk = new Date(start).getTime() < new Date(end).getTime();
    $("#hzEnd").setCustomValidity(startOk ? "" : "invalid");
    if (!startOk) isValid = false;
  }

  if (!hazardForm.checkValidity()) isValid = false;   // native form validation API

  formAlert.classList.toggle("d-none", isValid);
  if (!isValid) {
    formAlert.textContent = "Please fix the highlighted fields before submitting.";
  }
  return isValid;
}

hazardForm.addEventListener("submit", (event) => {
  event.preventDefault();                    // preventDefault() — stop native submit/reload

  if (!validateHazardForm()) return;

  // destructure form values straight off the elements
  const { value: title } = $("#hzTitle");
  const category = $("#hzCategory").value;
  const severity = $("#hzSeverity").value;
  const { value: location } = $("#hzLocation");
  const description = $("#hzDescription").value.trim();
  const isScheduled = scheduleToggle.checked;
  const start = $("#hzStart").value;
  const end = $("#hzEnd").value;

  const hazard = createHazard({ title, category, severity, location, description, isScheduled, start, end });

  hazards.push(hazard);              // push() — array method
  saveHazards(hazards);
  activeTab = getStatus(hazard);
  syncActiveTabButton();
  render();

  hazardForm.reset();
  hazardForm.classList.remove("was-validated");
  scheduleFields.classList.add("d-none");
  bootstrap.Modal.getInstance(document.getElementById("hazardModal")).hide();
  showToast("Hazard reported");
});

function syncActiveTabButton() {
  tabButtons.forEach((b) => b.classList.toggle("active", b.dataset.status === activeTab));
}

/* -------------------------------------------------------------------------
   12. TOAST HELPER — simple timed UI feedback (setTimeout)
   ------------------------------------------------------------------------- */
function showToast(message = "Done") {
  toastMsgEl.textContent = message;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 2200);
}

/* =========================================================================
   13. ASYNCHRONOUS JAVASCRIPT — Weather Advisory (Fetch API + REST + JSON)
   ========================================================================= */

// Maps Open-Meteo's numeric weather codes to a human description + hazard advice.
// Object literal used as a lookup table (avoids long if/else chains).
const WEATHER_CODES = {
  0: { label: "Clear sky", level: "ok" },
  1: { label: "Mostly clear", level: "ok" },
  2: { label: "Partly cloudy", level: "ok" },
  3: { label: "Overcast", level: "ok" },
  45: { label: "Fog", level: "warn" },
  48: { label: "Dense fog", level: "danger" },
  51: { label: "Light drizzle", level: "warn" },
  61: { label: "Rain", level: "warn" },
  63: { label: "Moderate rain", level: "warn" },
  65: { label: "Heavy rain", level: "danger" },
  71: { label: "Snow", level: "danger" },
  80: { label: "Rain showers", level: "warn" },
  95: { label: "Thunderstorm", level: "danger" },
  99: { label: "Severe thunderstorm", level: "danger" },
};

function describeWeather(code) {
  return WEATHER_CODES[code] || { label: "Unknown conditions", level: "ok" };
}

// Promise chaining example: geocode a city name to coordinates.
function geocodeCity(city) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`;
  return fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error("Geocoding service unavailable");
      return res.json();                     // JSON handling
    })
    .then((data) => {
      const place = data.results?.[0];
      if (!place) throw new Error(`Couldn't find "${city}"`);
      return { lat: place.latitude, lon: place.longitude, name: place.name, country: place.country };
    });
}

// async/await example: fetch current weather once we have coordinates.
async function fetchCurrentWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Weather service unavailable");
  const data = await res.json();
  return data.current_weather;
}

function renderWeather(place, weather) {
  const info = describeWeather(weather.weathercode);
  const adviceClass = { ok: "sn-advice-ok", warn: "sn-advice-warn", danger: "sn-advice-danger" }[info.level];
  const adviceText = {
    ok: "No road hazard suggested for these conditions.",
    warn: "Roads may be slick — consider flagging a hazard.",
    danger: "Conditions look severe — flagging a hazard is recommended.",
  }[info.level];

  const box = document.createElement("div");
  box.className = "sn-weather-card";
  box.innerHTML = `
    <div class="sn-weather-temp">${Math.round(weather.temperature)}&deg;C</div>
    <div class="sn-weather-desc">${info.label} in ${escapeHtml(place.name)}, ${escapeHtml(place.country || "")} &middot; wind ${Math.round(weather.windspeed)} km/h</div>
    <div class="sn-weather-advice ${adviceClass}"><i class="bi bi-info-circle"></i>${adviceText}</div>
    ${info.level !== "ok" ? `<button class="btn sn-btn-primary btn-sm w-100" id="quickAddHazard"><i class="bi bi-plus-lg me-1"></i>Add as Hazard</button>` : ""}
  `;

  const result = $("#weatherResult");
  result.innerHTML = "";
  result.appendChild(box);

  const quickAddBtn = $("#quickAddHazard", box);
  if (quickAddBtn) {
    quickAddBtn.addEventListener("click", () => {
      const hazard = createHazard({
        title: `${info.label} affecting routes near ${place.name}`,
        category: "Weather",
        severity: info.level === "danger" ? "High" : "Medium",
        location: place.name,
        description: `Auto-suggested from live weather data (${Math.round(weather.temperature)}\u00B0C, wind ${Math.round(weather.windspeed)} km/h).`,
        isScheduled: false,
      });
      hazards.push(hazard);
      saveHazards(hazards);
      activeTab = "active";
      syncActiveTabButton();
      render();
      showToast("Hazard added from weather advisory");
    });
  }
}

const weatherForm = $("#weatherForm");
const weatherBtn = $("#weatherBtn");
const weatherBtnText = $("#weatherBtnText");

weatherForm.addEventListener("submit", async (event) => {   // async/await on an event handler
  event.preventDefault();
  const city = $("#cityInput").value.trim();
  const resultBox = $("#weatherResult");
  if (!city) return;

  weatherBtn.disabled = true;
  weatherBtnText.innerHTML = `<span class="spinner-border spinner-border-sm"></span>`;
  resultBox.innerHTML = "";

  try {
    const place = await geocodeCity(city);              // await on a chained promise
    const weather = await fetchCurrentWeather(place.lat, place.lon); // await on async fn
    renderWeather(place, weather);
  } catch (err) {                                        // error handling
    resultBox.innerHTML = `<div class="sn-weather-error"><i class="bi bi-exclamation-triangle me-1"></i>${escapeHtml(err.message)}</div>`;
  } finally {
    weatherBtn.disabled = false;
    weatherBtnText.innerHTML = `<i class="bi bi-search"></i>`;
  }
});

/* =========================================================================
   14. DEV NOTES — rendered from data (array of objects -> map -> DOM)
   ========================================================================= */
const CONCEPT_NOTES = [
  { topic: "Variables & Data Types", body: "var / let / const are all used deliberately above — see STORAGE_KEY, activeTab, appBooted." },
  { topic: "Operators & Conditionals", body: "getStatus() uses comparison + logical operators to classify a hazard as active, scheduled, or expired." },
  { topic: "Loops", body: "render() uses a for...of loop to build hazard cards; forEach drives tab buttons and delegated listeners." },
  { topic: "Functions", body: "Mix of declarations (function render(){}), expressions, and arrow functions ($ , map callbacks) with default & rest/spread params." },
  { topic: "Arrays & Methods", body: "push(), filter(), sort(), reduce() and the spread operator all appear in the hazard pipeline." },
  { topic: "Higher-Order Functions", body: "groupByStatus() uses reduce(); sortBySeverity() uses sort(); tab wiring uses forEach()." },
  { topic: "Objects & Destructuring", body: "createHazard() builds a nested object; getStatus() destructures hazard.window in one line." },
  { topic: "DOM Selection & Manipulation", body: "querySelector/querySelectorAll (via the $ / $$ helpers) and getElementById select nodes; createElement + classList build cards." },
  { topic: "Events", body: "Click (tabs, delegated delete), submit (both forms), keydown (Esc), and change (schedule toggle) are all wired with addEventListener." },
  { topic: "Forms & Validation", body: "hazardForm uses required/minlength attributes plus custom JS checks (end-after-start) and preventDefault()." },
  { topic: "Storage", body: "localStorage persists the hazard list as JSON; sessionStorage remembers the last tab and last save time." },
  { topic: "ES6 Features", body: "Template literals, spread/rest, destructuring and default parameters are used throughout this file." },
  { topic: "Async JavaScript", body: "geocodeCity() shows Promise chaining with .then(); the weather submit handler shows async/await with try/catch/finally." },
  { topic: "Fetch API & REST", body: "Live calls to the Open-Meteo geocoding + forecast REST endpoints, with JSON parsed from each response." },
];

function renderDevNotes() {
  const grid = $("#devNotesGrid");
  const html = CONCEPT_NOTES.map(({ topic, body }) => `
    <div class="col-12 col-md-6 col-xl-4">
      <div class="sn-note">
        <div class="sn-note-topic">${escapeHtml(topic)}</div>
        <div class="sn-note-body">${escapeHtml(body)}</div>
      </div>
    </div>
  `).join("");                       // join() — another array method
  grid.innerHTML = html;
}

/* =========================================================================
   15. INIT — simulate an initial async load with a Promise, then boot the UI
   ========================================================================= */
function bootApp() {
  return new Promise((resolve) => {
    setTimeout(() => resolve(hazards), 150);   // simulated latency
  });
}

bootApp().then((initialHazards) => {
  hazards = initialHazards;
  appBooted = true;

  const savedTab = sessionStorage.getItem(SESSION_KEY);
  if (savedTab) {
    activeTab = savedTab;
    syncActiveTabButton();
  }

  renderDevNotes();
  render();
});
