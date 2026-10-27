'use strict';

const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { registerUser, startTestDatabase } = require('../test-support/mongo-setup');

// Keep the integration test deterministic and independent of public routing
// services. The real route API and graph builder still run unchanged.
const configuredRoutingEngine = process.env.ROUTING_ENGINE;
const configuredOverpassUrls = process.env.OVERPASS_URLS;
process.env.ROUTING_ENGINE = 'dijkstra';
process.env.OVERPASS_URLS = 'https://overpass.test/api/interpreter';

const roadGraph = {
  elements: [
    {
      type: 'way', id: 10, nodes: [1, 2, 3],
      tags: { highway: 'residential', name: 'Hazard Road' },
      geometry: [
        { lat: 0, lon: 0 },
        { lat: 0, lon: 0.005 },
        { lat: 0, lon: 0.01 }
      ]
    },
    {
      type: 'way', id: 20, nodes: [1, 4, 5, 3],
      tags: { highway: 'residential', name: 'Safe Detour' },
      geometry: [
        { lat: 0, lon: 0 },
        { lat: 0.002, lon: 0.003 },
        { lat: 0.002, lon: 0.007 },
        { lat: 0, lon: 0.01 }
      ]
    },
    {
      type: 'way', id: 30, nodes: [1, 6, 3],
      tags: { highway: 'motorway', maxspeed: '130', motor_vehicle: 'no' },
      geometry: [
        { lat: 0, lon: 0 },
        { lat: 0.004, lon: 0.005 },
        { lat: 0, lon: 0.01 }
      ]
    }
  ]
};

const originalFetch = global.fetch;
let app;
let server;
let baseUrl;
let token;
let stopDatabase;
let overpassRequests = 0;

before(async () => {
  stopDatabase = await startTestDatabase();
  app = require('../src/server');
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  global.fetch = async (url, options = {}) => {
    if (String(url).startsWith(baseUrl)) return originalFetch(url, options);
    assert.match(String(url), /^https:\/\/overpass\.test\//);
    assert.equal(options.method, 'POST');
    overpassRequests += 1;
    return new Response(JSON.stringify(roadGraph), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  token = (await registerUser(baseUrl, 'route_owner')).token;
});

after(async () => {
  global.fetch = originalFetch;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await stopDatabase();
  if (configuredRoutingEngine === undefined) delete process.env.ROUTING_ENGINE;
  else process.env.ROUTING_ENGINE = configuredRoutingEngine;
  if (configuredOverpassUrls === undefined) delete process.env.OVERPASS_URLS;
  else process.env.OVERPASS_URLS = configuredOverpassUrls;
});

async function postApi(path, body, authToken = token) {
  return originalFetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

function routeComesWithinMeters(route, hazard, radius) {
  const { distanceToSegmentMeters } = require('../src/dijkstra-router');
  const points = route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
  return points.some((point, index) => (
    distanceToSegmentMeters(hazard, point, point) <= radius
    || (index > 0 && distanceToSegmentMeters(hazard, points[index - 1], point) <= radius)
  ));
}

function osrmPayload(route) {
  return {
    code: 'Ok',
    routes: [{
      distance: route.distance,
      duration: route.duration,
      geometry: { type: 'LineString', coordinates: route.coordinates },
      legs: []
    }]
  };
}

test('posting a hazard on the current route makes the route API return a clear detour', async () => {
  const hazardPoint = { lat: 0, lng: 0.005 };
  const routeBody = {
    start: { lat: 0, lng: 0 },
    end: { lat: 0, lng: 0.01 }
  };

  const originalRouteResponse = await postApi('/api/route', routeBody);
  assert.equal(originalRouteResponse.status, 200);
  const originalRoutePayload = await originalRouteResponse.json();
  const originalRoute = originalRoutePayload.data[0];
  assert.ok(routeComesWithinMeters(originalRoute, hazardPoint, 100), 'the initial fastest route should cross the future hazard point');
  assert.ok(
    originalRoute.geometry.coordinates.every(([, lat]) => lat < 0.003),
    'the route must not use a faster road restricted to motor vehicles'
  );

  const reportResponse = await postApi('/api/hazards', {
    title: 'Flooded road',
    category: 'Flooding',
    severity: 'High',
    location: 'Hazard Road',
    coordinates: hazardPoint
  });
  assert.equal(reportResponse.status, 201);

  // Like the Navigate button, send just the saved start/end. The server must
  // include the newly reported active hazard from its shared hazards store.
  const rerouteResponse = await postApi('/api/route', routeBody);
  assert.equal(rerouteResponse.status, 200);
  const reroutePayload = await rerouteResponse.json();
  assert.equal(overpassRequests, 1, 'repeated routes over the same map area should reuse the cached OSM graph');
  assert.equal(reroutePayload.hazardsConsidered, 1);
  assert.ok(reroutePayload.data.length > 0, 'a safe alternate route should be returned');
  assert.ok(
    reroutePayload.data.every((route) => !routeComesWithinMeters(route, hazardPoint, 100)),
    'every route presented for navigation must stay outside the hazard avoidance radius'
  );

  const alternateRoute = reroutePayload.data[0];
  assert.notDeepEqual(alternateRoute.geometry.coordinates, originalRoute.geometry.coordinates);
  assert.ok(
    alternateRoute.geometry.coordinates.some(([, lat]) => lat > 0.001),
    'the new route should use the available road detour'
  );
  assert.notEqual(alternateRoute.distance, originalRoute.distance);

  const otherToken = (await registerUser(baseUrl, 'route_other')).token;
  const otherAccountRoute = await postApi('/api/route', routeBody, otherToken);
  assert.equal((await otherAccountRoute.json()).hazardsConsidered, 0);
});

test('safe OSRM routes skip Overpass and hazard detours run before the local graph fetch', async () => {
  const routerPath = require.resolve('../src/dijkstra-router');
  const cachedRouter = require.cache[routerPath];
  const originalRoutingEngine = process.env.ROUTING_ENGINE;
  const originalOsrmBaseUrl = process.env.OSRM_BASE_URL;
  const previousFetch = global.fetch;
  process.env.ROUTING_ENGINE = 'osrm';
  process.env.OSRM_BASE_URL = 'https://osrm.test';
  delete require.cache[routerPath];

  let osrmRequests = 0;
  let forcedWaypointRequests = 0;
  let overpassRequests = 0;
  global.fetch = async (url, options = {}) => {
    if (String(url).startsWith('https://osrm.test/')) {
      osrmRequests += 1;
      const routePath = String(url).split('?')[0];
      const coordinateCount = routePath.slice(routePath.lastIndexOf('/') + 1).split(';').length;
      if (coordinateCount === 2) {
        return new Response(JSON.stringify(osrmPayload({
          distance: 1112,
          duration: 140,
          coordinates: [[0, 0], [0.01, 0]]
        })), { status: 200, headers: { 'content-type': 'application/json' } });
      }

      if (coordinateCount === 4) forcedWaypointRequests += 1;
      return new Response(JSON.stringify(osrmPayload({
        distance: 1500,
        duration: 190,
        coordinates: [[0, 0], [0.003, 0.002], [0.007, 0.002], [0.01, 0]]
      })), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    overpassRequests += 1;
    assert.equal(options.method, 'POST');
    return new Response(JSON.stringify({ elements: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const { calculateDijkstraRoutes } = require('../src/dijkstra-router');
    const routes = await calculateDijkstraRoutes(
      { lat: 0, lng: 0 },
      { lat: 0, lng: 0.01 },
      [{ coordinates: { lat: 0, lng: 0.005 } }],
      3
    );

    assert.equal(osrmRequests, 3, 'one normal route request and two detour-side requests are expected');
    assert.equal(forcedWaypointRequests, 2, 'both detour requests should include two waypoints around the hazard');
    assert.equal(overpassRequests, 0, 'a successful OSRM detour should avoid the slower graph download');
    assert.ok(routes.length > 0, 'a safe OSRM detour should be returned');
    assert.ok(routes.every((route) => !routeComesWithinMeters(route, { lat: 0, lng: 0.005 }, 100)));
    assert.ok(routes[0].geometry.coordinates.some(([, lat]) => lat > 0.001));

    osrmRequests = 0;
    const ordinaryRoutes = await calculateDijkstraRoutes(
      { lat: 0, lng: 0 },
      { lat: 0, lng: 0.01 },
      [],
      3
    );
    assert.equal(osrmRequests, 1, 'a validated ordinary OSRM route should return after its first request');
    assert.equal(overpassRequests, 0, 'ordinary navigation should not fetch the local graph after OSRM succeeds');
    assert.equal(ordinaryRoutes.length, 1);
  } finally {
    global.fetch = previousFetch;
    if (originalRoutingEngine === undefined) delete process.env.ROUTING_ENGINE;
    else process.env.ROUTING_ENGINE = originalRoutingEngine;
    if (originalOsrmBaseUrl === undefined) delete process.env.OSRM_BASE_URL;
    else process.env.OSRM_BASE_URL = originalOsrmBaseUrl;
    delete require.cache[routerPath];
    require.cache[routerPath] = cachedRouter;
  }
});
