# NaviGuard

NaviGuard is a safety-first navigation app that combines route planning with community-reported hazards. Users can plan routes, report hazards such as flooding or road damage, review active and scheduled incidents, and check weather conditions before travelling.

## Highlights

- Interactive OpenStreetMap map with OSRM routes and a local OSM road-graph fallback
- Hazard-aware edge blocking, route comparison cards, and highlighted safe-route selection
- Browser geolocation support for the starting point
- Hazard dashboard with active, scheduled, and expired states
- Weather advisory lookup powered by Open-Meteo
- Accessibility preferences, contrast modes, font choices, and dark theme
- Express backend with static frontend hosting and a shared hazards API
- Map reports are pinned by latitude/longitude and appear in the hazard dashboard

## Project structure

```text
.
├── backend/
│   └── src/
│       └── server.js       # Express app, static hosting, and API routes
├── frontend/
│   ├── css/                # Page stylesheets
│   ├── js/                 # Frontend behavior
│   ├── Hazard.html         # Hazard dashboard
│   ├── login.html          # Login and sign-up demo
│   └── main.html           # Map and route planner
├── .env.example
├── .gitignore
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

# Start the server
npm start
```

Then open [http://localhost:3000](http://localhost:3000). The server redirects the root URL to the login page. The other frontend pages are available at:

- [http://localhost:3000/main.html](http://localhost:3000/main.html)
- [http://localhost:3000/Hazard.html](http://localhost:3000/Hazard.html)

For development, use the automatic-reload script:

```bash
npm run dev
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

The route planner first requests OSRM alternatives and filters out paths within 100 meters of an active hazard. It supplements these with up to three distinct paths from an OpenStreetMap road graph when needed. The graph respects one-way streets and uses Yen's k-shortest-path algorithm over Dijkstra searches, excluding hazard-adjacent edges. If the local graph cannot find a safe path, OSRM routes through detour points generated from the affected route segments. Every returned path is checked against active hazards.

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
