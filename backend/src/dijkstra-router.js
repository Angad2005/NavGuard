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
const ROUTING_ENGINE = String(process.env.ROUTING_ENGINE || 'osrm').toLowerCase();
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
      id: `${wayId}:${fromId}>${toId}`,
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

function shortestPath(graph, startId, endId, hazards, bannedEdges = new Set(), bannedNodes = new Set()) {
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
      if (bannedNodes.has(edge.toId)) continue;

      // A reported hazard is a road closure/avoidance constraint, not merely
      // a preference. A finite penalty can still make the hazardous road win
      // when the detour is longer, which means every generated alternative
      // may continue through the hazard. Exclude those edges before running
      // Dijkstra so both the recommended route and its alternatives are safe.
      if (edgeTouchesHazard(edge, hazards, DEFAULT_HAZARD_RADIUS_METERS)) continue;

      const nextCost = current.cost + edge.durationSeconds;
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

function pathSignature(edges) {
  return edges.map((edge) => edge.id).join('|');
}

function pathDuration(edges) {
  return edges.reduce((total, edge) => total + edge.durationSeconds, 0);
}

function samePathPrefix(path, prefix) {
  return path.length >= prefix.length
    && prefix.every((edge, index) => path[index].id === edge.id);
}

function kShortestPaths(graph, startId, endId, hazards, limit) {
  const firstPath = shortestPath(graph, startId, endId, hazards);
  if (!firstPath) return [];

  const accepted = [firstPath];
  const acceptedSignatures = new Set([pathSignature(firstPath)]);
  const candidates = new Map();

  while (accepted.length < limit) {
    const previousPath = accepted[accepted.length - 1];
    let rootPath = [];
    let spurNodeId = startId;

    for (let spurIndex = 0; spurIndex < previousPath.length; spurIndex += 1) {
      const bannedEdges = new Set();
      for (const path of accepted) {
        if (path.length > spurIndex && samePathPrefix(path, rootPath)) {
          bannedEdges.add(path[spurIndex].id);
        }
      }

      const bannedNodes = new Set();
      let rootNodeId = startId;
      for (const edge of rootPath) {
        bannedNodes.add(rootNodeId);
        rootNodeId = edge.toId;
      }

      const spurPath = shortestPath(graph, spurNodeId, endId, hazards, bannedEdges, bannedNodes);
      if (spurPath) {
        const totalPath = [...rootPath, ...spurPath];
        const signature = pathSignature(totalPath);
        if (!acceptedSignatures.has(signature) && !candidates.has(signature)) {
          candidates.set(signature, totalPath);
        }
      }

      const rootEdge = previousPath[spurIndex];
      rootPath = [...rootPath, rootEdge];
      spurNodeId = rootEdge.toId;
    }

    if (candidates.size === 0) break;
    const [nextSignature, nextPath] = [...candidates.entries()]
      .sort((a, b) => pathDuration(a[1]) - pathDuration(b[1]))[0];
    candidates.delete(nextSignature);
    accepted.push(nextPath);
    acceptedSignatures.add(nextSignature);
  }

  return accepted;
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

function routeGeometryPoints(route) {
  const coordinates = route && route.geometry && Array.isArray(route.geometry.coordinates)
    ? route.geometry.coordinates
    : [];
  return coordinates
    .filter((coordinate) => Array.isArray(coordinate) && coordinate.length >= 2)
    .map((coordinate) => ({ lat: Number(coordinate[1]), lng: Number(coordinate[0]) }))
    .filter(isValidPoint);
}

function sampleRoute(route, sampleCount = 64) {
  const points = routeGeometryPoints(route);
  if (points.length < 2) return points;
  const totalDistance = points.slice(1).reduce((total, point, index) => (
    total + distanceMeters(points[index], point)
  ), 0);
  if (totalDistance <= 0) return [points[0]];

  return Array.from({ length: sampleCount }, (_value, index) => (
    pointAtRouteDistance(points, totalDistance * (index / (sampleCount - 1)))
  ));
}

function routeOverlap(samplePoints, routePoints, toleranceMeters = 75) {
  if (samplePoints.length === 0 || routePoints.length < 2) return 0;
  const matchingPoints = samplePoints.filter((point) => {
    for (let index = 1; index < routePoints.length; index += 1) {
      if (distanceToSegmentMeters(point, routePoints[index - 1], routePoints[index]) <= toleranceMeters) {
        return true;
      }
    }
    return false;
  });
  return matchingPoints.length / samplePoints.length;
}

function routesAreEquivalent(first, second) {
  const firstPoints = routeGeometryPoints(first);
  const secondPoints = routeGeometryPoints(second);
  if (firstPoints.length < 2 || secondPoints.length < 2) return false;
  const firstSamples = sampleRoute(first);
  const secondSamples = sampleRoute(second);
  return routeOverlap(firstSamples, secondPoints) >= 0.985
    && routeOverlap(secondSamples, firstPoints) >= 0.985;
}

function mergeRouteCandidates(routeGroups, hazards, limit) {
  const routes = routeGroups.flat()
    .filter((route) => route && route.geometry && !routeTouchesHazard(route, hazards))
    .sort((a, b) => a.duration - b.duration);
  const uniqueRoutes = [];

  for (const route of routes) {
    if (uniqueRoutes.some((candidate) => routesAreEquivalent(candidate, route))) continue;
    uniqueRoutes.push(route);
    if (uniqueRoutes.length >= limit) break;
  }

  return uniqueRoutes;
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

async function calculateOsrmRoutes(start, end, hazards, limit, { allowDetours = false, baseRoutes = null } = {}) {
  const routes = Array.isArray(baseRoutes) ? baseRoutes : await requestOsrmRoutes(start, end);
  const safeRoutes = filterSafeRoutes(routes, hazards, limit);
  if (!allowDetours || safeRoutes.length >= limit) return safeRoutes;

  // OSRM only returns a small set of ordinary alternatives. When all of them
  // cross a hazard, ask it to route through points on either side of the
  // affected road segment. The returned geometry is still checked against
  // every active hazard before it can be used for navigation.
  const unsafeRoute = routes
    .filter((route) => route.geometry && routeTouchesHazard(route, hazards))
    .sort((a, b) => a.duration - b.duration)[0];
  if (!unsafeRoute) return safeRoutes;

  const affectedHazards = hazards
    .map((hazard) => ({ hazard, projection: projectHazardOntoRoute(unsafeRoute, hazard) }))
    .filter((item) => item.projection && item.projection.distance <= DEFAULT_HAZARD_RADIUS_METERS)
    .sort((a, b) => a.projection.alongRoute - b.projection.alongRoute);
  if (affectedHazards.length === 0) return safeRoutes;

  const detourPlans = createDetourSidePlans(affectedHazards.length);
  let combinedRoutes = safeRoutes;
  for (let index = 0; index < detourPlans.length; index += 2) {
    const batch = detourPlans.slice(index, index + 2);
    const results = await Promise.all(batch.map(async (sides) => {
      const waypoints = createHazardDetourWaypoints(unsafeRoute, affectedHazards, sides);
      if (waypoints.length !== affectedHazards.length * 2) return [];
      try {
        return await requestOsrmRoutes(start, end, waypoints);
      } catch (_error) {
        // A particular set of forced waypoints may not connect to the road
        // network. Continue with the other side of the hazard instead.
        return [];
      }
    }));
    const detouredRoutes = results.flat();
    const safeDetours = filterSafeRoutes(detouredRoutes, hazards, limit);
    combinedRoutes = mergeRouteCandidates([combinedRoutes, safeDetours], hazards, limit);
    // One verified detour is enough to resume navigation. Avoid extra OSRM
    // waypoint batches once the app has a route that clears every hazard.
    if (combinedRoutes.length > 0) return combinedRoutes;
  }

  return combinedRoutes;
}

async function requestOsrmRoutes(start, end, waypoints = []) {
  const coordinates = [start, ...waypoints, end]
    .map((point) => `${point.lng},${point.lat}`)
    .join(';');
  const url = `${OSRM_BASE_URL}/route/v1/driving/${coordinates}`
    + `?alternatives=true&steps=true&geometries=geojson&overview=full&continue_straight=false`;
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
      `The OpenStreetMap routing service could not be reached: ${cause.name === 'AbortError' ? 'request timed out' : cause.message}`
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
    .filter((route) => route.geometry && route.geometry.type === 'LineString');
}

function filterSafeRoutes(routes, hazards, limit) {
  return routes
    .filter((route) => route.geometry && route.geometry.type === 'LineString')
    .filter((route) => !routeTouchesHazard(route, hazards))
    .sort((a, b) => a.duration - b.duration)
    .slice(0, limit);
}

function projectHazardOntoRoute(route, hazard) {
  const coordinates = route && route.geometry && Array.isArray(route.geometry.coordinates)
    ? route.geometry.coordinates
    : [];
  const points = coordinates
    .filter((coordinate) => Array.isArray(coordinate) && coordinate.length >= 2)
    .map((coordinate) => ({ lat: Number(coordinate[1]), lng: Number(coordinate[0]) }))
    .filter(isValidPoint);
  if (points.length < 2) return null;

  const latitudeScale = 111320;
  const longitudeScale = latitudeScale * Math.cos(hazard.coordinates.lat * Math.PI / 180);
  let traversedDistance = 0;
  let nearest = null;

  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const dx = (to.lng - from.lng) * longitudeScale;
    const dy = (to.lat - from.lat) * latitudeScale;
    const px = (hazard.coordinates.lng - from.lng) * longitudeScale;
    const py = (hazard.coordinates.lat - from.lat) * latitudeScale;
    const lengthSquared = dx * dx + dy * dy;
    const fraction = lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, (px * dx + py * dy) / lengthSquared));
    const projectedPoint = {
      lat: from.lat + ((to.lat - from.lat) * fraction),
      lng: from.lng + ((to.lng - from.lng) * fraction)
    };
    const distance = distanceMeters(hazard.coordinates, projectedPoint);
    if (!nearest || distance < nearest.distance) {
      nearest = {
        distance,
        alongRoute: traversedDistance + (distanceMeters(from, to) * fraction)
      };
    }
    traversedDistance += distanceMeters(from, to);
  }

  return nearest;
}

function pointAtRouteDistance(points, targetDistance) {
  if (targetDistance <= 0) return points[0];
  let traversedDistance = 0;

  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const segmentDistance = distanceMeters(from, to);
    if (traversedDistance + segmentDistance >= targetDistance) {
      const fraction = segmentDistance === 0
        ? 0
        : (targetDistance - traversedDistance) / segmentDistance;
      return {
        lat: from.lat + ((to.lat - from.lat) * fraction),
        lng: from.lng + ((to.lng - from.lng) * fraction)
      };
    }
    traversedDistance += segmentDistance;
  }

  return points[points.length - 1];
}

function offsetPointMeters(point, eastMeters, northMeters) {
  const latitudeScale = 111320;
  const longitudeScale = latitudeScale * Math.cos(point.lat * Math.PI / 180);
  if (Math.abs(longitudeScale) < 1) return point;
  return {
    lat: point.lat + (northMeters / latitudeScale),
    lng: point.lng + (eastMeters / longitudeScale)
  };
}

function createHazardDetourWaypoints(route, affectedHazards, sides) {
  const coordinates = route.geometry.coordinates || [];
  const points = coordinates
    .filter((coordinate) => Array.isArray(coordinate) && coordinate.length >= 2)
    .map((coordinate) => ({ lat: Number(coordinate[1]), lng: Number(coordinate[0]) }))
    .filter(isValidPoint);
  if (points.length < 2) return [];

  const totalDistance = points.slice(1).reduce((total, point, index) => (
    total + distanceMeters(points[index], point)
  ), 0);
  const lateralOffset = 250;
  const longitudinalOffset = 250;
  const waypoints = [];

  for (let index = 0; index < affectedHazards.length; index += 1) {
    const alongRoute = affectedHazards[index].projection.alongRoute;
    const beforeDistance = Math.max(0, alongRoute - longitudinalOffset);
    const afterDistance = Math.min(totalDistance, alongRoute + longitudinalOffset);
    const tangentStart = pointAtRouteDistance(points, Math.max(0, alongRoute - 25));
    const tangentEnd = pointAtRouteDistance(points, Math.min(totalDistance, alongRoute + 25));
    const latitudeScale = 111320;
    const longitudeScale = latitudeScale * Math.cos(((tangentStart.lat + tangentEnd.lat) / 2) * Math.PI / 180);
    const east = (tangentEnd.lng - tangentStart.lng) * longitudeScale;
    const north = (tangentEnd.lat - tangentStart.lat) * latitudeScale;
    const tangentLength = Math.hypot(east, north);
    if (tangentLength === 0) return [];

    const side = sides[index];
    const normalEast = (-north / tangentLength) * side * lateralOffset;
    const normalNorth = (east / tangentLength) * side * lateralOffset;
    const before = offsetPointMeters(pointAtRouteDistance(points, beforeDistance), normalEast, normalNorth);
    const after = offsetPointMeters(pointAtRouteDistance(points, afterDistance), normalEast, normalNorth);
    waypoints.push(before, after);
  }

  return waypoints;
}

function createDetourSidePlans(hazardCount) {
  const allLeft = Array(hazardCount).fill(1);
  const allRight = Array(hazardCount).fill(-1);
  const plans = [allLeft, allRight];
  if (hazardCount > 1) {
    const alternating = Array.from({ length: hazardCount }, (_value, index) => (index % 2 === 0 ? 1 : -1));
    plans.push(alternating, alternating.map((side) => -side));
  }

  return [...new Map(plans.map((plan) => [plan.join(','), plan])).values()];
}

async function tryOsrmHazardDetour(start, end, hazards, limit, baseRoutes) {
  if (ROUTING_ENGINE === 'dijkstra' || hazards.length === 0) return [];
  try {
    return await calculateOsrmRoutes(start, end, hazards, limit, {
      allowDetours: true,
      baseRoutes
    });
  } catch (_error) {
    return [];
  }
}

async function calculateDijkstraRoutes(start, end, hazards, limit = 3) {
  if (!isValidPoint(start) || !isValidPoint(end)) {
    throw new TypeError('Start and end must contain valid latitude/longitude coordinates.');
  }

  const safeStart = { lat: Number(start.lat), lng: Number(start.lng) };
  const safeEnd = { lat: Number(end.lat), lng: Number(end.lng) };
  const safeHazards = normalizeHazards(hazards);
  const routeLimit = Number.isInteger(limit) ? Math.max(1, Math.min(limit, 5)) : 3;

  // Use OSRM first. The local graph is a fallback when OSRM cannot provide a
  // safe route, rather than a required second source for every request.
  let primaryOsrmRoutes = null;
  let safeOsrmRoutes = [];
  let osrmDetourRoutes = null;
  async function getOsrmDetourRoutes() {
    if (osrmDetourRoutes === null) {
      osrmDetourRoutes = primaryOsrmRoutes
        ? await tryOsrmHazardDetour(
          safeStart, safeEnd, safeHazards, routeLimit, primaryOsrmRoutes
        )
        : [];
    }
    return osrmDetourRoutes;
  }

  if (ROUTING_ENGINE !== 'dijkstra') {
    try {
      primaryOsrmRoutes = await requestOsrmRoutes(safeStart, safeEnd);
      safeOsrmRoutes = mergeRouteCandidates(
        [filterSafeRoutes(primaryOsrmRoutes, safeHazards, routeLimit)],
        safeHazards,
        routeLimit
      );
      // OSRM's safe routes are already usable. Avoid the slower Overpass graph
      // request just to fill comparison cards with extra alternatives.
      if (safeOsrmRoutes.length > 0) return safeOsrmRoutes;
    } catch (error) {
      // Fall through to the local graph so a temporary OSRM outage does not
      // make navigation unusable.
      console.warn('[NaviGuard] OSRM routing unavailable; using local fallback:', error.message);
    }
  }

  // If every regular OSRM alternative crosses a hazard, try waypoint-based
  // detours before downloading and rebuilding the local road graph.
  if (safeHazards.length > 0 && primaryOsrmRoutes) {
    const detouredRoutes = await getOsrmDetourRoutes();
    if (detouredRoutes.length > 0) return detouredRoutes;
  }

  let graph;
  try {
    graph = await loadOsmGraph(safeStart, safeEnd);
  } catch (error) {
    if (error && error.code === 'LOCAL_GRAPH_AREA_EXCEEDED') {
      const osrmRoutes = primaryOsrmRoutes
        ? await getOsrmDetourRoutes()
        : await calculateOsrmRoutes(safeStart, safeEnd, safeHazards, routeLimit, {
          allowDetours: true,
          baseRoutes: primaryOsrmRoutes
        });
      return mergeRouteCandidates([safeOsrmRoutes, osrmRoutes], safeHazards, routeLimit);
    }
    const detouredRoutes = await getOsrmDetourRoutes();
    const fallbackRoutes = mergeRouteCandidates(
      [safeOsrmRoutes, detouredRoutes], safeHazards, routeLimit
    );
    if (fallbackRoutes.length > 0) return fallbackRoutes;
    throw error;
  }

  if (graph.nodes.size === 0) {
    const detouredRoutes = await getOsrmDetourRoutes();
    const fallbackRoutes = mergeRouteCandidates(
      [safeOsrmRoutes, detouredRoutes], safeHazards, routeLimit
    );
    if (fallbackRoutes.length > 0) return fallbackRoutes;
    const error = new Error('No drivable OpenStreetMap roads were found in the selected area.');
    error.status = 404;
    throw error;
  }

  const startNode = nearestNode(graph, safeStart);
  const endNode = nearestNode(graph, safeEnd);
  if (!startNode || !endNode) {
    const detouredRoutes = await getOsrmDetourRoutes();
    const fallbackRoutes = mergeRouteCandidates(
      [safeOsrmRoutes, detouredRoutes], safeHazards, routeLimit
    );
    if (fallbackRoutes.length > 0) return fallbackRoutes;
    const error = new Error('No mapped drivable roads were found near the selected points.');
    error.status = 404;
    throw error;
  }
  if (startNode.distance > MAX_SNAP_DISTANCE_METERS || endNode.distance > MAX_SNAP_DISTANCE_METERS) {
    const detouredRoutes = await getOsrmDetourRoutes();
    const fallbackRoutes = mergeRouteCandidates(
      [safeOsrmRoutes, detouredRoutes], safeHazards, routeLimit
    );
    if (fallbackRoutes.length > 0) return fallbackRoutes;
    const error = new Error(
      `The start or destination is too far from a mapped road (maximum snap distance: ${MAX_SNAP_DISTANCE_METERS} m).`
    );
    error.status = 400;
    throw error;
  }

  const firstPath = shortestPath(graph, startNode.id, endNode.id, safeHazards);
  if (!firstPath) {
    const detouredRoutes = await getOsrmDetourRoutes();
    return mergeRouteCandidates([safeOsrmRoutes, detouredRoutes], safeHazards, routeLimit);
  }

  const graphPaths = kShortestPaths(graph, startNode.id, endNode.id, safeHazards, Math.max(routeLimit * 3, routeLimit));
  const localRoutes = [];
  for (const edges of graphPaths) {
    const route = routeFromEdges(edges, safeStart, safeEnd, startNode.point, endNode.point);
    if (!routeTouchesHazard(route, safeHazards)) localRoutes.push(route);
  }

  const localAndOsrmRoutes = mergeRouteCandidates(
    [safeOsrmRoutes, localRoutes], safeHazards, routeLimit
  );
  if (localAndOsrmRoutes.length >= routeLimit) return localAndOsrmRoutes;

  const detouredRoutes = await getOsrmDetourRoutes();
  return mergeRouteCandidates(
    [localAndOsrmRoutes, detouredRoutes], safeHazards, routeLimit
  );
}

module.exports = {
  calculateDijkstraRoutes,
  distanceMeters,
  distanceToSegmentMeters
};
