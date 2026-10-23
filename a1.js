"use strict";
/* ================= constants ================= */
const CATS = {
  light:   {grp:"beer", name:"Light beer",          price:5,  oz:16, abv:4.2, hint:"Bud Light, Michelob Ultra, Coors Light. A pint is 16 oz, a can 12 oz."},
  lager:   {grp:"beer", name:"Lager / pilsner",     price:6,  oz:16, abv:5,   hint:"Modelo, Stella, Shiner Bock, pilsners. Most run 4.5–5.5%."},
  wheat:   {grp:"beer", name:"Wheat / hefeweizen",  price:7,  oz:16, abv:5.2, hint:"Blue Moon, hefeweizens, witbiers. Usually 5–5.5%."},
  amber:   {grp:"beer", name:"Amber / brown ale",   price:7,  oz:16, abv:5.5, hint:"Ambers, browns, Märzens, Oktoberfests, red ales."},
  craft:   {grp:"beer", name:"IPA / pale ale",      price:8,  oz:16, abv:6.5, hint:"West Coast IPAs and pale ales. Check the board for ABV."},
  hazy:    {grp:"beer", name:"Hazy / double IPA",   price:9,  oz:12, abv:7.5, hint:"Hazies run 6.5–8%; doubles 8–10%, often in a 10–12 oz pour."},
  stout:   {grp:"beer", name:"Stout / porter",      price:8,  oz:16, abv:6,   hint:"Guinness is 4.2%; imperial stouts run 9–12% in a 10 oz pour."},
  sour:    {grp:"beer", name:"Sour / fruited",      price:8,  oz:12, abv:5,   hint:"Goses, Berliner weisses, fruited sours. Often 4–6%."},
  belgian: {grp:"beer", name:"Belgian / strong ale",price:9,  oz:10, abv:8.5, hint:"Tripels, dubbels, quads, saisons. Often served in a 10 oz tulip."},
  whiskey: {grp:"spirit", name:"Whiskey / spirit, neat", price:12, oz:2, abv:45, hint:"A standard pour is 1.5–2 oz. Proof ÷ 2 = ABV."},
  stirred: {grp:"spirit", name:"Spirit-forward cocktail", price:13, oz:2, abv:45, hint:"Easier: use By ingredients."},
  citrus:  {grp:"spirit", name:"Citrus / sweet cocktail", price:11, oz:1.5, abv:40, hint:"Easier: use By ingredients."},
  highball:{grp:"spirit", name:"Highball / mixed drink",  price:8,  oz:1.5, abv:40, hint:"Most bars pour 1.5 oz of liquor in a highball."},
  shot:    {grp:"spirit", name:"Shot",              price:7,  oz:1.5, abv:40,  hint:"A shot is usually 1.5 oz."},
  wine:    {grp:"other", name:"Wine",               price:10, oz:6,   abv:13,  hint:"A glass pour is usually 5–6 oz."},
  seltzer: {grp:"other", name:"Seltzer / cider",    price:6,  oz:12,  abv:5,   hint:"Most cans are 12 oz."}
};
const GROUPS = {beer:"Beer", spirit:"Cocktails & spirits", other:"Wine & other"};
/* finer beer styles borrow scene fit from the closest broad style */
const FAM = {lager:"light", wheat:"light", amber:"craft", hazy:"craft", stout:"craft", sour:"craft", belgian:"craft"};
const isBeer = k => CATS[k]?.grp==="beer";
const catOptions = sel => Object.entries(GROUPS).map(([g,gn])=>`<optgroup label="${gn}">`+
  Object.entries(CATS).filter(([,v])=>v.grp===g).map(([k,v])=>`<option value="${k}" ${k===sel?"selected":""}>${esc(v.name)}</option>`).join("")+`</optgroup>`).join("");
const BARS = {none:"Anywhere",dive:"Dive bar",sports:"Sports bar",brewery:"Brewery",cocktail:"Cocktail bar",restaurant:"Restaurant"};
const BAR_FIT = {
  none:{},
  dive:{light:.2,shot:.2,highball:.15,stirred:-.3,citrus:-.3,craft:-.1,wine:-.2},
  sports:{light:.2,highball:.15,craft:.05,stirred:-.2,citrus:-.15,wine:-.2},
  brewery:{craft:.3,light:.05,stirred:-.4,citrus:-.4,highball:-.2,shot:-.2},
  cocktail:{stirred:.3,citrus:.3,whiskey:.15,highball:.05,light:-.1},
  restaurant:{wine:.25,stirred:.05,shot:-.3}
};
const DEFAULT_PREFS = {light:6,lager:6,wheat:6,amber:6,craft:7,hazy:7,stout:6,sour:6,belgian:6,whiskey:7,stirred:7,citrus:6,highball:6,wine:5,seltzer:4,shot:4};
const SCAN_MODEL = "claude-sonnet-5-5";
const ING = window.INGREDIENTS, LIB = window.COCKTAILS;

const freshState = () => ({
  v:2, prefs:{...DEFAULT_PREFS}, ratings:{}, history:[],
  night:{id:Date.now(), bar:"none", barName:""},
  cap:4, capOn:true, menu:[],
  cur:fromLibrary(LIB.find(c=>c.name==="Old Fashioned"))
});

/* ================= helpers ================= */
const $ = id => document.getElementById(id);
const fmt = (n,d=2) => Number(n||0).toFixed(d);
const keyOf = name => String(name||"").toLowerCase().replace(/[^a-z0-9]/g,"");
const esc = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function toast(m){ const t=$("toast"); t.textContent=m; t.classList.add("show"); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove("show"),2200) }
const ls = {
  get(k){ try{ return JSON.parse(localStorage.getItem(k)) }catch{ return null } },
  set(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)) }catch{} },
  del(k){ try{ localStorage.removeItem(k) }catch{} }
};
function fromLibrary(c){
  return {name:c.name, cat:c.cat, price:c.price, mode:"parts", parts:c.parts.map(p=>[...p]),
          oz:CATS[c.cat].oz, abv:CATS[c.cat].abv, enj:null, rare:false, lib:c.name};
}
function alcOz(d){
  if(d.mode==="parts" && d.parts?.length) return d.parts.reduce((a,[k,oz])=>a + (+oz||0)*((ING[k]?.abv)||0)/100, 0);
  return (+d.oz||0)*(+d.abv||0)/100;
}
const stdOf = d => alcOz(d)/0.6;

/* ================= session & sync ================= */
let TOKEN = ls.get("lc.token"), ME = ls.get("lc.me"), S = null;
let saveTimer = null, saving = false, dirty = false;

async function api(path, opts={}){
  const res = await fetch(path, {...opts, headers:{"Content-Type":"application/json", ...(TOKEN?{Authorization:"Bearer "+TOKEN}:{}), ...(opts.headers||{})}});
  let body = null; try{ body = await res.json() }catch{}
  if(res.status===401 && TOKEN && path!=="/api/login"){ signOut("Your sign-in expired. Please sign in again."); throw new Error("auth") }
  if(!res.ok) throw new Error(body?.error || "Something went wrong. Try again.");
  return body;
}
function setSync(text, bad){ const s=$("sync"); s.textContent=text; s.classList.toggle("bad",!!bad) }
function save(){
  ls.set("lc.cache."+ME?.key, S); ls.set("lc.pending."+ME?.key, true);
  dirty = true; setSync("Saving…");
  clearTimeout(saveTimer); saveTimer = setTimeout(flush, 900);
}
async function flush(){
  if(saving || !dirty || !TOKEN) return;
  saving = true; dirty = false;
  try{
    const r = await api("/api/data",{method:"PUT", body:JSON.stringify({data:S})});
    S.savedAt = r.savedAt; ls.set("lc.cache."+ME?.key, S);
    if(!dirty){ ls.del("lc.pending."+ME?.key); setSync("Saved") }
  }
  catch(e){ if(e.message!=="auth"){ dirty = true; setSync("Not saved. Will retry.", true); clearTimeout(saveTimer); saveTimer = setTimeout(flush, 8000) } saving = false; return }
  saving = false;
  if(dirty){ clearTimeout(saveTimer); saveTimer = setTimeout(flush, 900) }
}
addEventListener("pagehide", ()=>{ if(dirty && TOKEN){ try{ fetch("/api/data",{method:"PUT",keepalive:true,headers:{"Content-Type":"application/json",Authorization:"Bearer "+TOKEN},body:JSON.stringify({data:S})}) }catch{} } });
addEventListener("online", ()=>{ if(dirty) flush() });

function adopt(data){
  const base = freshState();
  S = Object.assign(base, data||{});
  // new beer styles start from the user's existing light / craft ratings
  const old = S.prefs || {};
  const seed = {};
  for(const k in FAM) if(old[k]==null && old[FAM[k]]!=null) seed[k] = old[FAM[k]];
  S.prefs = Object.assign({...DEFAULT_PREFS}, seed, old);
  S.night = Object.assign(base.night, S.night||{});
  S.ratings ||= {}; S.history ||= []; S.menu ||= [];
  if(!S.cur || !CATS[S.cur.cat]) S.cur = base.cur;
}

