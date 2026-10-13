'use strict';

const DEFAULT_OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];

const OVERPASS_URLS = (process.env.OVERPASS_URLS || process.env.OVERPASS_URL || DEFAULT_OVERPASS_URLS.join(','))
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);
const OVERPASS_TIMEOUT_MS = Number(process.env.OVERPASS_TIMEOUT_MS) || 35000;
const OSRM_TIMEOUT_MS = Number(process.env.OSRM_TIMEOUT_MS) || 20000;
const OSRM_BASE_URL = (process.env.OSRM_BASE_URL || 'https://router.project-osrm.org').replace(/\/+$/, '');
const OVERPASS_USER_AGENT = process.env.OVERPASS_USER_AGENT || 'NaviGuard/1.0 (OpenStreetMap route planner)';
const MAX_GRAPH_AREA_DEGREES = Number(process.env.MAX_GRAPH_AREA_DEGREES) || 0.3;
const MAX_SNAP_DISTANCE_METERS = Number(process.env.MAX_SNAP_DISTANCE_METERS) || 2500;
const DEFAULT_HAZARD_RADIUS_METERS = 100;

const ROAD_TYPES = [
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified',
  'residential', 'motorway_link', 'trunk_link', 'primary_link',
  'secondary_link', 'tertiary_link', 'living_street', 'service'
];
const ROAD_PATTERN = ROAD_TYPES.join('|');

const DEFAULT_SPEED_KPH = {
  motorway: 90,
  trunk: 70,
  primary: 55,
  secondary: 45,
  tertiary: 35,
  unclassified: 30,
  residential: 30,
  living_street: 10,
  service: 18,
  motorway_link: 45,
  trunk_link: 40,
  primary_link: 35,
  secondary_link: 30,
  tertiary_link: 25
};

class MinHeap {
  constructor() {
    this.items = [];
  }

  push(item) {
    this.items.push(item);
    let index = this.items.length - 1;

    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.items[parent].cost <= item.cost) break;
      this.items[index] = this.items[parent];
      index = parent;
    }

    this.items[index] = item;
  }

  pop() {
    if (this.items.length === 0) return null;

    const first = this.items[0];
    const last = this.items.pop();

    if (this.items.length > 0) {
      let index = 0;
      while (true) {
        const left = (index * 2) + 1;
        const right = left + 1;
        let smallest = index;

        if (left < this.items.length && this.items[left].cost < this.items[smallest].cost) {
          smallest = left;
        }
        if (right < this.items.length && this.items[right].cost < this.items[smallest].cost) {
          smallest = right;
        }
        if (smallest === index) break;

        this.items[index] = this.items[smallest];
        index = smallest;
      }
      this.items[index] = last;
    }

    return first;
  }
}

function isValidPoint(point) {
  if (!point || typeof point !== 'object') return false;
  const invalid = (value) => value === null || value === undefined || value === '' || typeof value === 'boolean';
  if (invalid(point.lat) || invalid(point.lng)) return false;
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  return Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function distanceMeters(a, b) {
  const earthRadius = 6371000;
  const lat1 = Number(a.lat) * Math.PI / 180;
  const lat2 = Number(b.lat) * Math.PI / 180;
  const dLat = (Number(b.lat) - Number(a.lat)) * Math.PI / 180;
  const dLng = (Number(b.lng) - Number(a.lng)) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const boundedH = Math.max(0, Math.min(1, h));
  return 2 * earthRadius * Math.atan2(Math.sqrt(boundedH), Math.sqrt(1 - boundedH));
}

function distanceToSegmentMeters(point, start, end) {
  const latitudeScale = 111320;
  const longitudeScale = latitudeScale * Math.cos(Number(point.lat) * Math.PI / 180);
  const px = Number(point.lng) * longitudeScale;
  const py = Number(point.lat) * latitudeScale;
  const ax = Number(start.lng) * longitudeScale;
  const ay = Number(start.lat) * latitudeScale;
  const bx = Number(end.lng) * longitudeScale;
  const by = Number(end.lat) * latitudeScale;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const projection = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));

  const projectedPoint = {
    lat: (ay + projection * dy) / latitudeScale,
    lng: longitudeScale === 0 ? Number(point.lng) : (ax + projection * dx) / longitudeScale
  };
  return distanceMeters(point, projectedPoint);
}

function normalizeHazards(hazards) {
  if (!Array.isArray(hazards)) return [];
  return hazards.filter((hazard) => hazard && isValidPoint(hazard.coordinates))
    .map((hazard) => ({
      coordinates: {
        lat: Number(hazard.coordinates.lat),
        lng: Number(hazard.coordinates.lng)
      }
    }));
}

function edgeTouchesHazard(edge, hazards, radius) {
  return hazards.some((hazard) => distanceToSegmentMeters(
    hazard.coordinates,
    edge.from,
    edge.to
  ) <= radius);
}

function graphBounds(start, end) {
  const straightLineDistance = distanceMeters(start, end);
  const padding = Math.min(0.05, Math.max(0.01, (straightLineDistance / 1000) * 0.002));
  const south = Math.min(start.lat, end.lat) - padding;
  const north = Math.max(start.lat, end.lat) + padding;
  const west = Math.min(start.lng, end.lng) - padding;
  const east = Math.max(start.lng, end.lng) + padding;

  if ((north - south) > MAX_GRAPH_AREA_DEGREES || (east - west) > MAX_GRAPH_AREA_DEGREES) {
    const error = new Error(
      `The selected locations are too far apart for local road-graph routing. `
      + `Move them closer together or increase MAX_GRAPH_AREA_DEGREES (currently ${MAX_GRAPH_AREA_DEGREES}).`
    );
    error.status = 400;
    error.code = 'LOCAL_GRAPH_AREA_EXCEEDED';
    throw error;
  }

  return { south, west, north, east };
}

function parseMaxSpeedKph(value) {
  if (value === undefined || value === null) return null;
  const match = String(value).match(/(\d+(?:\.\d+)?)\s*(mph|km\/h|kmh|kph)?/i);
  if (!match) return null;
  let speed = Number(match[1]);
  if (!Number.isFinite(speed) || speed <= 0) return null;
  if (match[2] && match[2].toLowerCase() === 'mph') speed *= 1.60934;
  return Math.max(5, Math.min(130, speed));
}

function estimateSpeedKph(tags) {
  const explicit = parseMaxSpeedKph(tags.maxspeed);
  if (explicit !== null) return explicit;
  return DEFAULT_SPEED_KPH[tags.highway] || 25;
}

function safeHostname(endpoint) {
  try {
    return new URL(endpoint).hostname;
  } catch (_error) {
    return 'invalid endpoint';
  }
}

async function fetchOverpass(endpoint, query) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);

  try {
    let response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': OVERPASS_USER_AGENT
      },
      body: new URLSearchParams({ data: query }),
      signal: controller.signal
    });

    if (response.status === 406) {
      const separator = endpoint.includes('?') ? '&' : '?';
      response = await fetch(`${endpoint}${separator}data=${encodeURIComponent(query)}`, {
        method: 'GET',
        headers: { Accept: 'application/json', 'User-Agent': OVERPASS_USER_AGENT },
        signal: controller.signal
      });
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (!payload || !Array.isArray(payload.elements)) {
      throw new Error('invalid Overpass JSON payload');
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function isDrivableWay(tags) {
  if (!tags || !ROAD_TYPES.includes(tags.highway)) return false;
  if (tags.access === 'no' || tags.motor_vehicle === 'no') return false;
  if (tags.access === 'private' || tags.motor_vehicle === 'private') return false;
  return true;
}

async function loadOsmGraph(start, end) {
  const bounds = graphBounds(start, end);
  const query = `[out:json][timeout:25];way[highway~"^(${ROAD_PATTERN})$"]`
    + `[access!="no"][motor_vehicle!="no"]`
    + `(${bounds.south},${bounds.west},${bounds.north},${bounds.east});out geom;`;
  let payload = null;
  const failures = [];

  for (const endpoint of OVERPASS_URLS) {
    try {
      payload = await fetchOverpass(endpoint, query);
      break;
    } catch (error) {
      const reason = error.name === 'AbortError' ? 'timed out' : error.message;
      failures.push(`${safeHostname(endpoint)}: ${reason}`);
    }
  }

  if (!payload) {
    const error = new Error(`OpenStreetMap road data is unavailable. Overpass providers failed: ${failures.join('; ')}.`);
    error.status = 502;
    throw error;
  }

  const nodes = new Map();
  const adjacency = new Map();

  function addNode(id, point) {
    if (!isValidPoint(point)) return;
    if (!nodes.has(id)) nodes.set(id, point);
    if (!adjacency.has(id)) adjacency.set(id, []);
  }

  function addEdge(fromId, toId, tags, wayId) {
    if (fromId === toId || !nodes.has(fromId) || !nodes.has(toId)) return;
    const from = nodes.get(fromId);
    const to = nodes.get(toId);
    const distance = distanceMeters(from, to);
    if (!(distance > 0) || !Number.isFinite(distance)) return;

    const speedKph = estimateSpeedKph(tags);
    adjacency.get(fromId).push({
      id: `${fromId}>${toId}`,
      fromId,
      toId,
      from,
      to,
      distance,
      durationSeconds: distance / (speedKph / 3.6),
      name: typeof tags.name === 'string' ? tags.name : '',
      highway: tags.highway,
      wayId: String(wayId)
    });
  }

  for (const way of payload.elements) {
    if (way.type !== 'way' || !isDrivableWay(way.tags || {})) continue;

    const geometry = Array.isArray(way.geometry) ? way.geometry : [];
    const nodeIds = Array.isArray(way.nodes) ? way.nodes : [];
    const count = Math.min(nodeIds.length, geometry.length);
    if (count < 2) continue;

    for (let index = 0; index < count; index += 1) {
      addNode(String(nodeIds[index]), {
        lat: Number(geometry[index].lat),
        lng: Number(geometry[index].lon)
      });
    }

    const tags = way.tags || {};
    const onewayValue = String(tags.oneway || '').toLowerCase();
    const isOneway = ['yes', '1', 'true', '-1'].includes(onewayValue) || tags.junction === 'roundabout';
    const reverseOnly = onewayValue === '-1';

    for (let index = 1; index < count; index += 1) {
      const fromId = String(nodeIds[index - 1]);
      const toId = String(nodeIds[index]);

      if (reverseOnly) {
        addEdge(toId, fromId, tags, way.id);
      } else {
        addEdge(fromId, toId, tags, way.id);
      }

      if (!isOneway) {
        if (reverseOnly) addEdge(fromId, toId, tags, way.id);
        else addEdge(toId, fromId, tags, way.id);
      }
    }
  }

  return { nodes, adjacency };
}

function nearestNode(graph, point) {
  let best = null;
  for (const [id, candidate] of graph.nodes) {
    const distance = distanceMeters(point, candidate);
    if (!best || distance < best.distance) best = { id, point: candidate, distance };
  }
  return best;
}

function shortestPath(graph, startId, endId, hazards, bannedEdges = new Set()) {
  const costs = new Map([[startId, 0]]);
  const previous = new Map();
  const heap = new MinHeap();
  heap.push({ id: startId, cost: 0 });

  while (heap.items.length > 0) {
    const current = heap.pop();
    if (current.cost !== costs.get(current.id)) continue;
    if (current.id === endId) break;

    for (const edge of graph.adjacency.get(current.id) || []) {
      if (bannedEdges.has(edge.id)) continue;
      
      // Apply a cost penalty for touching hazards instead of hard blocking,
      // allowing alternative routes to bypass hazards smoothly.
      const touchesHazard = edgeTouchesHazard(edge, hazards, DEFAULT_HAZARD_RADIUS_METERS);
      const hazardPenalty = touchesHazard ? 600 : 0;

      const nextCost = current.cost + edge.durationSeconds + hazardPenalty;
      if (nextCost < (costs.get(edge.toId) ?? Infinity)) {
        costs.set(edge.toId, nextCost);
        previous.set(edge.toId, { nodeId: current.id, edge });
        heap.push({ id: edge.toId, cost: nextCost });
      }
    }
  }

  if (!costs.has(endId)) return null;
  const edges = [];
  let cursor = endId;

  while (cursor !== startId) {
    const step = previous.get(cursor);
    if (!step) return null;
    edges.unshift(step.edge);
    cursor = step.nodeId;
  }
  return edges;
}

function bearingDegrees(from, to) {
  const lat1 = from.lat * Math.PI / 180;
  const lat2 = to.lat * Math.PI / 180;
  const deltaLng = (to.lng - from.lng) * Math.PI / 180;
  const y = Math.sin(deltaLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function turnInstruction(incomingBearing, outgoingBearing, roadName, isFirst) {
  const target = roadName ? ` onto ${roadName}` : '';
  if (isFirst || incomingBearing === null) return roadName ? `Start on ${roadName}` : 'Start and continue along the route';

  const change = ((outgoingBearing - incomingBearing + 540) % 360) - 180;
  if (Math.abs(change) < 25) return roadName ? `Continue on ${roadName}` : 'Continue straight';
  if (change >= 25 && change < 150) return `Turn right${target}`;
  if (change <= -25 && change > -150) return `Turn left${target}`;
  return `Make a U-turn${target}`;
}

function routeFromEdges(edges, start, end, startNode, endNode) {
  const geometryPoints = [];
  const steps = [];
  let distance = 0;
  let duration = 0;

  function addCoordinate(point) {
    const coordinate = [Number(point.lng), Number(point.lat)];
    const last = geometryPoints[geometryPoints.length - 1];
    if (!last || last[0] !== coordinate[0] || last[1] !== coordinate[1]) geometryPoints.push(coordinate);
  }

  const startConnectorDistance = distanceMeters(start, startNode);
  const endConnectorDistance = distanceMeters(endNode, end);
  addCoordinate(start);
  addCoordinate(startNode);
  distance += startConnectorDistance;
  duration += startConnectorDistance / (20 / 3.6);

  let currentGroup = null;
  let previousBearing = null;
  let firstStep = true;

  const flushGroup = () => {
    if (!currentGroup) return;
    const instruction = turnInstruction(
      currentGroup.incomingBearing,
      currentGroup.firstBearing,
      currentGroup.name,
      firstStep
    );
    steps.push({
      distance: currentGroup.distance,
      duration: currentGroup.duration,
      name: currentGroup.name,
      maneuver: {
        type: firstStep ? 'depart' : 'turn',
        instruction
      }
    });
    firstStep = false;
    currentGroup = null;
  };

  for (const edge of edges) {
    addCoordinate(edge.to);
    distance += edge.distance;
    duration += edge.durationSeconds;
    const edgeBearing = bearingDegrees(edge.from, edge.to);
    const groupKey = `${edge.name}|${edge.highway}`;

    if (!currentGroup || currentGroup.key !== groupKey) {
      flushGroup();
      currentGroup = {
        key: groupKey,
        name: edge.name,
        distance: edge.distance,
        duration: edge.durationSeconds,
        incomingBearing: previousBearing,
        firstBearing: edgeBearing,
        outgoingBearing: edgeBearing
      };
    } else {
      currentGroup.distance += edge.distance;
      currentGroup.duration += edge.durationSeconds;
      currentGroup.outgoingBearing = edgeBearing;
    }
    previousBearing = edgeBearing;
  }
  flushGroup();

  addCoordinate(endNode);
  addCoordinate(end);
  distance += endConnectorDistance;
  duration += endConnectorDistance / (20 / 3.6);

  if (steps.length > 0) {
    steps.push({
      distance: 0,
      duration: 0,
      name: '',
      maneuver: { type: 'arrive', instruction: 'Arrive at your destination' }
    });
  } else {
    steps.push({
      distance: distance,
      duration,
      name: '',
      maneuver: { type: 'depart', instruction: 'Proceed to your destination' }
    });
  }

  return {
    distance,
    duration,
    geometry: { type: 'LineString', coordinates: geometryPoints },
    legs: [{ steps }],
    engine: 'dijkstra'
  };
}

function routeTouchesHazard(route, hazards, radius = DEFAULT_HAZARD_RADIUS_METERS) {
  const coordinates = route && route.geometry && Array.isArray(route.geometry.coordinates)
    ? route.geometry.coordinates
    : [];
  if (coordinates.length === 0) return false;

  const points = coordinates
    .filter((coordinate) => Array.isArray(coordinate) && coordinate.length >= 2)
    .map((coordinate) => ({ lat: Number(coordinate[1]), lng: Number(coordinate[0]) }))
    .filter(isValidPoint);

  for (const hazard of hazards) {
    const location = hazard.coordinates;
    for (let index = 0; index < points.length; index += 1) {
      if (distanceMeters(location, points[index]) <= radius) return true;
      if (index > 0 && distanceToSegmentMeters(location, points[index - 1], points[index]) <= radius) {
        return true;
      }
    }
  }
  return false;
}

function osrmManeuverInstruction(step) {
  const maneuver = step && step.maneuver ? step.maneuver : {};
  const type = String(maneuver.type || '').toLowerCase();
  const modifier = String(maneuver.modifier || '').toLowerCase();
  const roadName = typeof step.name === 'string' ? step.name.trim() : '';
  const ontoRoad = roadName ? ` onto ${roadName}` : '';
  const modifierText = {
    left: 'Turn left',
    'slight left': 'Bear left',
    'sharp left': 'Turn sharp left',
    right: 'Turn right',
    'slight right': 'Bear right',
    'sharp right': 'Turn sharp right',
    straight: 'Continue straight',
    uturn: 'Make a U-turn'
  }[modifier];

  if (type === 'arrive') return 'Arrive at your destination';
  if (type === 'depart' || type === 'start') return roadName ? `Start on ${roadName}` : 'Start and continue along the route';
  if (type === 'roundabout' || type === 'rotary') return `Enter the roundabout${ontoRoad}`;
  if (type === 'exit roundabout' || type === 'roundabout turn') return `Exit the roundabout${ontoRoad}`;
  if (type === 'merge') return `Merge${modifier ? ` ${modifier}` : ''}${ontoRoad}`;
  if (type === 'fork') return `${modifierText || 'Follow the fork'}${ontoRoad}`;
  if (type === 'on ramp') return `Take the ramp${ontoRoad}`;
  if (type === 'off ramp') return `Take the exit${ontoRoad}`;
  if (type === 'end of road' || type === 'turn') return `${modifierText || 'Continue'}${ontoRoad}`;
  if (type === 'new name' || type === 'continue') return `Continue${ontoRoad}`;
  return roadName ? `Continue on ${roadName}` : 'Continue along the route';
}

function normalizeOsrmRoute(route) {
  const legs = (Array.isArray(route.legs) ? route.legs : []).map((leg) => ({
    distance: Number(leg.distance) || 0,
    duration: Number(leg.duration) || 0,
    steps: (Array.isArray(leg.steps) ? leg.steps : []).map((step) => ({
      distance: Number(step.distance) || 0,
      duration: Number(step.duration) || 0,
      name: typeof step.name === 'string' ? step.name : '',
      maneuver: {
        ...(step.maneuver && typeof step.maneuver === 'object' ? step.maneuver : {}),
        instruction: osrmManeuverInstruction(step)
      }
    }))
  }));

  return {
    distance: Number(route.distance) || 0,
    duration: Number(route.duration) || 0,
    geometry: route.geometry,
    legs,
    engine: 'osrm'
  };
}

async function calculateOsrmRoutes(start, end, hazards, limit) {
  const coordinates = `${start.lng},${start.lat};${end.lng},${end.lat}`;
  const url = `${OSRM_BASE_URL}/route/v1/driving/${coordinates}`
    + `?alternatives=${encodeURIComponent(String(Math.max(1, limit)))}&steps=true&geometries=geojson&overview=full`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
  } catch (cause) {
    const error = new Error(
      `The locations exceed the local Dijkstra map area and the long-distance routing service could not be reached: ${cause.name === 'AbortError' ? 'request timed out' : cause.message}`
    );
    error.status = 502;
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (_error) {
    payload = null;
  }

  if (!response.ok || !payload || payload.code !== 'Ok' || !Array.isArray(payload.routes)) {
    const reason = payload && payload.message ? payload.message : `HTTP ${response.status}`;
    const error = new Error(`Long-distance routing failed: ${reason}. Try another destination or configure OSRM_BASE_URL.`);
    error.status = 502;
    throw error;
  }

  return payload.routes
    .map(normalizeOsrmRoute)
    .filter((route) => route.geometry && route.geometry.type === 'LineString')
    .filter((route) => !routeTouchesHazard(route, hazards))
    .sort((a, b) => a.duration - b.duration)
    .slice(0, limit);
}

async function calculateDijkstraRoutes(start, end, hazards, limit = 3) {
  if (!isValidPoint(start) || !isValidPoint(end)) {
    throw new TypeError('Start and end must contain valid latitude/longitude coordinates.');
  }

  const safeStart = { lat: Number(start.lat), lng: Number(start.lng) };
  const safeEnd = { lat: Number(end.lat), lng: Number(end.lng) };
  const safeHazards = normalizeHazards(hazards);
  const routeLimit = Number.isInteger(limit) ? Math.max(1, Math.min(limit, 5)) : 3;
  let graph;
  try {
    graph = await loadOsmGraph(safeStart, safeEnd);
  } catch (error) {
    if (error && error.code === 'LOCAL_GRAPH_AREA_EXCEEDED') {
      return calculateOsrmRoutes(safeStart, safeEnd, safeHazards, routeLimit);
    }
    throw error;
  }

  if (graph.nodes.size === 0) {
    const error = new Error('No drivable OpenStreetMap roads were found in the selected area.');
    error.status = 404;
    throw error;
  }

  const startNode = nearestNode(graph, safeStart);
  const endNode = nearestNode(graph, safeEnd);
  if (!startNode || !endNode) {
    const error = new Error('No mapped drivable roads were found near the selected points.');
    error.status = 404;
    throw error;
  }
  if (startNode.distance > MAX_SNAP_DISTANCE_METERS || endNode.distance > MAX_SNAP_DISTANCE_METERS) {
    const error = new Error(
      `The start or destination is too far from a mapped road (maximum snap distance: ${MAX_SNAP_DISTANCE_METERS} m).`
    );
    error.status = 400;
    throw error;
  }

  const firstPath = shortestPath(graph, startNode.id, endNode.id, safeHazards);
  if (!firstPath) return [];

  const candidates = [];
  const signatures = new Set();
  const pendingBans = [];

  function addCandidate(edges) {
    const signature = edges.map((edge) => edge.id).join('|');
    if (signatures.has(signature)) return;
    signatures.add(signature);
    candidates.push(routeFromEdges(edges, safeStart, safeEnd, startNode.point, endNode.point));
    for (const edge of edges) pendingBans.push(new Set([edge.id]));
  }

  addCandidate(firstPath);
  while (candidates.length < routeLimit && pendingBans.length > 0) {
    const bannedEdges = pendingBans.shift();
    const alternative = shortestPath(graph, startNode.id, endNode.id, safeHazards, bannedEdges);
    if (alternative) addCandidate(alternative);
  }

  return candidates.sort((a, b) => a.duration - b.duration).slice(0, routeLimit);
}

module.exports = {
  calculateDijkstraRoutes,
  distanceMeters,
  distanceToSegmentMeters
};