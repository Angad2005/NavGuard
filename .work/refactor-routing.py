from pathlib import Path

root = Path(r'C:\Zworking\NavGuard')
js_path = root / 'frontend' / 'js' / 'main.js'
text = js_path.read_text(encoding='utf-8')
start = text.index("const map=L.map('map')")
end = text.index("/* Hazard reporting:", start)
new_block = r'''const map=L.map('map').setView([28.6139,77.2090],12);
L.control.zoom({position:'bottomright'}).addTo(map);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom:19,
  attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

let startCoords=null;
let endCoords=null;
let startMarker=null;
let endMarker=null;
let routeLayers=[];
let routeCandidates=[];
let selectedRouteIndex=0;
let routingRequestId=0;
const OSRM_ROUTER_URL='https://router.project-osrm.org/route/v1/driving';
const HAZARD_AVOIDANCE_RADIUS_METERS=100;

async function geocodeAddress(addressQuery){
  if(!addressQuery)return null;
  try{
    const response=await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=${encodeURIComponent(addressQuery)}`);
    if(!response.ok) throw new Error('Geocoder unavailable');
    const results=await response.json();
    if(!results.length)return null;
    return {lat:Number(results[0].lat),lng:Number(results[0].lon),name:results[0].display_name};
  }catch(error){ console.error('Geocoding error:',error); return null; }
}

document.getElementById('startGpsBtn').addEventListener('click',()=>{
  document.getElementById('startInput').placeholder='Locating via device GPS...';
  map.locate({setView:true,maxZoom:15});
});
map.on('locationfound',event=>{
  startCoords=event.latlng;
  document.getElementById('startInput').value='Current location';
  document.getElementById('startInput').placeholder='Choose starting point...';
  if(startMarker)map.removeLayer(startMarker);
  startMarker=L.marker(startCoords).addTo(map).bindPopup('Your current location').openPopup();
});
map.on('locationerror',()=>{
  alert('Could not access browser location permissions.');
  document.getElementById('startInput').placeholder='Choose starting point...';
});

function isActiveHazard(hazard){
  const windowInfo=hazard.window||{};
  if(!windowInfo.scheduled)return true;
  const now=Date.now();
  const start=windowInfo.start?new Date(windowInfo.start).getTime():null;
  const end=windowInfo.end?new Date(windowInfo.end).getTime():null;
  return !(end&&now>end)&&!(start&&now<start);
}
function distanceBetweenPointsMeters(a,b){
  const earthRadius=6371000;
  const lat1=a.lat*Math.PI/180,lat2=b.lat*Math.PI/180;
  const dLat=(b.lat-a.lat)*Math.PI/180,dLng=(b.lng-a.lng)*Math.PI/180;
  const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2*earthRadius*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
}
function distanceToSegmentMeters(point,start,end){
  const latitudeScale=111320;
  const longitudeScale=latitudeScale*Math.cos(point.lat*Math.PI/180);
  const px=point.lng*longitudeScale,py=point.lat*latitudeScale;
  const ax=start.lng*longitudeScale,ay=start.lat*latitudeScale;
  const bx=end.lng*longitudeScale,by=end.lat*latitudeScale;
  const dx=bx-ax,dy=by-ay,lengthSquared=dx*dx+dy*dy;
  const projection=lengthSquared===0?0:Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/lengthSquared));
  return distanceBetweenPointsMeters(point,{lat:(ay+projection*dy)/latitudeScale,lng:(ax+projection*dx)/longitudeScale});
}
function routeTouchesHazard(route,hazard){
  const coordinates=route.geometry?.coordinates||[];
  const point=L.latLng(hazard.coordinates.lat,hazard.coordinates.lng);
  for(let i=0;i<coordinates.length;i+=1){
    const current=L.latLng(coordinates[i][1],coordinates[i][0]);
    if(distanceBetweenPointsMeters(point,current)<=HAZARD_AVOIDANCE_RADIUS_METERS)return true;
    if(i>0){
      const previous=L.latLng(coordinates[i-1][1],coordinates[i-1][0]);
      if(distanceToSegmentMeters(point,previous,current)<=HAZARD_AVOIDANCE_RADIUS_METERS)return true;
    }
  }
  return false;
}
async function loadActiveHazards(){
  const response=await fetch('/api/hazards');
  if(!response.ok)throw new Error('Could not load hazards before routing.');
  const payload=await response.json();
  return (payload.data||[]).filter(hazard=>isActiveHazard(hazard)&&hazard.coordinates&&Number.isFinite(Number(hazard.coordinates.lat))&&Number.isFinite(Number(hazard.coordinates.lng)));
}
function formatDuration(seconds){
  const minutes=Math.max(1,Math.round(seconds/60));
  if(minutes<60)return `${minutes} min`;
  return `${Math.floor(minutes/60)} hr ${minutes%60} min`;
}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));}
function routeLabel(route,index){
  if(index===0)return 'Best overall';
  const fastest=routeCandidates.reduce((best,item)=>item.duration<best.duration?item:best,routeCandidates[0]);
  if(route===fastest)return 'Fastest';
  const shortest=routeCandidates.reduce((best,item)=>item.distance<best.distance?item:best,routeCandidates[0]);
  if(route===shortest)return 'Shortest';
  return `Alternative ${index}`;
}
function clearRouteLayers(){routeLayers.forEach(layer=>map.removeLayer(layer));routeLayers=[];}
function updateRouteSelection(index){
  selectedRouteIndex=index;
  routeLayers.forEach((layer,layerIndex)=>layer.setStyle({color:layerIndex===index?'#1a73e8':'#7aa7e8',opacity:layerIndex===index?.95:.42,weight:layerIndex===index?7:5}));
  document.querySelectorAll('.route-option').forEach((card,cardIndex)=>card.classList.toggle('selected',cardIndex===index));
  renderSelectedRoute(routeCandidates[index]);
}
function renderRouteOptions(){
  return routeCandidates.map((route,index)=>`
    <button class="route-option${index===selectedRouteIndex?' selected':''}" type="button" data-route-index="${index}">
      <span class="route-option-top"><strong>${formatDuration(route.duration)}</strong><span class="route-badge">${escapeHtml(routeLabel(route,index))}</span></span>
      <span class="route-option-meta">${(route.distance/1000).toFixed(1)} km · ${route.hazardCount?'Hazard check passed':'Hazard-free'}</span>
    </button>`).join('');
}
function renderSelectedRoute(route){
  if(!route)return;
  const steps=route.legs.flatMap(leg=>leg.steps||[]).filter(step=>step.name||step.maneuver);
  const directions=steps.map(step=>{
    const name=step.name?` via <b>${escapeHtml(step.name)}</b>`:'';
    const instruction=step.maneuver?.instruction||step.name||'Continue';
    return `<li><span class="step-icon">${step.maneuver?.type==='arrive'?'●':'↗'}</span><span>${escapeHtml(instruction)}${name}<small>${Math.round(step.distance)} m</small></span></li>`;
  }).join('');
  document.getElementById('directionsContainer').innerHTML=`
    <div class="route-summary"><div><span class="route-kicker">RECOMMENDED ROUTE</span><h3>${formatDuration(route.duration)}</h3><p>${(route.distance/1000).toFixed(1)} km · Avoids ${route.hazardCount} active hazard${route.hazardCount===1?'':'s'}</p></div><span class="route-check">✓ Safe</span></div>
    <div class="route-options-label">Compare routes</div><div class="route-options">${renderRouteOptions()}</div>
    <div class="directions-title">Turn-by-turn directions</div><ol class="turn-list">${directions||'<li>Follow the highlighted route to your destination.</li>'}</ol>`;
  document.querySelectorAll('.route-option').forEach(card=>card.addEventListener('click',()=>updateRouteSelection(Number(card.dataset.routeIndex))));
}
async function requestOsrmRoutes(){
  const coordinates=`${startCoords.lng},${startCoords.lat};${endCoords.lng},${endCoords.lat}`;
  const url=`${OSRM_ROUTER_URL}/${coordinates}?alternatives=true&steps=true&overview=full&geometries=geojson`;
  const response=await fetch(url);
  if(!response.ok)throw new Error('Routing service unavailable.');
  const payload=await response.json();
  if(payload.code!=='Ok'||!payload.routes?.length)throw new Error('No drivable route found.');
  return payload.routes;
}
async function calculateAndDisplayRoute(){
  const requestId=++routingRequestId;
  const directionsContainer=document.getElementById('directionsContainer');
  directionsContainer.innerHTML='<div class="route-loading"><span class="loading-dot"></span> Checking live route alternatives and marked hazards…</div>';
  clearRouteLayers();
  try{
    const [routes,activeHazards]=await Promise.all([requestOsrmRoutes(),loadActiveHazards()]);
    if(requestId!==routingRequestId)return;
    const safeRoutes=routes.map(route=>({...route,hazardCount:activeHazards.filter(hazard=>routeTouchesHazard(route,hazard)).length})).filter(route=>route.hazardCount===0);
    if(!safeRoutes.length){
      directionsContainer.innerHTML='<div class="directions-placeholder route-error"><b>No safe route found.</b><br>Every available alternative intersects a marked hazard. Try a different destination or check the hazard dashboard.</div>';
      return;
    }
    routeCandidates=safeRoutes.sort((a,b)=>a.duration-b.duration).slice(0,3);
    selectedRouteIndex=0;
    routeLayers=routeCandidates.map((route,index)=>L.geoJSON(route.geometry,{style:{color:index===0?'#1a73e8':'#7aa7e8',opacity:index===0?.95:.42,weight:index===0?7:5,lineCap:'round',lineJoin:'round'},interactive:true}).addTo(map));
    routeLayers.forEach((layer,index)=>layer.on('click',()=>updateRouteSelection(index)));
    renderSelectedRoute(routeCandidates[0]);
    const selectedGeometry=routeCandidates[0].geometry.coordinates.map(point=>L.latLng(point[1],point[0]));
    map.fitBounds(L.latLngBounds(selectedGeometry),{padding:[55,55],maxZoom:15});
  }catch(error){
    if(requestId!==routingRequestId)return;
    directionsContainer.innerHTML=`<div class="directions-placeholder route-error"><b>Could not calculate a route.</b><br>${escapeHtml(error.message)} Please try again in a moment.</div>`;
  }
}

document.getElementById('routeBtn').addEventListener('click',async()=>{
  const startQuery=document.getElementById('startInput').value.trim();
  const endQuery=document.getElementById('endInput').value.trim();
  if(!endQuery){alert('Please enter a destination.');return;}
  if(!startCoords&&startQuery){
    const resolvedStart=await geocodeAddress(startQuery);
    if(!resolvedStart){alert('Could not resolve the starting point.');return;}
    startCoords=L.latLng(resolvedStart.lat,resolvedStart.lng);
    if(startMarker)map.removeLayer(startMarker);
    startMarker=L.marker(startCoords).addTo(map).bindPopup(`Start: ${escapeHtml(resolvedStart.name)}`);
  }
  if(!startCoords){alert('Please enter a starting point or use GPS.');return;}
  const resolvedEnd=await geocodeAddress(endQuery);
  if(!resolvedEnd){alert('Could not resolve the destination.');return;}
  endCoords=L.latLng(resolvedEnd.lat,resolvedEnd.lng);
  if(endMarker)map.removeLayer(endMarker);
  endMarker=L.marker(endCoords).addTo(map).bindPopup(`Destination: ${escapeHtml(resolvedEnd.name)}`).openPopup();
  await calculateAndDisplayRoute();
});

document.getElementById('clearBtn').addEventListener('click',()=>{
  routingRequestId+=1;clearRouteLayers();routeCandidates=[];
  if(startMarker)map.removeLayer(startMarker);if(endMarker)map.removeLayer(endMarker);
  startCoords=null;endCoords=null;startMarker=null;endMarker=null;selectedRouteIndex=0;
  document.getElementById('startInput').value='';document.getElementById('endInput').value='';
  resetPlaceholder();map.flyTo([28.6139,77.2090],12);
});
function resetPlaceholder(){document.getElementById('directionsContainer').innerHTML='<div class="directions-placeholder" id="placeholderText">Enter a start address and a destination location above, then click <b>Navigate</b> to compare live routes.</div>';}

'''
js_path.write_text(text[:start] + new_block + text[end:], encoding='utf-8')

html_path = root / 'frontend' / 'main.html'
html = html_path.read_text(encoding='utf-8')
html = html.replace('<link rel="stylesheet" href="https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.css" />\n', '')
html = html.replace('<script src="https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.js"></script>\n', '')
html_path.write_text(html, encoding='utf-8')
