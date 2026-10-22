"use strict";
/* ================= constants ================= */
const CATS = {
  light:   {name:"Light beer",        price:5,  oz:16,  abv:4.2, hint:"A pint is 16 oz, a can 12 oz."},
  craft:   {name:"IPA / craft beer",  price:8,  oz:16,  abv:6.5, hint:"Check the board for ABV. Snifters are often 10 oz."},
  whiskey: {name:"Whiskey / spirit, neat", price:12, oz:2, abv:45, hint:"A standard pour is 1.5–2 oz. Proof ÷ 2 = ABV."},
  stirred: {name:"Spirit-forward cocktail", price:13, oz:2, abv:45, hint:"Easier: use By ingredients."},
  citrus:  {name:"Citrus / sweet cocktail", price:11, oz:1.5, abv:40, hint:"Easier: use By ingredients."},
  highball:{name:"Highball / mixed drink",  price:8,  oz:1.5, abv:40, hint:"Most bars pour 1.5 oz of liquor in a highball."},
  wine:    {name:"Wine",              price:10, oz:6,   abv:13,  hint:"A glass pour is usually 5–6 oz."},
  seltzer: {name:"Seltzer / cider",   price:6,  oz:12,  abv:5,   hint:"Most cans are 12 oz."},
  shot:    {name:"Shot",              price:7,  oz:1.5, abv:40,  hint:"A shot is usually 1.5 oz."}
};
const BARS = {none:"Anywhere",dive:"Dive bar",sports:"Sports bar",brewery:"Brewery",cocktail:"Cocktail bar",restaurant:"Restaurant"};
const BAR_FIT = {
  none:{},
  dive:{light:.2,shot:.2,highball:.15,stirred:-.3,citrus:-.3,craft:-.1,wine:-.2},
  sports:{light:.2,highball:.15,craft:.05,stirred:-.2,citrus:-.15,wine:-.2},
  brewery:{craft:.3,light:.05,stirred:-.4,citrus:-.4,highball:-.2,shot:-.2},
  cocktail:{stirred:.3,citrus:.3,whiskey:.15,highball:.05,light:-.1},
  restaurant:{wine:.25,stirred:.05,shot:-.3}
};
const CTX = {
  hot:  {label:"Hot out",      fit:{light:.3,seltzer:.3,citrus:.2,highball:.2,whiskey:-.2,stirred:-.1}},
  food: {label:"Eating",       fit:{wine:.2,craft:.1,light:.1,shot:-.2}},
  game: {label:"Game on",      fit:{light:.3,highball:.15,craft:.1,stirred:-.1,wine:-.1}},
  sip:  {label:"Slow sipping", fit:{whiskey:.25,stirred:.2,shot:-.3,light:-.1,highball:-.1}},
  late: {label:"Late night",   fit:{shot:.15,stirred:.1,light:-.05}},
  crowd:{label:"Big group",    fit:{light:.15,shot:.15,highball:.1,stirred:-.1}}
};
const DEFAULT_PREFS = {light:6,craft:7,whiskey:7,stirred:7,citrus:6,highball:6,wine:5,seltzer:4,shot:4};
const SCAN_MODEL = "claude-sonnet-5-5";
const ING = window.INGREDIENTS, LIB = window.COCKTAILS;

const freshState = () => ({
  v:2, prefs:{...DEFAULT_PREFS}, ratings:{}, history:[],
  night:{id:Date.now(), bar:"none", barName:"", ctx:{}},
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
  S.prefs = Object.assign({...DEFAULT_PREFS}, S.prefs);
  S.night = Object.assign(base.night, S.night||{});
  S.ratings ||= {}; S.history ||= []; S.menu ||= [];
  if(!S.cur || !CATS[S.cur.cat]) S.cur = base.cur;
}

