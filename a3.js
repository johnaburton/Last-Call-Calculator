/* ================= scene & plan ================= */
function renderScene(){
  $("bars").innerHTML = Object.entries(BARS).map(([k,v])=>`<button type="button" class="chip" data-bar="${k}" aria-pressed="${S.night.bar===k}">${v}</button>`).join("");
  if(document.activeElement!==$("barName")) $("barName").value = S.night.barName||"";
  const h = had();
  $("capOut").textContent = S.cap; $("hadOut").textContent = fmt(h,1); $("capOn").checked = S.capOn;
  $("meter").querySelector("i").style.width = Math.min(100, h/S.cap*100)+"%";
  $("meter").classList.toggle("over", h >= S.cap);
  const left = S.cap - h;
  $("capHint").textContent = left > 0 ? `${fmt(left,1)} standard drinks left in your plan.` : `You've hit your plan for tonight.`;
}
$("bars").addEventListener("click", e=>{ const b=e.target.closest("[data-bar]"); if(b){ S.night.bar=b.dataset.bar; renderLive() } });
$("barName").addEventListener("input", e=>{ S.night.barName = e.target.value; save() });
$("capUp").onclick = ()=>{ S.cap++; renderLive() };
$("capDown").onclick = ()=>{ S.cap = Math.max(1,S.cap-1); renderLive() };
$("capOn").onchange = e=>{ S.capOn = e.target.checked; renderLive() };

/* ================= ordering, rating ================= */
let ratingFor = null; // history entry id being rated in tonight's tab
$("orderBtn").onclick = ()=>{
  const d = S.cur, r = score(d);
  const name = d.name.trim() || CATS[d.cat].name;
  S.history.push({id:Date.now(), t:Date.now(), night:S.night.id, name, generic:!d.name.trim(), cat:d.cat, sd:r.sd, sc:r.sc, price:effPrice(d), listPrice:d.price, deal:dealActive(d) ? dealText(d) : "",
    bar:S.night.bar, barName:S.night.barName||"", spec:{mode:d.mode, parts:d.parts, oz:d.oz, abv:d.abv}, r:null});
  if(S.history.length > 1500) S.history = S.history.slice(-1500);
  ratingFor = S.history[S.history.length-1].id;
  renderLive(); toast("Logged. Rate it in tonight's tab once you've tried it.");
};
function setRating(name, cat, val, spec){
  const k = keyOf(name); if(!k) return;
  const cur = S.ratings[k] || {name, cat, r:null, n:0};
  cur.name = name; cur.cat = cat || cur.cat; if(spec) cur.spec = spec;
  if(val==null){ delete S.ratings[k]; return }
  cur.r = val; cur.n = Math.max(1, cur.n); cur.t = Date.now();
  S.ratings[k] = cur;
}
function rateEntry(id, val){
  const h = S.history.find(x=>x.id===id); if(!h) return;
  const first = h.r==null;
  const k = keyOf(h.name), R = S.ratings[k];
  if(h.generic){ /* unnamed drink: only teaches the type rating */ }
  else if(R && R.r!=null){
    // fold this rating into the drink's running average
    const n = R.n||1;
    R.r = first ? Math.round(((R.r*n)+val)/(n+1)*10)/10 : Math.round(((R.r*n)-(h.r)+val)/n*10)/10;
    R.n = first ? n+1 : n; R.t = Date.now(); R.spec ||= h.spec;
  } else setRating(h.name, h.cat, val, h.spec);
  if(first) S.prefs[h.cat] = Math.round((S.prefs[h.cat]*0.8 + val*0.2)*2)/2;
  h.r = val;
}

/* ================= forecast ================= */
function candidates(){
  const out = Object.entries(CATS).map(([k,c])=>({kind:"type", key:k, cat:k, name:c.name, e:S.prefs[k],
    d:{name:"", cat:k, price:c.price, mode:"simple", parts:[], oz:c.oz, abv:c.abv, enj:null, rare:false}}));
  for(const R of Object.values(S.ratings)){
    if(R.r==null || R.r < 7) continue;
    const lib = LIB.find(c=>keyOf(c.name)===keyOf(R.name));
    let d = null;
    if(lib) d = fromLibrary(lib);
    else if(R.spec){ const last = [...S.history].reverse().find(h=>keyOf(h.name)===keyOf(R.name));
      d = {name:R.name, cat:R.cat, price:last?.listPrice||last?.price||CATS[R.cat].price, ...R.spec, enj:null, rare:false} }
    if(d){ d.name = R.name; out.push({kind:"named", key:keyOf(R.name), cat:R.cat||d.cat, name:R.name, e:R.r, d}) }
  }
  return out;
}
function forecast(){
  const log = tonight(), n = log.length;
  if(n < 2) return {locked:true, n};
  const h = had(), left = S.cap - h;
  const hrs = Math.max((Date.now() - log[0].t)/36e5, 1), pace = h/hrs;
  const byCat = {}; log.forEach(l=>{ if(l.r) (byCat[l.cat] ||= []).push(l.r) });
  const lastTwo = log.slice(-2).map(l=>l.cat), streak = lastTwo[0]===lastTwo[1] ? lastTwo[0] : null;
  const progress = Math.min(1, h/S.cap);
  const list = candidates().map(c=>{
    const sd = stdOf(c.d), why = [];
    let e = c.e;
    if(c.kind==="named") why.push(`You rate it ${fmt(c.e,1)}`);
    if(byCat[c.cat]){ const avg = byCat[c.cat].reduce((a,b)=>a+b)/byCat[c.cat].length; e = e*0.5 + avg*0.5; if(avg>=8) why.push(`You're loving ${CATS[c.cat].name.toLowerCase()} tonight`) }
    const fit = fitFor(c.cat); if(fit>=1.2 && exOn("fit")) why.push(`Fits the scene (×${fmt(fit)})`);
    let mod = 1;
    if(streak===c.cat && ["citrus","shot","stirred"].includes(c.cat)) mod *= .8;
    if(streak===c.cat && byCat[c.cat] && Math.min(...byCat[c.cat])<6) mod *= .75;
    mod *= 1 - .25*Math.max(0, sd-1)*progress;
    if(progress>.5 && sd<=1.15) why.push("Lighter pour for later in the night");
    if(c.kind==="named") mod *= 1.05;
    const sc = sd <= left+.05 && (c.d.price>0 || !exOn("price")) ? combine(e, fit, Math.sqrt(sd), c.d.price)*mod : 0;
    if(!why.length) why.push(`Solid value at a typical $${c.d.price}`);
    return {...c, sc, why};
  }).filter(c=>c.sc>0).sort((a,b)=>b.sc-a.sc);
  return {locked:false, n, h, left, pace, list};
}
let fcList = [];
function renderForecast(){
  const f = forecast(), box = $("forecast");
  box.classList.toggle("locked", f.locked);
  if(f.locked){ box.innerHTML = `<p class="hint" style="font-size:.9rem">Log ${2-f.n} more drink${f.n===1?"":"s"} tonight to unlock a forecast. It weighs what you've rated well, the scene, your pace, and what's left in your plan.</p>`; return }
  let pace;
  if(f.left <= .3) pace = `<div class="pace warn">You've reached your plan for tonight. Next round: water, or call it a great night.</div>`;
  else if(f.pace > 1.5) pace = `<div class="pace warn">You're at about ${fmt(f.pace,1)} standard drinks an hour. Have a water before the next one.</div>`;
  else pace = `<div class="pace">Pace: about ${fmt(f.pace,1)} standard drinks an hour, ${fmt(f.left,1)} left in your plan.</div>`;
  if(f.left > .3 && !f.list.length) pace += `<p class="hint">Nothing typical fits in the ${fmt(f.left,1)} standard drinks left in your plan. A half pour, a light beer can or a water would.</p>`;
  if(f.left <= .3 || !f.list.length){ box.innerHTML = pace; return }
  fcList = f.list;
  const top = f.list[0], alts = f.list.slice(1,4);
  box.innerHTML = `<div class="label">Next round</div>
    <div class="pick">${esc(top.name)}</div>
    <ul class="reasons">${top.why.slice(0,3).map(w=>`<li>${esc(w)}</li>`).join("")}</ul>
    ${pace}
    <div class="btnrow"><button class="btn primary" type="button" data-fc="0">Score it</button></div>
    ${alts.length?`<div class="label">Also good</div><div class="chips">${alts.map((a,i)=>`<button type="button" class="chip" data-fc="${i+1}">${esc(a.name)}</button>`).join("")}</div>`:""}`;
}
$("forecast").addEventListener("click", e=>{
  const b = e.target.closest("[data-fc]"); if(!b) return;
  const c = fcList[+b.dataset.fc]; if(!c) return;
  loadDrink(c.d, c.kind==="named" ? `${c.name} loaded. Check the price on the menu.` : `Typical ${c.name} loaded. Edit to match the menu.`);
});

/* ================= tonight's tab ================= */
const picker = (attr, id, sel) => `<div class="picker">${[1,2,3,4,5,6,7,8,9,10].map(n=>`<button type="button" ${attr}="${id}" data-v="${n}" aria-pressed="${sel===n}" aria-label="Rate ${n}">${n}</button>`).join("")}</div>`;
function entryHTML(l, editable){
  const tm = new Date(l.t).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"});
  const open = editable && ratingFor===l.id;
  return `<li><time>${tm}</time>
    <div class="what">${esc(l.name)}<small>${esc(CATS[l.cat]?.name||"")} · ${fmt(l.sd,1)} std · $${fmt(l.price)}${l.deal?" on deal":""} · scored ${fmt(l.sc)}</small></div>
    <div class="rv">${open?"":(l.r!=null?`<button class="btn ghost" type="button" data-rate-open="${l.id}">${l.r}/10</button>`:`<button class="btn ghost" type="button" data-rate-open="${l.id}">Rate</button>`)}</div>
    ${open?picker("data-rate-entry", l.id, l.r):""}</li>`;
}
function renderLog(){
  const log = tonight();
  $("log").innerHTML = log.length ? log.map(l=>entryHTML(l,true)).join("") : `<li class="empty">Nothing yet. Tap "I'm ordering this" when you order.</li>`;
}
document.addEventListener("click", e=>{
  const o = e.target.closest("[data-rate-open]");
  if(o){ ratingFor = +o.dataset.rateOpen; renderLog(); if(!$("view-history").hidden) renderHistory(); return }
  const b = e.target.closest("[data-rate-entry]");
  if(b){
    const id = +b.dataset.rateEntry, v = +b.dataset.v;
    rateEntry(id, v); ratingFor = null;
    const h = S.history.find(x=>x.id===id);
    toast(h.generic ? `${v}/10. Your ${CATS[h.cat].name} rating is now ${fmt(S.prefs[h.cat],1)}.` : `${h.name}: ${v}/10. Saved to your ratings.`);
    renderEnj(); renderLive(); if(!$("view-history").hidden) renderHistory();
  }
});
let armed = false;
$("newNight").onclick = ()=>{
  if(!armed){ armed = true; $("newConfirm").hidden = false; setTimeout(()=>{armed=false;$("newConfirm").hidden=true},4000); return }
  armed = false; $("newConfirm").hidden = true;
  S.night = {id:Date.now(), bar:"none", barName:""};
  ratingFor = null; renderLive(); toast("New night started. Last night is in History.");
};

