# NaviGuard

NaviGuard is a safety-first navigation app that combines route planning with community-reported hazards. Users can plan routes, report hazards such as flooding or road damage, review active and scheduled incidents, and check weather conditions before travelling.

## Highlights

- Interactive map and route planning with Leaflet and Leaflet Routing Machine
- Browser geolocation support for the starting point
- Hazard dashboard with active, scheduled, and expired states
- Weather advisory lookup powered by Open-Meteo
- Accessibility preferences, contrast modes, font choices, and dark theme
- Express backend with static frontend hosting and a starter hazards API

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
| `POST` | `/api/hazards` | Creates a hazard |
| `DELETE` | `/api/hazards/:id` | Removes a hazard by ID |

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

## Current limitations

- Authentication and user accounts are currently a browser-only demo backed by `localStorage`; passwords should not be stored this way in production.
- The hazards API uses in-memory storage and should be connected to a database before deployment.
- Routing, geocoding, map tiles, and weather data use third-party services from the browser and are subject to their usage policies.
- No production secrets are required for the current demo.

## Recommended next steps

1. Connect the frontend hazard dashboard to the `/api/hazards` endpoints.
2. Add a persistent database and migrations.
3. Replace demo authentication with a secure server-side identity flow.
4. Add automated tests for API validation and hazard lifecycle behavior.
5. Add request logging, rate limiting, and deployment configuration.

## License

This project is currently intended for educational and prototype use. Add a project-specific license before publishing it for external reuse.
