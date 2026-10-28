/* ================= ratings view ================= */
let rFilter = "all", rView = "drinks", rOpen = null;
function ratingRows(){
  const rows = new Map();
  for(const c of LIB) rows.set(keyOf(c.name), {name:c.name, cat:c.cat, r:null, n:0, lib:true});
  for(const [k,R] of Object.entries(S.ratings)) rows.set(k, {...(rows.get(k)||{}), ...R});
  let list = [...rows.values()];
  const q = keyOf($("rSearch").value);
  if(q) list = list.filter(x=>keyOf(x.name).includes(q));
  if(rFilter==="rated") list = list.filter(x=>x.r!=null);
  if(rFilter==="unrated") list = list.filter(x=>x.r==null);
  return list.sort((a,b)=> (b.r!=null)-(a.r!=null) || (b.r||0)-(a.r||0) || a.name.localeCompare(b.name));
}
function renderRatings(){
  document.querySelectorAll("[data-rview]").forEach(b=>b.setAttribute("aria-pressed", b.dataset.rview===rView));
  document.querySelectorAll("[data-rf]").forEach(b=>b.setAttribute("aria-pressed", b.dataset.rf===rFilter));
  $("rDrinks").hidden = rView!=="drinks"; $("rTypes").hidden = rView!=="types";
  if(rView==="types") return renderPrefs();
  const list = ratingRows();
  $("rList").innerHTML = list.length ? list.map(x=>{
    const k = keyOf(x.name), sel = x.r!=null ? Math.round(x.r) : null;
    return `<li><div><div class="rn">${esc(x.name)}</div><div class="rs">${esc(CATS[x.cat]?.name||"")}${x.n>1?` · ${x.n} ratings`:""}</div></div>
      <div class="rv">${x.r!=null?fmt(x.r,1):"–"}</div>${picker("data-rr", esc(k), sel)}</li>`;
  }).join("") : `<li class="empty">Nothing matches. Add it below.</li>`;
}
document.querySelectorAll("[data-rview]").forEach(b=>b.onclick=()=>{ rView = b.dataset.rview; renderRatings() });
$("rFilter").addEventListener("click", e=>{ const b=e.target.closest("[data-rf]"); if(b){ rFilter=b.dataset.rf; renderRatings() } });
$("rSearch").addEventListener("input", renderRatings);
$("rList").addEventListener("click", e=>{
  const b = e.target.closest("[data-rr]"); if(!b) return;
  const k = b.dataset.rr, v = +b.dataset.v;
  const lib = LIB.find(c=>keyOf(c.name)===k), R = S.ratings[k];
  const name = R?.name || lib?.name, cat = R?.cat || lib?.cat;
  if(R && Math.round(R.r)===v && b.getAttribute("aria-pressed")==="true"){ setRating(name, cat, null); toast(`Cleared ${name}`) }
  else { setRating(name, cat, v); toast(`${name}: ${v}/10`) }
  renderRatings(); renderEnj(); renderLive();
});
$("addRated").addEventListener("submit", e=>{
  e.preventDefault();
  const name = $("arName").value.trim(); if(!name) return;
  setRating(name, $("arCat").value, +$("arR").value);
  $("arName").value = ""; $("rSearch").value = ""; rFilter = "rated";
  renderRatings(); renderEnj(); renderLive(); toast(`Added ${name}`);
});
function renderPrefs(){
  $("prefs").innerHTML = `<p class="hint">Your usual enjoyment for each type, 1–10. Used for any drink you haven't rated by name. Rating drinks you order nudges these.</p>` +
    Object.entries(GROUPS).map(([g,gn])=>`<h3 class="prefg">${gn}</h3>`+
    Object.entries(CATS).filter(([,v])=>v.grp===g).map(([k,v])=>`<label class="pref" for="p_${k}"><span>${esc(v.name)}</span>
    <input type="range" id="p_${k}" min="1" max="10" step="0.5" value="${S.prefs[k]}" data-pref="${k}"><output>${fmt(S.prefs[k],1)}</output></label>`).join("")).join("");
}
$("prefs").addEventListener("input", e=>{
  const k = e.target.dataset.pref; if(!k) return;
  S.prefs[k] = +e.target.value; e.target.nextElementSibling.textContent = fmt(S.prefs[k],1);
  renderEnj(); renderScore(); renderForecast(); save();
});

/* ================= history view ================= */
function renderHistory(){
  const H = S.history;
  const rated = H.filter(h=>h.r!=null);
  const fav = Object.values(S.ratings).filter(r=>r.r!=null).sort((a,b)=>b.r-a.r || (b.n||0)-(a.n||0))[0];
  const nightsMap = new Map();
  for(const h of H){ (nightsMap.get(h.night) || nightsMap.set(h.night, []).get(h.night)).push(h) }
  $("stats").innerHTML = `
    <div class="stat"><b>${nightsMap.size}</b><span>Nights</span></div>
    <div class="stat"><b>${H.length}</b><span>Drinks logged</span></div>
    <div class="stat"><b>${rated.length?fmt(rated.reduce((a,h)=>a+h.r,0)/rated.length,1):"–"}</b><span>Avg rating</span></div>
    ${fav?`<div class="stat" style="grid-column:1/-1"><b>${esc(fav.name)}</b><span>Top rated · ${fmt(fav.r,1)}</span></div>`:""}`;
  const nights = [...nightsMap.entries()].sort((a,b)=>b[0]-a[0]);
  $("nights").innerHTML = nights.length ? nights.map(([id,list],i)=>{
    const d = new Date(list[0].t);
    const label = d.toLocaleDateString([], {weekday:"short", month:"short", day:"numeric"});
    const where = list.find(l=>l.barName)?.barName || (list[0].bar!=="none" ? BARS[list[0].bar] : "");
    const sd = list.reduce((a,l)=>a+l.sd,0);
    return `<details class="night" ${i===0?"open":""}><summary>${esc(label)}${where?` · ${esc(where)}`:""}${id===S.night.id?" (tonight)":""}<span>${list.length} drinks · ${fmt(sd,1)} std</span></summary>
      <ul class="log">${list.map(l=>entryHTML(l,true)).join("")}</ul></details>`;
  }).join("") : `<p class="empty">No drinks logged yet. Tap "I'm ordering this" on the Score tab when you order.</p>`;
}

/* ================= settings ================= */
function renderSettings(){
  $("meName").textContent = ME?.name || "You";
  const k = apiKey();
  $("apiKey").value = ""; $("apiKey").placeholder = k ? "Key saved: sk-ant-…" + k.slice(-4) : "sk-ant-…";
  $("keyStatus").textContent = k ? "A key is saved on this device. Menu scanning is on." : "No key saved. Menu scanning is off on this device.";
}
$("keySave").onclick = ()=>{
  const v = $("apiKey").value.trim();
  if(!/^sk-ant-/.test(v)){ $("keyStatus").textContent = "That doesn't look like an Anthropic key. It should start with sk-ant-."; return }
  ls.set("lc.apikey", v); renderSettings(); renderScanCard(); toast("Key saved on this device");
};
$("keyClear").onclick = ()=>{ ls.del("lc.apikey"); renderSettings(); renderScanCard(); toast("Key removed") };

/* ================= boot ================= */
function renderLive(){ renderScore(); renderScene(); renderForecast(); renderLog(); renderMenu(); save() }
function startApp(){
  $("auth").hidden = true; $("app").hidden = false;
  renderDrink(); renderScene(); renderScore(); renderForecast(); renderLog(); renderScanCard(); renderLib();
  setSync(dirty ? "Saving…" : "Saved");
  showView("score");
  autoLocate();
}
(async function boot(){
  if(!TOKEN || !ME){ showAuth(); return }
  const cached = ls.get("lc.cache."+ME.key);
  adopt(cached); startApp();
  try{
    if(cached && ls.get("lc.pending."+ME.key)){ dirty = true; await flush(); return }  // push changes made offline
    const r = await api("/api/data");
    if(r.data){ adopt(r.data); ls.set("lc.cache."+ME.key, S); startApp() }
    setSync("Saved");
  }catch(e){ if(e.message!=="auth") setSync("Offline. Changes save when you reconnect.", true) }
})();
