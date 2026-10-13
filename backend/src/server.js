'use strict';

const express = require('express');
const path = require('path');
const { randomUUID } = require('crypto');
const { calculateDijkstraRoutes } = require('./dijkstra-router');

const app = express();
const PORT = Number.parseInt(process.env.PORT, 10) || 3000;
const frontendPath = path.resolve(__dirname, '..', '..', 'frontend');
const MAX_JSON_BYTES = '100kb';
const MAX_TITLE_LENGTH = 160;
const MAX_CATEGORY_LENGTH = 80;
const MAX_SEVERITY_LENGTH = 40;
const MAX_LOCATION_LENGTH = 300;
const MAX_DESCRIPTION_LENGTH = 2000;

const hazards = [];

app.disable('x-powered-by');
app.use(express.json({ limit: MAX_JSON_BYTES, strict: true }));
app.use(express.static(frontendPath, { index: false }));

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseCoordinate(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizePoint(point) {
  if (!isPlainObject(point)) return null;

  const lat = parseCoordinate(point.lat);
  const lng = parseCoordinate(point.lng);
  if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }
  return { lat, lng };
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function isHazardActive(hazard, now = Date.now()) {
  const schedule = hazard.window || {};
  if (!schedule.scheduled) return true;

  const start = schedule.start ? Date.parse(schedule.start) : NaN;
  const end = schedule.end ? Date.parse(schedule.end) : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return false;
  return now >= start && now <= end;
}

function normalizeHazardForRouting(hazard) {
  if (!isPlainObject(hazard)) return null;
  const coordinates = normalizePoint(hazard.coordinates);
  if (!coordinates) return null;
  return {
    id: typeof hazard.id === 'string' ? hazard.id : undefined,
    coordinates,
    window: isPlainObject(hazard.window) ? hazard.window : { scheduled: false }
  };
}

function combineRoutingHazards(requestedHazards) {
  const all = [...hazards, ...(Array.isArray(requestedHazards) ? requestedHazards : [])];
  const seen = new Set();
  const active = [];

  for (const rawHazard of all) {
    const hazard = normalizeHazardForRouting(rawHazard);
    if (!hazard || !isHazardActive(hazard)) continue;

    const key = hazard.id || `${hazard.coordinates.lat.toFixed(6)},${hazard.coordinates.lng.toFixed(6)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    active.push(hazard);
  }

  return active;
}

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'naviguard-api',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/hazards', (_req, res) => {
  res.json({ data: hazards });
});

app.post('/api/route', async (req, res, next) => {
  try {
    const body = isPlainObject(req.body) ? req.body : {};
    const start = normalizePoint(body.start);
    const end = normalizePoint(body.end);

    if (!start || !end) {
      return res.status(400).json({
        error: 'start.lat, start.lng, end.lat, and end.lng must be valid coordinates.'
      });
    }

    const activeHazards = combineRoutingHazards(body.hazards);
    const routes = await calculateDijkstraRoutes(start, end, activeHazards, 3);

    const engine = routes[0]?.engine || 'dijkstra';
    return res.json({
      data: routes,
      engine,
      mapData: engine === 'osrm'
        ? 'OpenStreetMap road data via OSRM'
        : 'OpenStreetMap road graph',
      hazardsConsidered: activeHazards.length
    });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/hazards', (req, res) => {
  const body = isPlainObject(req.body) ? req.body : {};
  const title = cleanText(body.title, MAX_TITLE_LENGTH);
  const category = cleanText(body.category, MAX_CATEGORY_LENGTH);
  const severity = cleanText(body.severity, MAX_SEVERITY_LENGTH);
  const location = cleanText(body.location, MAX_LOCATION_LENGTH);
  const description = cleanText(body.description || '', MAX_DESCRIPTION_LENGTH);

  if (!title || !category || !severity || !location) {
    return res.status(400).json({
      error: 'title, category, severity, and location are required.'
    });
  }

  let coordinates = null;
  if (body.coordinates !== null && body.coordinates !== undefined) {
    coordinates = normalizePoint(body.coordinates);
    if (!coordinates) {
      return res.status(400).json({
        error: 'coordinates.lat and coordinates.lng must be valid latitude/longitude values.'
      });
    }
  }

  const submittedWindow = isPlainObject(body.window) ? body.window : {};
  const scheduled = submittedWindow.scheduled === true;
  let start = null;
  let end = null;

  if (scheduled) {
    start = typeof submittedWindow.start === 'string' ? submittedWindow.start : '';
    end = typeof submittedWindow.end === 'string' ? submittedWindow.end : '';
    const startTime = Date.parse(start);
    const endTime = Date.parse(end);

    if (!start || !end || !Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime >= endTime) {
      return res.status(400).json({
        error: 'A scheduled hazard requires valid start and end times, with start before end.'
      });
    }

    start = new Date(startTime).toISOString();
    end = new Date(endTime).toISOString();
  }

  const hazard = {
    id: `hz_${randomUUID()}`,
    title,
    category,
    severity,
    location,
    description,
    coordinates,
    window: { scheduled, start, end },
    createdAt: new Date().toISOString()
  };

  hazards.push(hazard);
  return res.status(201).json({ data: hazard });
});

app.delete('/api/hazards/:id', (req, res) => {
  const index = hazards.findIndex((hazard) => hazard.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Hazard not found.' });
  }

  const [removed] = hazards.splice(index, 1);
  return res.json({ data: removed });
});

app.get('/', (_req, res, next) => {
  res.sendFile(path.join(frontendPath, 'login.html'), (error) => {
    if (error) next(error);
  });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ error: 'Request body contains invalid JSON.' });
  }
  if (error && error.type === 'entity.too.large') {
    return res.status(413).json({ error: `Request body is too large. Limit: ${MAX_JSON_BYTES}.` });
  }

  console.error('[NaviGuard API]', error);
  const message = error && typeof error.message === 'string'
    ? error.message
    : 'Internal server error.';
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600
    ? error.status
    : 500;

  return res.status(status).json({
    error: status === 500 ? 'Internal server error.' : message
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`NaviGuard server running at http://localhost:${PORT}`);
  });
}

module.exports = app;
module.exports.hazards = hazards;