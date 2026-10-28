"use strict";
/* ================= location: suggest the bar you're at ================= */
// Nearby places come from OpenStreetMap data, via Photon (komoot) with Overpass as a backup. Coordinates are only sent there, never saved.
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];
let locState = {busy:false, places:null, msg:""};

function distM(a, b){
  const R = 6371000, r = x => x*Math.PI/180;
  const dLat = r(b.lat-a.lat), dLon = r(b.lon-a.lon);
  const h = Math.sin(dLat/2)**2 + Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}
const fmtDist = m => { const ft = m*3.281; return ft < 1000 ? `${Math.round(ft/10)*10} ft` : `${(m/1609).toFixed(1)} mi` };

/* best guess at "kind of place" from OpenStreetMap tags; null means leave it to the user */
function kindOf(t){
  const name = (t.name||"").toLowerCase();
  if(t.craft==="brewery" || t.microbrewery==="yes" || /brew(ery|ing|pub|house)|taproom|tap room|beer garden/.test(name)) return "brewery";
  if(t.sport || t.bar==="sports" || /sports|sport bar/.test(name)) return "sports";
  if(t.cocktails==="yes" || t.bar==="cocktail" || /cocktail|speakeasy|lounge/.test(name)) return "cocktail";
  if(t.bar==="dive" || /\bdive\b|icehouse|ice house/.test(name)) return "dive";
  if(t.amenity==="restaurant") return "restaurant";
  if(t.craft==="winery" || /wine bar/.test(name)) return "restaurant";
  return null;
}

/* any request, abandoned after ms */
async function getJSON(url, opts, ms){
  const c = new AbortController(), t = setTimeout(()=>c.abort(), ms);
  try{
    const res = await fetch(url, {...opts, signal:c.signal});
    if(!res.ok) throw new Error(res.status);
    return await res.json();
  } finally { clearTimeout(t) }
}
function toPlaces(list, lat, lon, radius){
  const me = {lat, lon}, seen = new Set();
  return list.filter(p=>p.name).map(p=>({...p, kind:kindOf(p.tags), bar:p.tags.amenity!=="restaurant", d: p.lat!=null ? distM(me,p) : radius}))
    .filter(p=>{ const k = keyOf(p.name); if(seen.has(k)) return false; seen.add(k); return true })
    // bars sort ahead of restaurants at a similar distance
    .sort((x,y)=>(x.d + (x.bar?0:40)) - (y.d + (y.bar?0:40)));
}
/* Photon: fast reverse search over OpenStreetMap; bars and restaurants asked separately so restaurants can't crowd out bars */
async function photon(lat, lon, radius){
  const base = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&radius=${(radius/1000).toFixed(2)}&lang=en`;
  const bars = ["amenity:bar","amenity:pub","amenity:biergarten","amenity:nightclub","craft:brewery","craft:winery","craft:distillery"].map(t=>"&osm_tag="+t).join("");
  const [a, b] = await Promise.all([getJSON(base+"&limit=12"+bars, {}, 6000), getJSON(base+"&limit=6&osm_tag=amenity:restaurant", {}, 6000).catch(()=>({features:[]}))]);
  return [...(a.features||[]), ...(b.features||[])].map(f=>{
    const pr = f.properties||{}, [lo, la] = f.geometry?.coordinates||[];
    return {id:`${pr.osm_type||"x"}/${pr.osm_id||pr.name}`, name:pr.name, lat:la, lon:lo, tags:{name:pr.name, [pr.osm_key]:pr.osm_value}};
  });
}
/* Overpass: richer tags but often overloaded; every server at once, first good answer wins */
async function overpass(lat, lon, radius){
  const a = `(around:${Math.round(radius)},${lat},${lon})`;
  const q = `[out:json][timeout:10];(
nwr${a}["amenity"~"^(bar|pub|biergarten|nightclub|restaurant)$"]["name"];
nwr${a}["craft"~"^(brewery|winery|distillery)$"]["name"];
nwr${a}["microbrewery"="yes"]["name"];
);out center tags 60;`;
  const j = await Promise.any(OVERPASS.map(url=>getJSON(url, {method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded"}, body:"data="+encodeURIComponent(q)}, 8000)
    .then(j=>{ if(!Array.isArray(j.elements)) throw new Error("bad reply"); return j })));
  return j.elements.map(e=>({id:`${e.type}/${e.id}`, name:e.tags.name, lat:e.lat ?? e.center?.lat, lon:e.lon ?? e.center?.lon, tags:e.tags}));
}
async function nearby(lat, lon, radius){
  let list = null;
  try{ list = await photon(lat, lon, radius) }catch{}
  if(!list || !list.length){ try{ list = await overpass(lat, lon, radius) }catch{ if(!list) throw {code:"lookup"} } }
  return toPlaces(list, lat, lon, radius);
}

function position(){
  return new Promise((res, rej)=>{
    if(!navigator.geolocation) return rej({code:"none"});
    let done = false;
    const finish = (fn, v) => { if(!done){ done = true; clearTimeout(t); fn(v) } };
    // network-based location is quick and close enough to pick a bar; GPS indoors can take ages
    const t = setTimeout(()=>finish(rej, {code:"slow"}), 20000);
    navigator.geolocation.getCurrentPosition(p=>finish(res,p), e=>finish(rej,e), {enableHighAccuracy:false, timeout:15000, maximumAge:300000});
  });
}

async function findMe(quiet){
  if(locState.busy) return;
  locState = {busy:true, places:null, msg:"", step:"Getting your location…"}; renderLoc();
  try{
    const pos = await position();
    locState.step = "Looking up places nearby…"; renderLoc();
    const {latitude:lat, longitude:lon, accuracy} = pos.coords;
    const radius = Math.min(400, Math.max(120, (accuracy||100)*1.5));
    let places = await nearby(lat, lon, radius);
    if(!places.length && radius < 400) places = await nearby(lat, lon, 400);
    if(!places.length){ locState = {busy:false, places:null, msg: quiet ? "" : "No bars or restaurants found nearby. Type the name below."}; return renderLoc() }
    locState = {busy:false, places:places.slice(0,4), msg:""};
  }catch(e){
    const msg = e?.code===1 ? "Location is turned off for this site. Allow it in your browser settings, or type the bar name below."
      : e?.code===2 || e?.code===3 || e?.code==="slow" ? "Your phone didn't share a location in time. Check that Location Services is on for your browser, then try again, or type the bar name below."
      : e?.code==="none" ? "This browser can't share location. Type the bar name below."
      : "Couldn't look up nearby places. Try again, or type the bar name below.";
    locState = {busy:false, places:null, msg: quiet ? "" : msg};
  }
  renderLoc();
}

function confirmPlace(p){
  S.night.barName = p.name; S.night.place = {id:p.id, name:p.name};
  if(p.kind) S.night.bar = p.kind;
  locState = {busy:false, places:null, msg:""};
  renderLive();
  const nm = p.name.replace(/\.$/,"");
  toast(p.kind ? `You're at ${nm}. Set to ${BARS[p.kind].toLowerCase()}.` : `You're at ${nm}. Pick the kind of place below.`);
}

function renderLoc(){
  const box = $("locBox"), btn = $("locBtn");
  if(!box || !S) return;
  const here = S.night.place && S.night.place.name===S.night.barName ? S.night.place : null;
  btn.hidden = !!(here || locState.places);
  btn.disabled = locState.busy;
  btn.textContent = locState.busy ? (locState.step || "Finding where you are…") : "Find where I am";
  if(locState.places){
    box.innerHTML = `<div class="q">Are you at one of these?</div><ul class="places">${locState.places.map((p,i)=>
      `<li><button type="button" class="place" data-place="${i}"><span>${esc(p.name)}</span><small>${p.kind?esc(BARS[p.kind])+" · ":""}${fmtDist(p.d)}</small></button></li>`).join("")}</ul>
      <div class="btnrow"><button type="button" class="btn ghost" data-place="none">None of these</button></div>
      <p class="hint">Your location is sent to OpenStreetMap to find places nearby. It isn't saved.</p>`;
  } else if(here){
    box.innerHTML = `<div class="here"><span>At <b>${esc(here.name)}</b></span><button type="button" class="btn ghost" data-place="change">Change</button></div>`;
  } else {
    box.innerHTML = locState.msg && !locState.busy ? `<p class="hint">${esc(locState.msg)}</p>` : "";
  }
}

$("locBtn").addEventListener("click", ()=>findMe(false));
$("locBox").addEventListener("click", e=>{
  const b = e.target.closest("[data-place]"); if(!b) return;
  const v = b.dataset.place;
  if(v==="none"){ locState = {busy:false, places:null, msg:""}; renderLoc(); $("barName").focus(); return }
  if(v==="change"){ delete S.night.place; findMe(false); return }
  const p = locState.places?.[+v]; if(p) confirmPlace(p);
});

/* on a fresh night, if location is already allowed, offer a suggestion without being asked */
let autoLocated = false;
async function autoLocate(){
  if(autoLocated || !S || S.night.barName || tonight().length) return;
  autoLocated = true;
  try{
    const st = await navigator.permissions?.query({name:"geolocation"});
    if(st?.state==="granted") findMe(true);
  }catch{}
}
