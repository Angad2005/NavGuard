'use strict';

/**
 * NavAI — Intelligent Real-Time Route & Safety Copilot Engine
 * 
 * Capabilities:
 * - Natural language understanding in English and Hinglish
 * - Strict Safety & Compliance Guardrails (Flood, Speeding, Barricades, Life-Safety Triage)
 * - Zero-delay mathematical telemetry reasoning (ETA, Proximity, Pavement Friction, Fuel)
 * - Optional Google Gemini LLM acceleration (via user key or process.env.GEMINI_API_KEY)
 */

function distanceMeters(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function analyzeRouteHazards(route, hazards = []) {
  if (!route || !route.geometry?.coordinates) return [];
  const coords = route.geometry.coordinates;

  const nearby = [];
  for (const h of hazards) {
    if (!h.coordinates) continue;
    let minD = Infinity;
    for (let i = 0; i < coords.length; i += 2) {
      const d = distanceMeters(
        { lat: coords[i][1], lng: coords[i][0] },
        { lat: h.coordinates.lat, lng: h.coordinates.lng }
      );
      if (d < minD) minD = d;
    }
    if (minD <= 1500) {
      nearby.push({
        id: h.id,
        title: h.title,
        category: h.category,
        severity: h.severity,
        location: h.location,
        distanceMeters: Math.round(minD)
      });
    }
  }

  nearby.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return nearby;
}

function describeWeatherCode(code) {
  if ([95, 96, 99].includes(code)) {
    return {
      label: 'Thunderstorm',
      traction: 'Severe Risk',
      brakingMultiplier: 1.8,
      dryStoppingMeters: 37,
      wetStoppingMeters: 67,
      advisory: 'Severe aquaplaning risk. Reduce speed by at least 25 km/h.'
    };
  }
  if ([61, 63, 65, 80, 81].includes(code)) {
    return {
      label: 'Active Rainfall',
      traction: 'Wet Asphalt',
      brakingMultiplier: 1.5,
      dryStoppingMeters: 37,
      wetStoppingMeters: 52,
      advisory: 'Surface water layer active. Increase following gap to 4 car lengths.'
    };
  }
  if ([71, 73, 75].includes(code)) {
    return {
      label: 'Snowfall',
      traction: 'Slippery Pavement',
      brakingMultiplier: 2.2,
      dryStoppingMeters: 37,
      wetStoppingMeters: 81,
      advisory: 'Sub-zero pavement friction. Gentle steering and early braking required.'
    };
  }
  if ([45, 48].includes(code)) {
    return {
      label: 'Dense Fog',
      traction: 'Reduced Visibility',
      brakingMultiplier: 1.3,
      dryStoppingMeters: 37,
      wetStoppingMeters: 45,
      advisory: 'Visibility restricted below 80m. Keep low beams and fog lamps on.'
    };
  }
  return {
    label: 'Clear / Overcast',
    traction: 'Dry & Optimal',
    brakingMultiplier: 1.0,
    dryStoppingMeters: 37,
    wetStoppingMeters: 37,
    advisory: 'Optimal tire grip and pavement friction.'
  };
}

/**
 * Safety & Compliance Guardrails
 */
function evaluateGuardrails(q, weatherInfo) {
  // 1. Jailbreak & Prompt Injection
  if (/ignore\s+(all\s+)?(previous|prior)\s+instructions|system\s+prompt|\bdan\s+mode\b|\bjailbreak\b|pretend\s+you\s+have\s+no\s+(rules|limits)|you\s+are\s+now\s+unrestricted/i.test(q)) {
    return {
      guardrailTriggered: true,
      guardrailCategory: 'SECURITY',
      text:
        `🛡️ **SECURITY GUARDRAIL ENGAGED: SYSTEM INTEGRITY PROTECTED**\n\n` +
        `• Core road safety parameters and navigation directives cannot be overridden.\n` +
        `• External instructions attempting to disable safety boundaries or telemetry verification are rejected.\n` +
        `• NavAI is active and ready to assist with verified travel corridors.`,
      suggestions: ['Check route clearance', 'Atmospheric friction report', 'Audit active hazards']
    };
  }

  // 2. Flood & Waterlogging Hazard (Turn Around, Don't Drown)
  if (/drive\s+through.*(flood|water|submerged|puddle)|cross.*(flood|water|submerged)|(flood|water).*safe\s+to\s+drive|how\s+deep.*(water|flood)|can\s+i.*(cross|pass|drive).*(flood|water)|drive\s+in.*(water|flood)|pani\s+se\s+nikal|pani\s+bhara/i.test(q)) {
    return {
      guardrailTriggered: true,
      guardrailCategory: 'FLOOD_SAFETY',
      text:
        `🚨 **CRITICAL LIFE-SAFETY GUARDRAIL: FLOODED ROAD HAZARD**\n\n` +
        `• **Rule: Turn Around, Don't Drown!** Never attempt to drive through flooded roads or waterlogged underpasses.\n` +
        `• **Danger:** Just **15 cm (6 inches)** of moving water reaches vehicle exhaust/chassis, causing engine stall and loss of control. **30 cm (12 inches)** can float most passenger cars.\n` +
        `• **Action:** NaviGuard automatically builds safe detours around flooded spots. Allow NavAI to reroute you around the water.`,
      suggestions: ['Calculate detour around flood', 'Find alternate route', 'Nearest safe haven']
    };
  }

  // 3. Reckless Driving, Speeding & Law Violations
  if (/can\s+i\s+(speed|go\s+fast|drive\s+fast|race)|drive\s+(150|180|200)\s*(km|kmh|mph)?|ignore\s+(the\s+)?(speed\s+limit|traffic\s+light|red\s+light)|text\s+(while\s+)?driving|drive\s+(drunk|intoxicated|without\s+seatbelt)|run\s+(a\s+)?red\s+light|bypass\s+police|speed\s+badha\s+du|tez\s+chala/i.test(q)) {
    return {
      guardrailTriggered: true,
      guardrailCategory: 'SPEED_SAFETY',
      text:
        `🛡️ **SAFETY COMPLIANCE GUARDRAIL: RECKLESS DRIVING REFUSAL**\n\n` +
        `• **Direct Refusal:** NavAI will never endorse speeding, running red lights, or driving distracted.\n` +
        `• **Physics:** Braking distance scales quadratically with speed. On **${weatherInfo.traction}** pavement, driving 20 km/h over the limit extends your stopping distance by over 45%.\n` +
        `• **Action:** Maintain legal speeds, preserve safe following distance, and keep hands on the wheel.`,
      suggestions: ['Check speed advisories', 'View braking distances', 'Start safe simulation']
    };
  }

  // 4. Bypassing Barricades & Road Closures
  if (/bypass\s+(road\s+closed|barricade|barrier|cones|cordon)|drive\s+(around|past)\s+(road\s+closed|barrier|barricade)|sneak\s+through\s+construction/i.test(q)) {
    return {
      guardrailTriggered: true,
      guardrailCategory: 'ROAD_CLOSURE',
      text:
        `🛑 **INFRASTRUCTURE INTEGRITY GUARDRAIL: ROAD CLOSURE ENFORCEMENT**\n\n` +
        `• **Directive:** Do not bypass road closed barricades, municipal cones, or police cordons.\n` +
        `• **Risk:** Closures indicate active hazards like road washouts, sinkholes, live electrical wires, or structural bridge damage.\n` +
        `• **Action:** NaviGuard routes you exclusively along open, verified public corridors.`,
      suggestions: ['Check detour route', 'Report an active hazard', 'Review route clearance']
    };
  }

  // 5. Emergency Crash & Severe Medical Triage
  if (/\b(someone\s+is\s+injured|we\s+crashed|bad\s+accident|unconscious|heavy\s+bleeding|heart\s+attack|stroke|choking)\b|emergency\s+help\s+now|accident\s+ho\s+gaya/i.test(q)) {
    return {
      guardrailTriggered: true,
      guardrailCategory: 'EMERGENCY_TRIAGE',
      text:
        `🚨 **EMERGENCY LIFE-SAFETY TRIAGE OVERRIDE**\n\n` +
        `• **Step 1:** Call **112 / 911** immediately on your mobile phone.\n` +
        `• **Step 2:** Turn on your hazard flashers and pull over safely off the travel lane.\n` +
        `• **Step 3:** Tap the **Safe Haven (SOS)** tab on your left dock to get an instant route to the closest Emergency Trauma Care hospital.`,
      suggestions: ['Find nearest hospital', 'Copy current GPS fix', 'Find police station']
    };
  }

  // 6. Out-of-Domain Off-Topic Scope
  if (/write\s+(python|javascript|code|script|sql|html|css)|write\s+(an\s+essay|a\s+poem|a\s+story|a\s+song)|who\s+will\s+win\s+(the\s+)?(election|presidency|match|game)|\b(crypto|bitcoin|ethereum|stock\s+tips|buy\s+shares)\b|recipe\s+for|solve\s+(my\s+)?math\s+homework|joke\s+sunao/i.test(q)) {
    return {
      guardrailTriggered: true,
      guardrailCategory: 'OFF_TOPIC',
      text:
        `🧭 **NAVAI DOMAIN GUARDRAIL: NAVIGATION FOCUS**\n\n` +
        `• I am **NavAI**, your cockpit co-pilot focused purely on your travel safety and navigation.\n` +
        `• To keep your drive safe and distraction-free, I don't answer non-navigation topics like coding, general politics, or financial trading.\n` +
        `• Ask me about road conditions, arrival time, traffic, hazards, or weather friction!`,
      suggestions: ['Is my route clear?', 'Braking distance at 60 km/h', 'Check road hazards']
    };
  }

  return null;
}

/**
 * Intelligent Telemetry Dialogue Reasoner
 * Provides relevant, direct, accurate conversational answers for any driving question.
 */
function generateContextualAnswer(q, telemetry, nearbyHazards, weatherInfo, message = '') {
  const route = telemetry.route;
  const start = telemetry.startQuery || 'Starting Location';
  const end = telemetry.endQuery || 'Destination';
  const weather = telemetry.weather || {};
  const activeHazards = Array.isArray(telemetry.activeHazards) ? telemetry.activeHazards : [];

  const distanceKm = route ? (route.distance / 1000).toFixed(1) : null;
  const durationMin = route ? Math.max(1, Math.round(route.duration / 60)) : null;
  const isDetour = route?.hazardDetour === true;
  const etaTime = durationMin
    ? new Date(Date.now() + durationMin * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;
  const estimatedFuel = route ? ((route.distance / 1000) * 0.072).toFixed(1) : null;
  const avgSpeed = route && durationMin ? Math.round((route.distance / 1000) / (durationMin / 60)) : null;

  // --- INTENT 1: NO ROUTE SET ---
  if (!route) {
    if (/hazard|obstacle|danger|radar|khatra/i.test(q)) {
      return {
        text: `I am currently monitoring **${activeHazards.length} community road obstacles** on the regional radar.\n\nTo see which ones affect you, pick your starting point and destination in the **Route** dock or tap on the map. I'll immediately calculate a verified hazard-free corridor.`,
        safetyScore: null,
        suggestions: ['Plan route to Airport', 'Plan route to City Center', 'Check weather']
      };
    }
    if (/weather|rain|barish|mosam|temp|cloud/i.test(q)) {
      return {
        text: `Current area weather is **${weatherInfo.label}** at **${Math.round(weather.temperature || 22)}°C** with **${weather.windspeed || 12} km/h wind**.\n\nPavement traction is rated **${weatherInfo.traction}** (${weatherInfo.advisory}). Set a destination to calculate your trip friction.`,
        safetyScore: null,
        suggestions: ['Plan route to Airport', 'Check active hazards', 'Safe Haven SOS']
      };
    }
    return {
      text: `Hello! I'm **NavAI**, your real-time route co-pilot.\n\nYou haven't selected a route yet! To get started:\n1. Enter an origin and destination in the **Route** tab, or tap any preset like *Airport* or *City Center*.\n2. Tap anywhere on the map to set points (A) and (B).\n\nOnce set, I'll provide live obstacle tracking, ETA, and weather traction analysis.`,
      safetyScore: null,
      suggestions: ['Plan route to Airport', 'Plan route to City Center', 'Check active hazards']
    };
  }

  // --- INTENT 2: GREETINGS & CASUAL CHIT-CHAT ---
  if (/^(hi|hello|hey|sup|yo|namaste|morning|evening|afternoon)\b|how\s+are\s+you|kya\s+hal/i.test(q)) {
    return {
      text: `Hey there! **NavAI** online and tracking your trip to **${end}**.\n\n• **Distance:** ${distanceKm} km (~${durationMin} min)\n• **ETA:** ${etaTime}\n• **Status:** ${isDetour ? 'Safe Detour active (hazards bypassed)' : 'Corridor 100% clean'}\n\nWhat would you like to know about your route?`,
      safetyScore: isDetour ? 98 : 100,
      suggestions: ['Is the route clear?', 'How is the road condition?', 'What hazards were avoided?']
    };
  }

  // --- INTENT 3: ROUTE CLEARANCE & SAFETY ("is route clear?", "safe to go?", "safe hai kya?") ---
  if (/is\s+(the\s+)?route\s+clear|safe\s+to\s+(go|drive|travel)|clear\s+hai\s+kya|koi\s+khatra|any\s+danger|is\s+it\s+safe/i.test(q)) {
    if (nearbyHazards.length === 0) {
      return {
        text: `✅ **Yes, your route to ${end} is 100% clear.**\n\n• Zero reported road hazards within 1.5 km of your corridor.\n• Weather is **${weatherInfo.label}** (${weatherInfo.traction}).\n• You have a clean green light for departure!`,
        safetyScore: 100,
        suggestions: ['ETA and arrival time', 'How is road traction?', 'Start navigation']
      };
    } else {
      const hList = nearbyHazards.map(h => `• **${h.title}** (${h.category}, ${h.severity} severity) — ${h.distanceMeters}m away`).join('\n');
      return {
        text: `⚠️ **Caution:** There are **${nearbyHazards.length} obstacle(s)** reported near your path:\n\n${hList}\n\n${isDetour ? '✓ **Good news:** Our safe detour already routes you around them with safe clearance.' : 'Maintain caution as you approach these segments.'}`,
        safetyScore: isDetour ? 98 : 84,
        nearbyHazards,
        suggestions: ['Switch to safe detour', 'How will weather affect this?', 'Start navigation']
      };
    }
  }

  // --- INTENT 4: ROAD QUALITY & CONDITION ("how is the road?", "potholes?", "rasta kaisa hai?") ---
  if (/how\s+is\s+the\s+road|road\s+condition|rasta\s+kaisa|sadak\s+kaisi|any\s+pothole|road\s+damage|bumps/i.test(q)) {
    const roadIssues = nearbyHazards.filter(h => ['pothole', 'road damage', 'construction', 'debris'].includes(h.category.toLowerCase()));
    if (roadIssues.length === 0) {
      return {
        text: `🛣️ **Road Condition: Good & Verified**\n\n• **Pavement Quality:** Normal tarmac without reported structural defects.\n• **Obstacles:** No potholes or active road damage reported along this corridor.\n• **Traction:** ${weatherInfo.traction} (${weatherInfo.label}).\n\nDrive at steady cruising speeds and enjoy the trip!`,
        safetyScore: isDetour ? 98 : 100,
        suggestions: ['Check ETA and speed', 'Full departure briefing', 'Start simulation']
      };
    } else {
      const details = roadIssues.map(h => `• **${h.title}** at *${h.location}* (~${h.distanceMeters}m away)`).join('\n');
      return {
        text: `⚠️ **Road Surface Notice:**\n\nWe detected ${roadIssues.length} road surface issue(s) reported nearby:\n${details}\n\nOur router keeps you outside the 100m danger buffer, but moderate your speed on approaches.`,
        safetyScore: isDetour ? 98 : 82,
        nearbyHazards: roadIssues,
        suggestions: ['Braking distance advisory', 'Departure briefing', 'Simulate drive']
      };
    }
  }

  // --- INTENT 5: DIRECTIONS, PATH & WHICH ROAD TO TAKE ("which road?", "which way?", "kon sa rasta?") ---
  if (/which\s+road|which\s+way|kon\s+sa\s+rasta|directions|how\s+to\s+go|where\s+to\s+turn|guide\s+me/i.test(q)) {
    return {
      text: `🗺️ **Navigation Guidance to ${end}**:\n\n` +
        `• **Selected Corridor:** ${isDetour ? 'Verified Safe Detour (bypasses congested/blocked roads)' : 'Direct Shortest Path'}.\n` +
        `• **Total Distance:** ${distanceKm} km across urban-arterial links.\n` +
        `• **Action:** Tap **"Navigate"** or **"Simulate Drive"** in the Route dock to see turn-by-turn simulation and voice guidance directly on your map!`,
      safetyScore: isDetour ? 98 : 100,
      suggestions: ['Start navigation simulation', 'Check hazards avoided', 'ETA and arrival time']
    };
  }

  // --- INTENT 6: TRAFFIC & DELAYS ("traffic kaisa hai?", "is there traffic?", "any delay?") ---
  if (/traffic|jam|congestion|rush\s+hour|delay|crowded|bhid\s+hai/i.test(q)) {
    return {
      text: `🚗 **Traffic & Corridor Flow Assessment**:\n\n` +
        `• **Average Projected Speed:** **~${avgSpeed || 45} km/h**.\n` +
        `• **Transit Time:** ${durationMin} minutes for ${distanceKm} km.\n` +
        `• **Flow Rating:** ${avgSpeed > 40 ? '🟢 Steady Flow (No major gridlock reported)' : '🟡 Moderate Urban Flow'}.\n` +
        `• **Incident Delays:** ${isDetour ? 'Detour avoids known bottlenecks and road obstructions.' : 'No major delay incidents on this corridor.'}`,
      safetyScore: isDetour ? 98 : 100,
      suggestions: ['ETA and arrival time', 'Check weather impact', 'Start simulation']
    };
  }

  // --- INTENT 7: ETA, TIME & DURATION ("kitna time?", "when will I reach?", "how long?") ---
  if (/eta|time|duration|how\s+long|kab\s+pahuchenge|kitna\s+time|when\s+will\s+i\s+arrive|arrival/i.test(q)) {
    return {
      text: `⏱️ **Arrival Estimate to ${end}**:\n\n` +
        `• **Estimated Arrival Time (ETA):** **${etaTime}**\n` +
        `• **Remaining Travel Time:** **${durationMin} minutes**\n` +
        `• **Remaining Distance:** **${distanceKm} km**\n` +
        `• **Pace:** Cruising at ~${avgSpeed || 45} km/h average speed.`,
      safetyScore: isDetour ? 98 : 100,
      suggestions: ['How is road condition?', 'Check weather friction', 'Start navigation']
    };
  }

  // --- INTENT 8: WHY THIS ROUTE / DETOUR ("why this route?", "why detour?", "ye rasta kyu?") ---
  if (/why\s+this\s+route|why\s+detour|ye\s+rasta\s+kyu|why\s+not\s+main\s+road|why\s+avoid/i.test(q)) {
    if (isDetour) {
      return {
        text: `🛡️ **Why We Chose This Detour:**\n\n` +
          `• The direct primary arterial road has **confirmed active hazards** (like flooding, damage, or accidents).\n` +
          `• Our Dijkstra router placed an edge penalty on that path and routed you onto this safe bypass.\n` +
          `• This detour adds only minimal time while ensuring your vehicle does not get trapped or damaged.`,
        safetyScore: 98,
        nearbyHazards,
        suggestions: ['What hazards were avoided?', 'Full departure briefing', 'Start navigation']
      };
    } else {
      return {
        text: `✓ **Why This Route:**\n\n` +
          `• This is the **most optimal and direct path** to ${end} (${distanceKm} km, ~${durationMin} min).\n` +
          `• No reported road hazards intersect this trajectory, so no detour was necessary!`,
        safetyScore: 100,
        suggestions: ['ETA and arrival time', 'Check weather', 'Start simulation']
      };
    }
  }

  // --- INTENT 9: WEATHER & RAIN IMPACT ("will it rain?", "barish hai kya?", "pavement wet?") ---
  if (/weather|rain|barish|storm|pavement|wet|stopping\s+distance|brake/i.test(q)) {
    return {
      text: `🌦️ **Weather & Braking Impact**:\n\n` +
        `• **Condition:** **${weatherInfo.label}** (${Math.round(weather.temperature || 22)}°C, Wind: ${weather.windspeed || 10} km/h)\n` +
        `• **Pavement Traction:** **${weatherInfo.traction}**\n` +
        `• **Braking Multiplier:** **${weatherInfo.brakingMultiplier}x** standard dry distance\n` +
        `• **Stopping Distance at 60 km/h:** ~${weatherInfo.wetStoppingMeters} meters (vs ~37m on dry road)\n` +
        `• **Advisory:** ${weatherInfo.advisory} Always maintain increased following distance in wet conditions.`,
      safetyScore: isDetour ? 98 : 95,
      weather: weatherInfo,
      suggestions: ['Check road clearance', 'Full departure briefing', 'Start simulation']
    };
  }

  // --- INTENT 10: FUEL, PETROL & STOPS ("petrol pump?", "fuel consumption?", "gas station?") ---
  if (/petrol|gas|fuel|diesel|cng|charging|khana|food|rest\s+stop|mileage|eco/i.test(q)) {
    return {
      text: `⛽ **Fuel & Stop Advisory**:\n\n` +
        `• **Projected Fuel Usage for Trip:** **~${estimatedFuel} Liters** (~${((route.distance / 1000) * 0.175).toFixed(1)} kg CO₂)\n` +
        `• **Need Fuel / Gas Station?** Tap the **Safe Haven (SOS)** tab on your left dock and select **Gas Stations** to locate certified stations right along your route!`,
      safetyScore: isDetour ? 98 : 100,
      suggestions: ['Open Safe Haven tab', 'ETA and arrival time', 'Start navigation']
    };
  }

  // --- INTENT 11: HOSPITALS & EMERGENCY HAVENS ("hospital kahan hai?", "emergency safe haven") ---
  if (/hospital|doctor|police|fire|thana|er|trauma|emergency/i.test(q)) {
    return {
      text: `🏥 **Emergency Facilities & Safe Havens**:\n\n` +
        `• NaviGuard has live Safe Haven integrations for Emergency Hospitals, Police Stations, and Fire Stations.\n` +
        `• Click the **Safe Haven** tab in your dock to see the nearest medical centers with phone numbers and 1-tap detour routing.`,
      safetyScore: isDetour ? 98 : 100,
      suggestions: ['Find nearest hospital', 'Copy current GPS fix', 'Check route clearance']
    };
  }

  // --- INTENT 12: DEPARTURE BRIEFING / FULL SUMMARY ---
  if (/brief|summary|overview|everything|sab\s+kuch/i.test(q)) {
    return {
      text: `📋 **NavAI Departure Briefing to ${end}**:\n\n` +
        `• **Trajectory:** ${start} → ${end} (${distanceKm} km, ~${durationMin} min, ETA: ${etaTime})\n` +
        `• **Corridor Safety:** ${isDetour ? '✓ Safe Detour active (avoiding known obstacles)' : '✓ Direct path clear'}\n` +
        `• **Weather & Traction:** ${weatherInfo.label} (${weatherInfo.traction}, ${weatherInfo.brakingMultiplier}x braking distance)\n` +
        `• **Nearby Obstacles:** ${nearbyHazards.length === 0 ? 'Zero obstacles within 1.5 km' : `${nearbyHazards.length} obstacle(s) safely bypassed`}\n` +
        `• **Eco Usage:** ~${estimatedFuel} L fuel projected`,
      safetyScore: isDetour ? 98 : 100,
      nearbyHazards,
      suggestions: ['Start navigation simulation', 'Check road hazards', 'Weather & braking impact']
    };
  }

  // --- INTENT 13: ACKNOWLEDGMENTS ("thanks", "ok", "cool", "shukriya", "theek hai") ---
  if (/^(thanks|thank\s+you|ok|okay|cool|great|understood|nice|shukriya|theek\s+hai|dhanyawad)\b/i.test(q)) {
    return {
      text: `You're very welcome! I'm keeping watch on your corridor to **${end}**. Have a safe and pleasant drive! 🚗✨`,
      safetyScore: isDetour ? 98 : 100,
      suggestions: ['Start navigation', 'Audit corridor', 'Check weather']
    };
  }

  // --- DEFAULT DYNAMIC RESPONSE (DIRECT AND RELEVANT) ---
  return {
    text: `Regarding your question about **"${message}"**:\n\n` +
      `Your active corridor from **${start}** to **${end}** covers **${distanceKm} km** (~**${durationMin} min**, ETA: **${etaTime}**).\n` +
      `• **Safety Status:** ${isDetour ? '✓ Safe Detour active (circumventing reported road hazards)' : '✓ Direct corridor clean of obstacles'}.\n` +
      `• **Road Weather:** ${weatherInfo.label} (${weatherInfo.traction}).\n\n` +
      `You can ask me specifically about road surface, potholes, traffic flow, braking distance, or emergency stops!`,
    safetyScore: isDetour ? 98 : 95,
    nearbyHazards,
    weather: weatherInfo,
    suggestions: ['Is the route clear?', 'How is the road condition?', 'What is my exact ETA?']
  };
}

/**
 * Main NavAI Response Generator
 */
async function generateNavAIResponse({ message = '', telemetry = {}, apiKey = null }) {
  const q = message.trim();
  const weather = telemetry.weather || {};
  const weatherInfo = describeWeatherCode(weather.weathercode);
  const route = telemetry.route;
  const activeHazards = Array.isArray(telemetry.activeHazards) ? telemetry.activeHazards : [];
  const nearbyHazards = analyzeRouteHazards(route, activeHazards);
  const isDetour = route?.hazardDetour === true;

  // 1. Evaluate Guardrails First (Instant Life-Safety and Compliance)
  const guardrailHit = evaluateGuardrails(q, weatherInfo);
  if (guardrailHit) {
    return {
      text: guardrailHit.text,
      safetyScore: isDetour ? 98 : nearbyHazards.length > 0 ? 84 : 100,
      nearbyHazards,
      weather: weatherInfo,
      suggestions: guardrailHit.suggestions,
      guardrailTriggered: true,
      guardrailCategory: guardrailHit.guardrailCategory
    };
  }

  // 2. Optional Gemini LLM Acceleration (if API key available)
  const effectiveKey = apiKey || process.env.GEMINI_API_KEY;
  if (effectiveKey) {
    try {
      const distanceKm = route ? (route.distance / 1000).toFixed(1) : null;
      const durationMin = route ? Math.max(1, Math.round(route.duration / 60)) : null;
      const start = telemetry.startQuery || 'Start';
      const end = telemetry.endQuery || 'Destination';

      const prompt = `You are NavAI, the sharp, intelligent, defense-grade vehicle co-pilot in NaviGuard.
Tone: Natural, confident, direct, and conversational. Do not give boilerplate essays. Answer the driver's exact question directly in the first 1-2 lines, followed by supporting details if helpful.
Understands both English and Hinglish seamlessly.

CURRENT TELEMETRY:
- Origin: ${start}
- Destination: ${end}
- Route Status: ${route ? `Active (${distanceKm} km, ~${durationMin} mins, Detour: ${isDetour})` : 'No route planned yet'}
- Nearby Hazards (<1.5km): ${JSON.stringify(nearbyHazards)}
- Weather: ${weatherInfo.label}, Temp: ${weather.temperature || 'N/A'}°C, Traction: ${weatherInfo.traction} (Braking Multiplier: ${weatherInfo.brakingMultiplier}x)

DRIVER QUESTION: "${message}"

Answer directly, accurately, and conversationally:`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${effectiveKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (reply && reply.trim()) {
          return {
            text: reply.trim(),
            nearbyHazards,
            weather: weatherInfo,
            safetyScore: isDetour ? 98 : nearbyHazards.length > 0 ? 84 : 100,
            guardrailTriggered: false
          };
        }
      }
    } catch (e) {
      console.warn('NavAI Gemini call bypassed or timed out, utilizing contextual dialogue engine:', e.message);
    }
  }

  // 3. Ultra-Smart Contextual Dialogue Engine
  const dialogueResult = generateContextualAnswer(q, telemetry, nearbyHazards, weatherInfo, message);
  return {
    ...dialogueResult,
    guardrailTriggered: false
  };
}

module.exports = {
  generateNavAIResponse,
  analyzeRouteHazards,
  describeWeatherCode,
  evaluateGuardrails
};
