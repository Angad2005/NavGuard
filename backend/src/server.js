'use strict';

const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const sharp = require('sharp');
const { randomUUID } = require('crypto');
const { calculateDijkstraRoutes } = require('./dijkstra-router');
const { generateNavAIResponse } = require('./navai-engine');

const app = express();
const PORT = Number.parseInt(process.env.PORT, 10) || 3000;
const frontendPath = path.resolve(__dirname, '..', '..', 'frontend');
const frontendDistPath = path.resolve(frontendPath, 'dist');
const uploadDirectory = path.resolve(__dirname, '..', 'uploads');
const MAX_JSON_BYTES = '100kb';
const MAX_MULTIPART_FIELD_BYTES = 100 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 25_000_000;
const MAX_TITLE_LENGTH = 160;
const MAX_CATEGORY_LENGTH = 80;
const MAX_SEVERITY_LENGTH = 40;
const MAX_LOCATION_LENGTH = 300;
const MAX_DESCRIPTION_LENGTH = 2000;
const imageTypes = new Map([
  ['image/jpeg', { extension: 'jpg', format: 'jpeg' }],
  ['image/png', { extension: 'png', format: 'png' }],
  ['image/webp', { extension: 'webp', format: 'webp' }],
  ['image/gif', { extension: 'gif', format: 'gif' }]
]);

const hazards = [];

fs.mkdirSync(uploadDirectory, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_BYTES,
    files: 1,
    fields: 1,
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
app.use('/uploads', express.static(uploadDirectory, { maxAge: '1d' }));

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

    let imageUrl = null;
    if (req.file) {
      const imageType = imageTypes.get(req.file.mimetype);
      const sanitizedImage = await sanitizeImageBuffer(req.file.buffer, req.file.mimetype);
      if (!imageType || !sanitizedImage) {
        return res.status(400).json({ error: 'The uploaded file is not a valid supported image.' });
      }

      const filename = `${randomUUID()}.${imageType.extension}`;
      await fs.promises.writeFile(path.join(uploadDirectory, filename), sanitizedImage, { flag: 'wx' });
      imageUrl = `/uploads/${filename}`;
    }

    const hazard = {
      id: `hz_${randomUUID()}`,
      title,
      category,
      severity,
      location,
      description,
      coordinates,
      imageUrl,
      window: { scheduled, start, end },
      confirmations: 1,
      createdAt: new Date().toISOString()
    };

    hazards.push(hazard);
    return res.status(201).json({ data: hazard });
  } catch (error) {
    return next(error);
  }
});

app.delete('/api/hazards/:id', async (req, res, next) => {
  const index = hazards.findIndex((hazard) => hazard.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Hazard not found.' });
  }

  const hazard = hazards[index];
  if (hazard.imageUrl) {
    try {
      await fs.promises.unlink(path.join(uploadDirectory, path.basename(hazard.imageUrl)));
    } catch (error) {
      if (error.code !== 'ENOENT') return next(error);
    }
  }

  const [removed] = hazards.splice(index, 1);
  return res.json({ data: removed });
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

app.post('/api/hazards/:id/confirm', (req, res) => {
  const hazard = hazards.find((h) => h.id === req.params.id);
  if (!hazard) {
    return res.status(404).json({ error: 'Hazard not found.' });
  }
  hazard.confirmations = (hazard.confirmations || 1) + 1;
  return res.json({ data: hazard });
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
  app.listen(PORT, () => {
    console.log(`NaviGuard server running at http://localhost:${PORT}`);
  });
}

module.exports = app;
module.exports.hazards = hazards;