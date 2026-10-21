'use strict';

const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');

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
    }
  ]
};

const originalFetch = global.fetch;
let app;
let hazardsHandler;
let routeHandler;

before(async () => {
  global.fetch = async (url, options = {}) => {
    assert.match(String(url), /^https:\/\/overpass\.test\//);
    assert.equal(options.method, 'POST');
    return new Response(JSON.stringify(roadGraph), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  app = require('../src/server');
  app.hazards.splice(0, app.hazards.length);
  hazardsHandler = getPostHandler('/api/hazards');
  routeHandler = getPostHandler('/api/route');
});

after(async () => {
  global.fetch = originalFetch;
  app.hazards.splice(0, app.hazards.length);
  if (configuredRoutingEngine === undefined) delete process.env.ROUTING_ENGINE;
  else process.env.ROUTING_ENGINE = configuredRoutingEngine;
  if (configuredOverpassUrls === undefined) delete process.env.OVERPASS_URLS;
  else process.env.OVERPASS_URLS = configuredOverpassUrls;
});

function getPostHandler(path) {
  const layer = app._router.stack.find((item) => (
    item.route && item.route.path === path && item.route.methods.post
  ));
  assert.ok(layer, `Expected an Express route for ${path}`);
  const handlerLayer = layer.route.stack[0];
  assert.ok(handlerLayer, `Expected a POST handler for ${path}`);
  return handlerLayer.handle;
}

async function invokeHandler(handler, body) {
  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.data = data; return this; }
  };
  await handler({ body }, response, (error) => { throw error; });
  return response;
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

  const originalRouteResponse = await invokeHandler(routeHandler, routeBody);
  assert.equal(originalRouteResponse.statusCode, 200);
  const originalRoute = originalRouteResponse.data.data[0];
  assert.ok(routeComesWithinMeters(originalRoute, hazardPoint, 100), 'the initial fastest route should cross the future hazard point');

  const reportResponse = await invokeHandler(hazardsHandler, {
    title: 'Flooded road',
    category: 'Flooding',
    severity: 'High',
    location: 'Hazard Road',
    coordinates: hazardPoint
  });
  assert.equal(reportResponse.statusCode, 201);

  // Like the Navigate button, send just the saved start/end. The server must
  // include the newly reported active hazard from its shared hazards store.
  const rerouteResponse = await invokeHandler(routeHandler, routeBody);
  assert.equal(rerouteResponse.statusCode, 200);
  assert.equal(rerouteResponse.data.hazardsConsidered, 1);
  assert.ok(rerouteResponse.data.data.length > 0, 'a safe alternate route should be returned');
  assert.ok(
    rerouteResponse.data.data.every((route) => !routeComesWithinMeters(route, hazardPoint, 100)),
    'every route presented for navigation must stay outside the hazard avoidance radius'
  );

  const alternateRoute = rerouteResponse.data.data[0];
  assert.notDeepEqual(alternateRoute.geometry.coordinates, originalRoute.geometry.coordinates);
  assert.ok(
    alternateRoute.geometry.coordinates.some(([, lat]) => lat > 0.001),
    'the new route should use the available road detour'
  );
  assert.notEqual(alternateRoute.distance, originalRoute.distance);
});

test('OSRM is asked for a detour when its normal route crosses a hazard and the local graph is empty', async () => {
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
    assert.ok(routes.length > 0, 'a safe OSRM detour should be returned');
    assert.ok(routes.every((route) => !routeComesWithinMeters(route, { lat: 0, lng: 0.005 }, 100)));
    assert.ok(routes[0].geometry.coordinates.some(([, lat]) => lat > 0.001));
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
