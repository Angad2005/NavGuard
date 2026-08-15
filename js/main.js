const session=JSON.parse(localStorage.getItem('rp_session')||'null');

if(!session){
window.location.replace('login.html');
}else{
document.getElementById('userName').textContent=session.name;
document.getElementById('userEmail').textContent=session.email;
document.getElementById('avatar').textContent=(session.name||'?').charAt(0).toUpperCase();
}

document.getElementById('signOutBtn').addEventListener('click',()=>{
if(confirm('Sign out of RoutePlanner?')){
localStorage.removeItem('rp_session');
window.location.href='login.html';
}
});

const body=document.body;
const accessibilityBtn=document.getElementById('accessibilityBtn');
const settingsBtn=document.getElementById('settingsBtn');
const accessibilityPanel=document.getElementById('accessibilityPanel');
const settingsPanel=document.getElementById('settingsPanel');
const fontSelect=document.getElementById('fontSelect');
const sizeButtons=document.querySelectorAll('.size-btn');
const colorButtons=document.querySelectorAll('.color-btn');
const themeButtons=document.querySelectorAll('.theme-opt');

const FONT_CLASSES=['font-default','font-readable','font-serif'];
const SIZE_CLASSES=['fs-small','fs-medium','fs-large','fs-xlarge'];
const CONTRAST_CLASSES=['contrast-high','contrast-warm'];

function loadPrefs(){
try{
return JSON.parse(localStorage.getItem('rp_prefs')||'{}');
}catch(e){
return {};
}
}

function savePrefs(prefs){
localStorage.setItem('rp_prefs',JSON.stringify(prefs));
}

let prefs=Object.assign({
font:'font-default',
size:'fs-medium',
contrast:'',
theme:'light'
},loadPrefs());

function applyPrefs(){
body.classList.remove(...FONT_CLASSES,...SIZE_CLASSES,...CONTRAST_CLASSES,'theme-dark');

body.classList.add(prefs.font||'font-default');
body.classList.add(prefs.size||'fs-medium');

if(prefs.contrast)body.classList.add(prefs.contrast);
if(prefs.theme==='dark')body.classList.add('theme-dark');

fontSelect.value=prefs.font||'font-default';

sizeButtons.forEach(b=>b.classList.toggle(
'selected',
b.dataset.size===(prefs.size||'fs-medium')
));

colorButtons.forEach(b=>b.classList.toggle(
'selected',
b.dataset.contrast===(prefs.contrast||'')
));

themeButtons.forEach(b=>b.classList.toggle(
'selected',
b.dataset.theme===(prefs.theme||'light')
));
}

applyPrefs();

function closePanels(){
accessibilityPanel.classList.remove('open');
settingsPanel.classList.remove('open');
accessibilityBtn.classList.remove('active');
settingsBtn.classList.remove('active');
}

accessibilityBtn.addEventListener('click',e=>{
e.stopPropagation();
const willOpen=!accessibilityPanel.classList.contains('open');
closePanels();

if(willOpen){
accessibilityPanel.classList.add('open');
accessibilityBtn.classList.add('active');
}
});

settingsBtn.addEventListener('click',e=>{
e.stopPropagation();
const willOpen=!settingsPanel.classList.contains('open');
closePanels();

if(willOpen){
settingsPanel.classList.add('open');
settingsBtn.classList.add('active');
}
});

document.addEventListener('click',e=>{
if(!accessibilityPanel.contains(e.target)&&!settingsPanel.contains(e.target)){
closePanels();
}
});

fontSelect.addEventListener('change',()=>{
prefs.font=fontSelect.value;
savePrefs(prefs);
applyPrefs();
});

sizeButtons.forEach(btn=>{
btn.addEventListener('click',()=>{
prefs.size=btn.dataset.size;
savePrefs(prefs);
applyPrefs();
});
});

colorButtons.forEach(btn=>{
btn.addEventListener('click',()=>{
prefs.contrast=btn.dataset.contrast;
savePrefs(prefs);
applyPrefs();
});
});

themeButtons.forEach(btn=>{
btn.addEventListener('click',()=>{
prefs.theme=btn.dataset.theme;
savePrefs(prefs);
applyPrefs();
});
});

const map=L.map('map',{zoomControl:false}).setView([28.6139,77.2090],12);

L.control.zoom({position:'bottomright'}).addTo(map);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
maxZoom:19,
attribution:'© OpenStreetMap contributors'
}).addTo(map);

let startCoords=null;
let endCoords=null;
let startMarker=null;
let endMarker=null;
let routingControl=null;

async function geocodeAddress(addressQuery){
if(!addressQuery)return null;

try{
const response=await fetch(
`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(addressQuery)}`
);

const results=await response.json();

if(results&&results.length>0){
return{
lat:parseFloat(results[0].lat),
lng:parseFloat(results[0].lon),
name:results[0].display_name
};
}

return null;
}catch(error){
console.error('Geocoding error:',error);
return null;
}
}

document.getElementById('startGpsBtn').addEventListener('click',()=>{
document.getElementById('startInput').placeholder='Locating via device GPS...';
map.locate({setView:true,maxZoom:15});
});

map.on('locationfound',e=>{
startCoords=e.latlng;

document.getElementById('startInput').value=
`My Current Location (${startCoords.lat.toFixed(4)}, ${startCoords.lng.toFixed(4)})`;

if(startMarker)map.removeLayer(startMarker);

startMarker=L.marker(startCoords)
.addTo(map)
.bindPopup('Your Current Location')
.openPopup();
});

map.on('locationerror',()=>{
alert('Could not access browser location permissions.');
document.getElementById('startInput').placeholder='Choose starting point...';
});

document.getElementById('routeBtn').addEventListener('click',async()=>{
const startQuery=document.getElementById('startInput').value.trim();
const endQuery=document.getElementById('endInput').value.trim();

if(!endQuery){
alert('Please enter a destination.');
return;
}

document.getElementById('directionsContainer').innerHTML=
'<div class="directions-placeholder">Calculating optimal paths...</div>';

if(!startCoords&&startQuery){
const resolvedStart=await geocodeAddress(startQuery);

if(resolvedStart){
startCoords=L.latLng(resolvedStart.lat,resolvedStart.lng);

if(startMarker)map.removeLayer(startMarker);

startMarker=L.marker(startCoords)
.addTo(map)
.bindPopup('Start: '+resolvedStart.name);
}else{
alert('Could not resolve the starting point.');
resetPlaceholder();
return;
}
}

if(!startCoords){
alert('Please enter a starting point or use GPS.');
resetPlaceholder();
return;
}

const resolvedEnd=await geocodeAddress(endQuery);

if(resolvedEnd){
endCoords=L.latLng(resolvedEnd.lat,resolvedEnd.lng);

if(endMarker)map.removeLayer(endMarker);

endMarker=L.marker(endCoords)
.addTo(map)
.bindPopup('Destination: '+resolvedEnd.name)
.openPopup();
}else{
alert('Could not resolve the destination.');
resetPlaceholder();
return;
}

calculateAndDisplayRoute();
});

function calculateAndDisplayRoute(){
if(routingControl)map.removeControl(routingControl);

routingControl=L.Routing.control({
waypoints:[startCoords,endCoords],
lineOptions:{
styles:[{
color:'#1a73e8',
opacity:.8,
weight:6
}]
},
createMarker:function(){
return null;
},
addWaypoints:false
}).addTo(map);

routingControl.on('routesfound',e=>{
const route=e.routes[0];
const summary=route.summary;

const distanceKm=(summary.totalDistance/1000).toFixed(1);
const durationMin=Math.round(summary.totalTime/60);

let outputHtml=`
<div style="margin-bottom:20px;">
<h3 style="font-size:18px;color:var(--text-primary);">${durationMin} min</h3>
<p style="font-size:14px;color:var(--text-secondary);">${distanceKm} km • Fastest route</p>
</div>

<hr style="border:0;border-top:1px solid var(--border-color);margin-bottom:16px;">

<ol style="padding-left:20px;display:flex;flex-direction:column;gap:14px;color:var(--text-primary);font-size:14px;">
`;

route.instructions.forEach(step=>{
outputHtml+=`
<li style="line-height:1.4;padding-bottom:8px;border-bottom:1px dashed var(--border-color);">
${step.text}
<span style="color:var(--text-secondary);font-size:12px;">
(${Math.round(step.distance)}m)
</span>
</li>
`;
});

outputHtml+='</ol>';

document.getElementById('directionsContainer').innerHTML=outputHtml;

map.flyToBounds(
L.latLngBounds([startCoords,endCoords]),
{
padding:[50,50],
duration:1.2
}
);
});

routingControl.on('routingerror',()=>{
document.getElementById('directionsContainer').innerHTML=
'<div class="directions-placeholder" style="color:var(--danger);">No route found between the specified locations.</div>';
});
}

document.getElementById('clearBtn').addEventListener('click',()=>{
if(routingControl)map.removeControl(routingControl);
if(startMarker)map.removeLayer(startMarker);
if(endMarker)map.removeLayer(endMarker);

startCoords=null;
endCoords=null;
startMarker=null;
endMarker=null;
routingControl=null;

document.getElementById('startInput').value='';
document.getElementById('endInput').value='';

resetPlaceholder();

map.flyTo([28.6139,77.2090],12);
});

function resetPlaceholder(){
document.getElementById('directionsContainer').innerHTML=`
<div class="directions-placeholder" id="placeholderText">
Enter a start address and a destination location above, then click <b>Navigate</b> to generate directions.
</div>
`;
}