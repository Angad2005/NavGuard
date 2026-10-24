# NaviGuard

NaviGuard is a safety-first navigation app that combines intelligent route planning with real-time community hazard intelligence. Users can plan routes, avoid obstacles such as flooding, debris, and road damage via Dijkstra/OSRM detours, report road incidents with photos and GPS coordinates, and monitor weather advisories.

## Highlights

- **Pure React SPA** with modern component architecture, clean state hooks, and high-performance rendering
- **Tailwind CSS Design System** featuring glassmorphism, responsive floating cards, and polished Dark / Light theme switching
- **Interactive OpenStreetMap Map** with Leaflet: custom SVG pin markers, 100m hazard danger-zone circles, and route polylines
- **Intelligent Detour Engine**: Dijkstra / Yen's k-shortest-path fallback and OSRM alternatives that detect and avoid community road hazards
- **Turn-by-Turn Navigation HUD & Drive Simulator**: Live step-by-step guidance, digital speedometer, and animated vehicle traversal
- **Text-to-Speech Voice Guidance**: Built-in voice assistant alerting drivers of hazards and maneuvers in real time
- **Emergency SOS Safe Haven Finder**: Instant lookup and 1-click emergency routing to nearest Hospitals, Police, Fire Stations, and Gas Services
- **Route Safety Audit & GPX / GeoJSON Export**: Grade scoring, obstacle proximity analysis, estimated fuel/CO2 emissions, and standard GPX download
- **Live Address Autocomplete**: Instant search suggestions for origins and destinations powered by Nominatim
- **Community Hazard Voting & Verification**: Drivers confirm active obstacles or resolve cleared roads with real-time confirmation tallies
- **Live Weather Advisory**: Open-Meteo integration delivering road conditions and 1-click weather hazard reporting
- **Express Backend**: Serves the single-page React application at `/`, exposes static assets from `/dist` and `/uploads`, and powers the REST API

## Project structure

```text
.
├── backend/
│   ├── src/
│   │   ├── dijkstra-router.js     # Routing engine, OSRM & OpenStreetMap graph
│   │   └── server.js              # Express app, SPA static hosting, and REST API
│   ├── test/                      # API, image upload, and routing integration tests
│   └── uploads/                   # Sanitized user hazard photos (JPEG, PNG, WebP)
├── frontend/
│   ├── dist/                      # Production Vite build (assets & index.html)
│   ├── src/
│   │   ├── components/            # MapView, HazardModal, HazardsDrawer, Navbar, WeatherAdvisoryCard, Toast
│   │   ├── context/               # HazardContext, ThemeContext
│   │   ├── styles/                # Tailwind CSS & map layer styling (index.css)
│   │   ├── utils/                 # Geocoding, coordinates, and hazard math (geo.js)
│   │   ├── App.jsx                # Top-level React coordinator
│   │   └── index.jsx              # React DOM entry point
│   └── index.html                 # Single-page application root entry
├── vite.config.mjs                # Vite build & Tailwind configuration with backend proxy
├── package.json
└── README.md
```

## Requirements

- Node.js 18 or newer
- npm 9 or newer
- A modern browser

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Build the React frontend
npm run build

# 3. Start the server
npm start
```

Then open [http://localhost:3000](http://localhost:3000) to view NaviGuard.

### Development Mode

Run the Express API backend and Vite frontend hot-reloader concurrently:

```bash
# In terminal 1 (Backend API on http://localhost:3000)
npm run dev

# In terminal 2 (Vite Frontend with hot reload & API proxy on http://localhost:5173)
npm run dev:frontend
```

## API

The backend currently uses in-memory storage so it is easy to run locally. Data is reset whenever the server restarts.

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Returns service status and timestamp |
| `GET` | `/api/hazards` | Lists active and scheduled road hazards |
| `POST` | `/api/hazards` | Creates a hazard, optionally with `coordinates: { lat, lng }` and an image (JPEG, PNG, WebP, GIF up to 5 MB) |
| `DELETE` | `/api/hazards/:id` | Removes or resolves a hazard by ID |
| `POST` | `/api/route` | Calculates hazard-free routes with Dijkstra over live OpenStreetMap road data |

Example hazard creation request (`POST /api/hazards`):

```bash
curl -X POST http://localhost:3000/api/hazards \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Flooded underpass",
    "category": "Flooding",
    "severity": "High",
    "location": "Central Avenue",
    "description": "Avoid until water level drops",
    "coordinates": { "lat": 28.6139, "lng": 77.209 }
  }'
```

To attach a photo, submit `POST /api/hazards` as `multipart/form-data` with a `hazard` JSON string field and an `image` file. Uploaded photos are served from `/uploads/`.

## Running Tests

To run the test suite:

```bash
npm test
```

## License

This project is currently intended for educational and prototype use.
