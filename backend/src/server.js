const express = require('express');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const frontendPath = path.join(__dirname, '..', '..', 'frontend');

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(express.static(frontendPath));

const hazards = [];

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'naviguard-api', timestamp: new Date().toISOString() });
});

app.get('/api/hazards', (_req, res) => {
  res.json({ data: hazards });
});

app.post('/api/hazards', (req, res) => {
  const { title, category, severity, location, description = '', window = {}, coordinates = null } = req.body || {};

  if (!title || !category || !severity || !location) {
    return res.status(400).json({
      error: 'title, category, severity, and location are required'
    });
  }

  if (coordinates !== null && (!Number.isFinite(Number(coordinates.lat)) || !Number.isFinite(Number(coordinates.lng)))) {
    return res.status(400).json({ error: 'coordinates.lat and coordinates.lng must be valid numbers' });
  }

  const hazard = {
    id: `hz_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    title: String(title).trim(),
    category: String(category).trim(),
    severity: String(severity).trim(),
    location: String(location).trim(),
    description: String(description).trim(),
    coordinates: coordinates ? {
      lat: Number(coordinates.lat),
      lng: Number(coordinates.lng)
    } : null,
    window: {
      scheduled: Boolean(window.scheduled),
      start: window.start || null,
      end: window.end || null
    },
    createdAt: new Date().toISOString()
  };

  hazards.push(hazard);
  return res.status(201).json({ data: hazard });
});

app.delete('/api/hazards/:id', (req, res) => {
  const index = hazards.findIndex((hazard) => hazard.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: 'Hazard not found' });
  }

  const [removed] = hazards.splice(index, 1);
  return res.json({ data: removed });
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'login.html'));
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`NaviGuard server running at http://localhost:${PORT}`);
});

module.exports = app;
