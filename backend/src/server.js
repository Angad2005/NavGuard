'use strict';

require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const fs = require('fs');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const sharp = require('sharp');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const { calculateDijkstraRoutes } = require('./dijkstra-router');
const { generateNavAIResponse } = require('./navai-engine');
<<<<<<< HEAD
const { connectDatabase } = require('./database');
const Hazard = require('./models/Hazard');
=======
const User = require('./models/User');
const Hazard = require('./models/Hazard');
const SavedPlace = require('./models/SavedPlace');
const { connectDatabase } = require('./database');
const { createToken, getJwtSecret, requireAuth, serializeUser } = require('./auth');
>>>>>>> fbc24ddca2a02f1afc11af6c62c1cf9005d4aa30

const app = express();
const PORT = Number.parseInt(process.env.PORT, 10) || 3000;
const frontendPath = path.resolve(__dirname, '..', '..', 'frontend');
const frontendDistPath = path.resolve(frontendPath, 'dist');
const MAX_JSON_BYTES = '100kb';
const MAX_MULTIPART_FIELD_BYTES = 100 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 25_000_000;
const MAX_TITLE_LENGTH = 160;
const MAX_CATEGORY_LENGTH = 80;
const MAX_SEVERITY_LENGTH = 40;
const MAX_LOCATION_LENGTH = 300;
const MAX_DESCRIPTION_LENGTH = 2000;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const BCRYPT_ROUNDS = 12;
const DEFAULT_WEATHER_API_URL = 'https://api.open-meteo.com/v1/forecast';
const WEATHER_API_TIMEOUT_MS = Number.parseInt(process.env.WEATHER_API_TIMEOUT_MS, 10) || 10000;
const imageTypes = new Map([
  ['image/jpeg', { format: 'jpeg' }],
  ['image/png', { format: 'png' }],
  ['image/webp', { format: 'webp' }],
  ['image/gif', { format: 'gif' }]
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_BYTES,
    files: 1,
    fields: 2,
    fieldSize: MAX_MULTIPART_FIELD_BYTES
  },
  fileFilter: (_req, file, callback) => {
    if (!imageTypes.has(file.mimetype)) {
      const error = new Error('Upload a JPEG, PNG, WebP, or GIF image.');
      error.status = 400;
      return callback(error);
    }
    return callback(null, true);
  }
});

app.disable('x-powered-by');
app.use(express.json({ limit: MAX_JSON_BYTES, strict: true }));
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
}
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

async function sanitizeImageBuffer(buffer, mimeType) {
  const expectedImage = imageTypes.get(mimeType);
  if (!expectedImage) return null;

  try {
    const image = sharp(buffer, {
      failOn: 'warning',
      limitInputPixels: MAX_IMAGE_PIXELS
    });
    const metadata = await image.metadata();
    if (metadata.format !== expectedImage.format || !metadata.width || !metadata.height) {
      return null;
    }

    return await image.rotate().toFormat(expectedImage.format).toBuffer();
  } catch {
    return null;
  }
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

function combineRoutingHazards(userHazards) {
  const all = Array.isArray(userHazards) ? userHazards : [];
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
<<<<<<< HEAD
  const dbState = mongoose.connection.readyState;
  const dbStatusMap = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  res.json({
    status: 'ok',
    service: 'naviguard-api',
    database: {
      type: 'mongodb',
      status: dbStatusMap[dbState] || 'unknown',
      connected: dbState === 1
    },
=======
  const connected = mongoose.connection.readyState === 1;
  return res.status(connected ? 200 : 503).json({
    status: connected ? 'ok' : 'unavailable',
    service: 'naviguard-api',
    database: connected ? 'connected' : 'disconnected',
>>>>>>> fbc24ddca2a02f1afc11af6c62c1cf9005d4aa30
    timestamp: new Date().toISOString()
  });
});

<<<<<<< HEAD
app.get('/api/hazards', async (_req, res, next) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const dbHazards = await Hazard.find().lean();
      hazards.splice(0, hazards.length, ...dbHazards);
      return res.json({ data: dbHazards });
    }
    return res.json({ data: hazards });
=======
function serializeHazard(hazard) {
  const item = typeof hazard.toObject === 'function' ? hazard.toObject() : hazard;
  return {
    id: item.id,
    title: item.title,
    category: item.category,
    severity: item.severity,
    location: item.location,
    description: item.description,
    coordinates: item.coordinates,
    imageUrl: item.hasImage
      ? `/api/hazards/${encodeURIComponent(item.id)}/image`
      : null,
    window: item.window,
    confirmations: item.confirmations,
    createdAt: item.createdAt
  };
}

function serializeHazardDocument(hazard) {
  return serializeHazard(hazard);
}

function sendAuthResponse(res, status, user) {
  return res.status(status).json({
    data: {
      token: createToken(user),
      user: serializeUser(user)
    }
  });
}

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const username = cleanText(req.body?.username, 30).toLowerCase();
    const email = cleanText(req.body?.email, 254).toLowerCase();
    const password = req.body?.password;
    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      return res.status(400).json({ error: 'Username must be 3–30 characters using letters, numbers, or underscores.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.` });
    }
    if (Buffer.byteLength(password, 'utf8') > 72) {
      return res.status(400).json({ error: 'Password must not exceed 72 UTF-8 bytes.' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await User.create({ username, email, passwordHash });
    return sendAuthResponse(res, 201, user);
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({ error: 'An account with that username or email already exists.' });
    }
    return next(error);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const email = cleanText(req.body?.email, 254).toLowerCase();
    const password = req.body?.password;
    if (!email || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }
    return sendAuthResponse(res, 200, user);
  } catch (error) {
    return next(error);
  }
});

app.use('/api', requireAuth);

app.get('/api/auth/me', (req, res) => {
  res.json({ data: { user: serializeUser(req.user) } });
});

app.get('/api/weather', async (req, res, next) => {
  const lat = parseCoordinate(req.query.lat);
  const lng = parseCoordinate(req.query.lng);
  if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ error: 'lat and lng must be valid latitude/longitude values.' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEATHER_API_TIMEOUT_MS);
  try {
    const endpoint = new URL(process.env.WEATHER_API_URL || DEFAULT_WEATHER_API_URL);
    endpoint.searchParams.set('latitude', String(lat));
    endpoint.searchParams.set('longitude', String(lng));
    endpoint.searchParams.set(
      'current',
      'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m'
    );
    endpoint.searchParams.set('wind_speed_unit', 'kmh');
    endpoint.searchParams.set('timezone', 'auto');

    const weatherResponse = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    if (!weatherResponse.ok) {
      const error = new Error(`Weather provider returned HTTP ${weatherResponse.status}.`);
      error.status = 502;
      return next(error);
    }
    const weatherPayload = await weatherResponse.json();
    const current = weatherPayload.current;
    if (!current || !Number.isFinite(current.weather_code) || !Number.isFinite(current.temperature_2m)) {
      const error = new Error('Weather provider returned an invalid current-conditions response.');
      error.status = 502;
      return next(error);
    }

    return res.json({
      data: {
        temperature: current.temperature_2m,
        apparentTemperature: current.apparent_temperature,
        relativeHumidity: current.relative_humidity_2m,
        precipitation: current.precipitation,
        rain: current.rain,
        showers: current.showers,
        snowfall: current.snowfall,
        weathercode: current.weather_code,
        windspeed: current.wind_speed_10m,
        windDirection: current.wind_direction_10m,
        cloudCover: current.cloud_cover,
        isDay: current.is_day,
        time: current.time,
        timezone: weatherPayload.timezone,
        source: 'Open-Meteo'
      }
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      error.message = 'Weather provider timed out. Please try again.';
      error.status = 504;
    } else if (!error.status) {
      error.message = 'Could not reach the weather provider.';
      error.status = 502;
    }
    return next(error);
  } finally {
    clearTimeout(timeout);
  }
});

app.get('/api/hazards', async (req, res, next) => {
  try {
    const hazards = await Hazard.find({ ownerId: req.user._id }).sort({ createdAt: -1 }).lean();
    return res.json({ data: hazards.map(serializeHazardDocument) });
  } catch (error) {
    return next(error);
  }
});

function serializeSavedPlace(place) {
  return {
    id: place.id,
    name: place.name,
    coordinates: place.coordinates,
    imageUrl: place.hasImage
      ? `/api/places/${encodeURIComponent(place.id)}/image`
      : null,
    createdAt: place.createdAt
  };
}

app.get('/api/places', async (req, res, next) => {
  try {
    const places = await SavedPlace.find({ ownerId: req.user._id }).sort({ createdAt: -1 }).lean();
    return res.json({ data: places.map(serializeSavedPlace) });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/places', upload.single('image'), async (req, res, next) => {
  try {
    const body = isPlainObject(req.body) ? req.body : {};
    let submittedCoordinates = body.coordinates;
    if (typeof submittedCoordinates === 'string') {
      try {
        submittedCoordinates = JSON.parse(submittedCoordinates);
      } catch {
        return res.status(400).json({ error: 'Place coordinates must contain valid JSON.' });
      }
    }

    const name = cleanText(body.name, MAX_TITLE_LENGTH);
    const coordinates = normalizePoint(submittedCoordinates);
    if (!name || !coordinates) {
      return res.status(400).json({
        error: 'A place name and valid coordinates are required.'
      });
    }

    let imageData = null;
    let imageMimeType = null;
    if (req.file) {
      const sanitizedImage = await sanitizeImageBuffer(req.file.buffer, req.file.mimetype);
      if (!sanitizedImage) {
        return res.status(400).json({ error: 'The uploaded file is not a valid supported image.' });
      }
      if (sanitizedImage.length > MAX_IMAGE_BYTES) {
        return res.status(413).json({ error: 'The processed image must be 5 MB or smaller.' });
      }
      imageData = sanitizedImage;
      imageMimeType = req.file.mimetype;
    }

    const place = await SavedPlace.create({
      id: `place_${randomUUID()}`,
      ownerId: req.user._id,
      name,
      coordinates,
      hasImage: Boolean(imageData),
      imageData,
      imageMimeType
    });
    return res.status(201).json({ data: serializeSavedPlace(place.toObject()) });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/places/:id/image', async (req, res, next) => {
  try {
    const place = await SavedPlace.findOne({
      id: req.params.id,
      ownerId: req.user._id
    }).select('+imageData +imageMimeType').lean();
    if (!place || !place.imageData) {
      return res.status(404).json({ error: 'Saved place image not found.' });
    }
    res.set('Cache-Control', 'private, no-store');
    return res.type(place.imageMimeType).send(place.imageData.value());
  } catch (error) {
    return next(error);
  }
});

app.delete('/api/places/:id', async (req, res, next) => {
  try {
    const place = await SavedPlace.findOneAndDelete({
      id: req.params.id,
      ownerId: req.user._id
    });
    if (!place) {
      return res.status(404).json({ error: 'Saved place not found.' });
    }
    return res.json({ data: serializeSavedPlace(place.toObject()) });
>>>>>>> fbc24ddca2a02f1afc11af6c62c1cf9005d4aa30
  } catch (error) {
    return next(error);
  }
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

    const userHazards = await Hazard.find({
      ownerId: req.user._id,
      'coordinates.lat': { $ne: null },
      'coordinates.lng': { $ne: null }
    }).select('id coordinates window').lean();
    const activeHazards = combineRoutingHazards(userHazards);
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

app.post('/api/hazards', upload.single('image'), async (req, res, next) => {
  try {
    let body = req.body;
    if (typeof req.body?.hazard === 'string') {
      try {
        body = JSON.parse(req.body.hazard);
      } catch {
        return res.status(400).json({ error: 'Hazard details must contain valid JSON.' });
      }
    }
    if (!isPlainObject(body)) body = {};

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

    let imageData = null;
    let imageMimeType = null;
    if (req.file) {
      const imageType = imageTypes.get(req.file.mimetype);
      const sanitizedImage = await sanitizeImageBuffer(req.file.buffer, req.file.mimetype);
      if (!imageType || !sanitizedImage) {
        return res.status(400).json({ error: 'The uploaded file is not a valid supported image.' });
      }
      if (sanitizedImage.length > MAX_IMAGE_BYTES) {
        return res.status(413).json({ error: 'The processed image must be 5 MB or smaller.' });
      }
      imageData = sanitizedImage;
      imageMimeType = req.file.mimetype;
    }

    const hazard = await Hazard.create({
      id: `hz_${randomUUID()}`,
      ownerId: req.user._id,
      title,
      category,
      severity,
      location,
      description,
      coordinates,
      hasImage: Boolean(imageData),
      imageData,
      imageMimeType,
      window: { scheduled, start, end },
      confirmations: 1
    });

<<<<<<< HEAD
    if (mongoose.connection.readyState === 1) {
      await Hazard.create(hazard);
    }
    hazards.push(hazard);
    return res.status(201).json({ data: hazard });
=======
    return res.status(201).json({ data: serializeHazardDocument(hazard.toObject()) });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/hazards/:id/image', async (req, res, next) => {
  try {
    const hazard = await Hazard.collection.findOne({
      id: req.params.id,
      ownerId: req.user._id
    });
    if (!hazard || !hazard.imageData) {
      return res.status(404).json({ error: 'Hazard image not found.' });
    }
    res.set('Cache-Control', 'private, no-store');
    return res.type(hazard.imageMimeType).send(hazard.imageData.value());
>>>>>>> fbc24ddca2a02f1afc11af6c62c1cf9005d4aa30
  } catch (error) {
    return next(error);
  }
});

app.delete('/api/hazards/:id', async (req, res, next) => {
  try {
    const hazard = await Hazard.findOneAndDelete({
      id: req.params.id,
      ownerId: req.user._id
    });
    if (!hazard) {
      return res.status(404).json({ error: 'Hazard not found.' });
    }
    return res.json({ data: serializeHazardDocument(hazard.toObject()) });
  } catch (error) {
    return next(error);
  }
<<<<<<< HEAD

  if (mongoose.connection.readyState === 1) {
    await Hazard.deleteOne({ id: req.params.id });
  }
  const [removed] = hazards.splice(index, 1);
  return res.json({ data: removed });
=======
>>>>>>> fbc24ddca2a02f1afc11af6c62c1cf9005d4aa30
});


app.post('/api/navai/chat', async (req, res, next) => {
  try {
    const { message, telemetry, apiKey } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message string is required.' });
    }
    const response = await generateNavAIResponse({
      message,
      telemetry: telemetry || {},
      apiKey: typeof apiKey === 'string' && apiKey.trim() ? apiKey.trim() : undefined
    });
    return res.json({ data: response });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/hazards/:id/confirm', async (req, res, next) => {
  try {
    const hazard = await Hazard.findOneAndUpdate(
      { id: req.params.id, ownerId: req.user._id },
      { $inc: { confirmations: 1 } },
      { new: true }
    );
    if (!hazard) {
      return res.status(404).json({ error: 'Hazard not found.' });
    }
    return res.json({ data: serializeHazardDocument(hazard.toObject()) });
  } catch (error) {
    return next(error);
  }
});

function sendFrontendIndex(_req, res, next) {
  const distIndex = path.join(frontendDistPath, 'index.html');
  const fallbackIndex = path.join(frontendPath, 'index.html');
  const indexPath = fs.existsSync(distIndex) ? distIndex : fallbackIndex;
  res.sendFile(indexPath, (error) => {
    if (error) next(error);
  });
}

app.get(['/', '/map', '/hazards'], sendFrontendIndex);

app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
    return sendFrontendIndex(req, res, next);
  }
  res.status(404).json({ error: 'Route not found.' });
});

app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ error: 'Request body contains invalid JSON.' });
  }
  if (error instanceof multer.MulterError) {
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'Image must be 5 MB or smaller.'
      : 'The image upload could not be processed.';
    return res.status(status).json({ error: message });
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
<<<<<<< HEAD
  connectDatabase().then(async () => {
    if (mongoose.connection.readyState === 1) {
      try {
        const docs = await Hazard.find().lean();
        hazards.splice(0, hazards.length, ...docs);
        console.log(`[NaviGuard] Synced ${docs.length} hazards from MongoDB`);
      } catch (err) {
        console.warn('[NaviGuard] Hazard sync warning:', err.message);
      }
    }
  }).catch((err) => {
    console.warn('[NaviGuard] Database connection deferred:', err.message);
  });

  app.listen(PORT, () => {
    console.log(`NaviGuard server running at http://localhost:${PORT}`);
=======
  getJwtSecret();
  connectDatabase().then(() => {
    app.listen(PORT, () => {
      console.log(`NaviGuard server running at http://localhost:${PORT}`);
    });
  }).catch((error) => {
    console.error('[NaviGuard startup] Could not connect to MongoDB:', error.message);
    process.exitCode = 1;
>>>>>>> fbc24ddca2a02f1afc11af6c62c1cf9005d4aa30
  });
}

module.exports = app;
<<<<<<< HEAD
module.exports.hazards = hazards;
module.exports.Hazard = Hazard;
module.exports.connectDatabase = connectDatabase;
=======
module.exports.models = { Hazard, SavedPlace, User };
>>>>>>> fbc24ddca2a02f1afc11af6c62c1cf9005d4aa30
