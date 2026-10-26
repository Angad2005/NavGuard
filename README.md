# NaviGuard

NaviGuard is a safety-first navigation app that combines intelligent route planning with account-scoped hazard reports. Signed-in users can plan routes, avoid their own reported obstacles such as flooding, debris, and road damage via Dijkstra/OSRM detours, attach photos and GPS coordinates, and monitor weather advisories.

## Highlights

- **Pure React SPA** with modern component architecture, clean state hooks, and high-performance rendering
- **Tailwind CSS Design System** featuring glassmorphism, responsive floating cards, and polished Dark / Light theme switching
- **Interactive OpenStreetMap Map** with Leaflet: custom SVG pin markers, 100m hazard danger-zone circles, and route polylines
- **Intelligent Detour Engine**: Dijkstra / Yen's k-shortest-path fallback and OSRM alternatives that detect and avoid the signed-in user's reported hazards
- **Turn-by-Turn Navigation HUD & Drive Simulator**: Live step-by-step guidance, digital speedometer, and animated vehicle traversal
- **Text-to-Speech Voice Guidance**: Built-in voice assistant alerting drivers of hazards and maneuvers in real time
- **Emergency SOS Safe Haven Finder**: Uses the device's current GPS fix to find nearby hospitals, police stations, and fire stations from OpenStreetMap, then calculates a safe route to a selected facility
- **Saved Places & Routes**: Keep account-scoped places and photos in MongoDB, add saved places as ordered route stops, and save/reload complete multi-stop routes
- **Route Safety Audit & GPX / GeoJSON Export**: Grade scoring, obstacle proximity analysis, estimated fuel/CO2 emissions, and standard GPX download
- **Live Address Autocomplete**: Instant search suggestions for origins and destinations powered by Nominatim
- **Private Hazard Reporting**: Each signed-in user can view, confirm, route around, and resolve only their own saved hazards
- **Live Weather Advisory**: Configurable Open-Meteo integration delivering road conditions and 1-click weather hazard reporting (no API key required)
- **Express + MongoDB Backend**: Persists unique accounts and user-owned hazards, protects hazard photos, and serves the authenticated REST API and SPA

## Project structure

```text
.
├── backend/
│   ├── src/
│   │   ├── dijkstra-router.js     # Routing engine, OSRM & OpenStreetMap graph
│   │   ├── models/                # MongoDB user and hazard schemas
│   │   └── server.js              # Express app, authentication, SPA hosting, and REST API
│   ├── test/                      # API, image upload, authentication, and routing tests
│   └── test-support/              # Isolated MongoDB test setup
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

# 2. Configure MongoDB
cp .env.example .env
# Start a local MongoDB service, or set MONGODB_URI to your MongoDB Atlas URI.
# For local development, NaviGuard creates and saves a private signing key in
# .jwt-secret the first time it starts. In production, set JWT_SECRET to a
# stable random value of at least 32 characters (for example, `openssl rand -base64 48`).

# 3. Build the React frontend
npm run build

# 4. Start the server
npm start
```

Then open [http://localhost:3000](http://localhost:3000) to view NaviGuard.
Create an account or sign in before accessing the application. Passwords are
hashed before they are saved in MongoDB. The browser stores only the signed
session token and profile, plus local hazards, saved places, and saved routes
scoped to that user's ID;
MongoDB remains the source of truth.

### Development Mode

Run the Express API backend and Vite frontend hot-reloader concurrently:

```bash
# In terminal 1 (Backend API on http://localhost:3000)
npm run dev

# In terminal 2 (Vite Frontend with hot reload & API proxy on http://localhost:5173)
npm run dev:frontend
```

## API

Accounts, hazards, and saved places are persisted in MongoDB. Every endpoint below except
`/api/health`, `/api/auth/register`, and `/api/auth/login` requires an
`Authorization: Bearer <token>` header. Hazard lists, edits, confirmations,
routes, and photographs are scoped to the authenticated account.

<<<<<<< HEAD
| Method     | Endpoint             | Description                                                                                                    |
| ---------- | -------------------- | -------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/health`      | Returns service status and timestamp                                                                           |
| `GET`    | `/api/hazards`     | Lists active and scheduled road hazards                                                                        |
| `POST`   | `/api/hazards`     | Creates a hazard, optionally with `coordinates: { lat, lng }` and an image (JPEG, PNG, WebP, GIF up to 5 MB) |
| `DELETE` | `/api/hazards/:id` | Removes or resolves a hazard by ID                                                                             |
| `POST`   | `/api/route`       | Calculates hazard-free routes with Dijkstra over live OpenStreetMap road data                                  |
=======
| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Returns service status and timestamp |
| `POST` | `/api/auth/register` | Creates a unique account and returns a signed session |
| `POST` | `/api/auth/login` | Authenticates an account and returns a signed session |
| `GET` | `/api/auth/me` | Returns the authenticated account profile |
| `GET` | `/api/weather?lat=...&lng=...` | Retrieves current weather from the configured weather provider |
| `GET` | `/api/hazards` | Lists the signed-in user's active and scheduled hazards |
| `POST` | `/api/hazards` | Creates a private hazard report, optionally with coordinates and a photo |
| `GET` | `/api/hazards/:id/image` | Serves a photo only to its owner |
| `DELETE` | `/api/hazards/:id` | Removes the signed-in user's hazard |
| `POST` | `/api/hazards/:id/confirm` | Confirms one of the signed-in user's hazards |
| `GET` | `/api/places` | Lists the signed-in user's saved places |
| `POST` | `/api/places` | Saves a named location, optionally with a JPEG, PNG, WebP, or GIF photo |
| `GET` | `/api/places/:id/image` | Serves a saved-place photo only to its owner |
| `DELETE` | `/api/places/:id` | Removes a saved place |
| `POST` | `/api/route` | Calculates routes while avoiding only the signed-in user's hazards |
>>>>>>> fbc24ddca2a02f1afc11af6c62c1cf9005d4aa30

Example account creation request (`POST /api/auth/register`):

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"driver_1","email":"driver@example.com","password":"use-a-long-password"}'
```

Use the returned token in the `Authorization` header for authenticated requests.
Saved places are available from the Places dashboard tab, where uploaded photos
are shown at larger size. Photos are image-validated, limited to 5 MB, and
account-scoped; saved routes remain stored locally for the signed-in account.
To attach a photo, submit `POST /api/hazards` as `multipart/form-data` with a
`hazard` JSON string field and an `image` file (JPEG, PNG, WebP, or GIF up to
5 MB). Photo bytes are stored in MongoDB and served through the owner-checked
image endpoint.

Live weather is fetched by the backend using `WEATHER_API_URL`, then shared by
the app's weather display and advisory. The default provider is Open-Meteo and
does not require an API key. `WEATHER_API_TIMEOUT_MS` controls the provider
request timeout. Do not put provider secrets in frontend environment variables.

## Running Tests

To run the test suite:

```bash
npm test
```

## License

This project is currently intended for educational and prototype use.
