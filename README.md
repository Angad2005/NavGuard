# NaviGuard

NaviGuard is a safety-first navigation app that combines route planning with community-reported hazards. Users can plan routes, report hazards such as flooding or road damage, review active and scheduled incidents, and check weather conditions before travelling.

## Highlights

- Integrated **React** component-based frontend architecture with a unified design system
- Global theme and accessibility system (Light / Dark mode, High Contrast, Warm Sepia, adjustable typography and scaling)
- Seamless navigation between Map & Detours, Hazard Dashboard, and User Authentication without full page reloads
- Interactive OpenStreetMap map with Leaflet, OSRM routes, and local road-graph fallback
- Hazard-aware edge blocking, route comparison cards, and highlighted safe-route selection
- Community hazard reporting with GPS location or interactive map click
- Hazard dashboard with active, scheduled, and expired status filtering and real-time pulse metrics
- Weather advisory lookup powered by Open-Meteo with 1-click hazard creation
- Express backend with static frontend hosting and a shared hazards API

## Project structure

```text
.
├── backend/
│   ├── src/
│   │   ├── dijkstra-router.js  # Routing engine, OSRM & OpenStreetMap graph
│   │   └── server.js           # Express app, static hosting, and API routes
│   └── test/                   # Routing and detour integration tests
├── frontend/
│   ├── dist/                   # Production-compiled React bundle (assets/app.js & app.css)
│   ├── src/                    # React source code
│   │   ├── components/         # Navbar, MapView, HazardDashboardView, LoginView, Modals, Toast
│   │   ├── context/            # ThemeContext, SessionContext, HazardContext
│   │   ├── styles/             # Unified design system & CSS tokens
│   │   ├── utils/              # Geocoding, coordinates, and hazard math
│   │   ├── App.jsx             # Top-level view switcher & notification coordinator
│   │   └── index.jsx           # React DOM root entry point
│   ├── Hazard.html             # Hazard dashboard entry page
│   ├── login.html              # Login & sign-up entry page
│   ├── main.html               # Map and route planner entry page
│   └── index.html              # Vite dev server entry page
├── vite.config.mjs             # Vite build configuration
├── package.json
└── README.md
```

## Requirements

- Node.js 18 or newer
- npm 9 or newer
- A modern browser

## Quick start

```bash
# Install dependencies
npm install

# Build the React frontend
npm run build

# Start the server
npm start
```

Then open [http://localhost:3000](http://localhost:3000). The server serves the app at the root URL. All views (Map, Hazard Dashboard, Login) are unified in React with instant switching, and direct URLs remain fully supported:

- [http://localhost:3000/main.html](http://localhost:3000/main.html)
- [http://localhost:3000/Hazard.html](http://localhost:3000/Hazard.html)

For development:
```bash
# Run backend with nodemon
npm run dev

# Or run Vite frontend dev server with hot-reload & API proxy
npm run dev:frontend
```

## API

The backend currently uses in-memory storage so it is easy to run locally. Data is reset whenever the server restarts.

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Returns service status and timestamp |
| `GET` | `/api/hazards` | Lists hazards held by the server |
| `POST` | `/api/hazards` | Creates a hazard, optionally with `coordinates: { lat, lng }` |
| `DELETE` | `/api/hazards/:id` | Removes a hazard by ID |
| `POST` | `/api/route` | Calculates hazard-free routes with Dijkstra over live OpenStreetMap road data |

Example request:

```bash
curl -X POST http://localhost:3000/api/hazards \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Flooded underpass",
    "category": "Flooding",
    "severity": "High",
    "location": "Central Avenue",
    "description": "Avoid until water level drops"
  }'
```

Example health response:

```json
{
  "status": "ok",
  "service": "naviguard-api",
  "timestamp": "2026-10-13T03:52:39.765Z"
}
```

## Routing behavior

The route planner first requests OSRM alternatives and filters out paths within 100 meters of an active hazard. It returns safe OSRM routes immediately, so ordinary navigation does not wait for a local road-graph download. If all OSRM alternatives cross an active hazard, it first asks OSRM to route through detour points on either side of the affected road segment. The local OpenStreetMap graph is the fallback when OSRM cannot produce a safe route; it respects one-way streets and uses Yen's k-shortest-path algorithm over Dijkstra searches, excluding hazard-adjacent edges. Every returned path is checked against active hazards.

The Overpass client sends an explicit `Accept` header, a descriptive `User-Agent`, and a standards-compliant form body. It automatically tries multiple public Overpass providers when one is rate-limited, unavailable, or rejects a request with HTTP 406. Providers can be customized with the comma-separated `OVERPASS_URLS` environment variable; see `.env.example`.

## Current limitations

- Authentication and user accounts are currently a browser-only demo backed by `localStorage`; passwords should not be stored this way in production.
- The hazards API uses in-memory storage and should be connected to a database before deployment.
- Routing (Overpass/OpenStreetMap), geocoding (Nominatim), map tiles (OpenStreetMap), and weather data use third-party services and are subject to their usage policies. Overpass availability and its public rate limits can affect route calculation.
- No production secrets are required for the current demo.

## Recommended next steps

1. Connect the frontend hazard dashboard to the `/api/hazards` endpoints.
2. Add a persistent database and migrations.
3. Replace demo authentication with a secure server-side identity flow.
4. Add automated tests for API validation and hazard lifecycle behavior.
5. Add request logging, rate limiting, and deployment configuration.

## License

This project is currently intended for educational and prototype use. Add a project-specific license before publishing it for external reuse.
