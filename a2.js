/* ================= auth ================= */
let signupMode = false;
function showAuth(msg){
  $("app").hidden = true; $("auth").hidden = false;
  $("authErr").hidden = !msg; $("authErr").textContent = msg||"";
}
$("authSwitch").onclick = ()=>{
  signupMode = !signupMode;
  $("authTitle").textContent = signupMode ? "Create your name" : "Sign in";
  $("authGo").textContent = signupMode ? "Create and start" : "Sign in";
  $("authSwitch").textContent = signupMode ? "Already have a name? Sign in" : "New here? Create a name";
  $("authPin").autocomplete = signupMode ? "new-password" : "current-password";
  $("authErr").hidden = true;
};
$("authPin").addEventListener("input", e=>{ e.target.value = e.target.value.replace(/\D/g,"").slice(0,4) });
$("authForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const name = $("authName").value.trim(), pin = $("authPin").value;
  if(name.length<2){ return showAuth("Enter a name with at least 2 letters.") }
  if(!/^\d{4}$/.test(pin)){ return showAuth("Your PIN must be exactly 4 digits.") }
  $("authGo").disabled = true; $("authErr").hidden = true;
  try{
    const r = await api(signupMode ? "/api/signup" : "/api/login", {method:"POST", body:JSON.stringify({name, pin})});
    TOKEN = r.token; ME = {name:r.name, key:keyOf(r.name)};
    ls.set("lc.token", TOKEN); ls.set("lc.me", ME);
    adopt(r.data);
    if(!r.data) save();
    $("authPin").value = "";
    startApp();
  }catch(err){ showAuth(err.message) }
  finally{ $("authGo").disabled = false }
});
function signOut(msg){
  TOKEN = null; ME = null; S = null; ls.del("lc.token"); ls.del("lc.me");
  showAuth(msg);
}
$("signOut").onclick = async ()=>{ if(dirty) await flush(); signOut() };

/* ================= views ================= */
function showView(v){
  document.querySelectorAll(".tab").forEach(t=>t.setAttribute("aria-selected", t.dataset.view===v));
  document.querySelectorAll(".view").forEach(el=>el.hidden = el.id!=="view-"+v);
  if(v==="ratings") renderRatings();
  if(v==="history") renderHistory();
  if(v==="settings") renderSettings();
  scrollTo({top:0});
}
document.querySelectorAll(".tab").forEach(t=>t.onclick=()=>showView(t.dataset.view));

/* ================= scoring ================= */
const tonight = () => S.history.filter(h=>h.night===S.night.id);
const had = () => Math.round(tonight().reduce((a,l)=>a+l.sd,0)*10)/10;
function fitFor(cat){
  const t = BAR_FIT[S.night.bar] || {};
  let f = 1 + (t[cat] ?? t[FAM[cat]] ?? 0);
  return Math.min(1.5, Math.max(.5, f));
}
function enjoymentFor(d){
  if(d.enj!=null) return {e:d.enj, src:"adjusted"};
  const r = S.ratings[keyOf(d.name)];
  if(r && r.r!=null) return {e:r.r, src:"named", n:r.n};
  return {e:S.prefs[d.cat], src:"type"};
}
function score(d){
  const sd = stdOf(d), fit = fitFor(d.cat), {e} = enjoymentFor(d);
  const str = Math.sqrt(sd);
  const price = effPrice(d);
  const sc = (price>0 || !exOn("price")) && sd>0 ? combine(e, fit, str, price)*(d.rare?1.2:1) : 0;
  return {sd, fit, e, str, sc, price, per: sd>0 ? price/sd : 0};
}
function verdictFor(sc){
  if(sc >= 1.0) return ["Order it","Great value for how much you'll enjoy it."];
  if(sc >= 0.7) return ["Good call","Worth the price in this setting."];
  if(sc >= 0.45) return ["Fair","Fine, but something else might suit the moment better."];
  return ["Pass","Pricey for what it delivers here."];
}

/* ================= score view: drink entry ================= */
const ingOptions = sel => Object.entries(ING).map(([k,v])=>`<option value="${k}" ${k===sel?"selected":""}>${esc(v.name)} (${v.abv}%)</option>`).join("");
$("fCat").innerHTML = catOptions(); $("arCat").innerHTML = catOptions("whiskey");
$("arR").innerHTML = [10,9.5,9,8.5,8,7.5,7,6.5,6,5.5,5,4,3,2,1].map(n=>`<option value="${n}" ${n===8?"selected":""}>${n}</option>`).join("");

function renderDrink(){
  const c = S.cur;
  $("cats").innerHTML = Object.entries(GROUPS).map(([g,gn])=>`<div class="catgrp"><span class="catg">${gn}</span><div class="chips">`+
    Object.entries(CATS).filter(([,v])=>v.grp===g).map(([k,v])=>`<button type="button" class="chip" data-cat="${k}" aria-pressed="false">${esc(v.name)}</button>`).join("")+`</div></div>`).join("");
  $("fName").value = c.name||""; $("fPrice").value = c.price||""; $("fCat").value = c.cat;
  $("fDealType").value = c.deal?.type || ""; $("fDealVal").value = c.deal?.type ? c.deal.value : "";
  $("fOz").value = c.oz||""; $("fAbv").value = c.abv||""; $("fRare").checked = !!c.rare;
  $("sizeHint").textContent = CATS[c.cat].hint;
  document.querySelectorAll("[data-mode]").forEach(b=>b.setAttribute("aria-pressed", b.dataset.mode===(c.mode||"simple")));
  $("simpleBox").hidden = c.mode==="parts"; $("partsBox").hidden = c.mode!=="parts";
  renderParts(); renderEnj();
}
function renderParts(){
  const c = S.cur; c.parts ||= [];
  $("partsList").innerHTML = c.parts.map(([k,oz],i)=>`<li>
    <select data-pi="${i}" aria-label="Ingredient ${i+1}">${ingOptions(k)}</select>
    <input type="number" data-po="${i}" value="${oz}" min="0" step="0.25" inputmode="decimal" aria-label="Ounces of ingredient ${i+1}">
    <button type="button" class="x" data-px="${i}" aria-label="Remove ingredient ${i+1}">×</button></li>`).join("")
    || `<li class="hint" style="display:block">No alcohol added yet.</li>`;
}
function renderAlc(){
  const a = alcOz(S.cur), sd = a/0.6;
  let total = "";
  if(S.cur.mode==="parts" && S.cur.parts?.length){
    const oz = S.cur.parts.reduce((x,[,o])=>x+(+o||0),0);
    total = ` from ${fmt(oz,2).replace(/\.?0+$/,"")} oz of liquor`;
  }
  $("alcLine").textContent = `${fmt(a,2)} oz of alcohol${total} = ${fmt(sd,1)} standard drinks`;
}
function renderEnj(){
  const c = S.cur, en = enjoymentFor(c);
  $("fEnj").value = en.e; $("enjOut").textContent = fmt(en.e,1);
  $("enjHint").textContent =
    en.src==="adjusted" ? `Adjusted for this drink.` :
    en.src==="named" ? `Your rating for ${c.name}${en.n>1?`, from ${en.n} ratings`:""}. Slide to adjust.` :
    `Your usual for ${CATS[c.cat].name}. Rate this drink by name to make it specific.`;
}
function renderScore(){
  const r = score(S.cur), [word, why] = verdictFor(r.sc);
  $("vNum").textContent = fmt(r.sc); $("vWord").textContent = word; $("vWhy").textContent = why;
  $("vGauge").style.width = Math.min(100, r.sc/1.5*100)+"%";
  $("xEnj").textContent = fmt(r.e,1); $("xFit").textContent = "×"+fmt(r.fit);
  $("xStr").textContent = fmt(r.str); $("xPer").textContent = "$"+fmt(r.per);
  $("orderBtn").disabled = !(r.sd>0 && (S.cur.price>0 || !exOn("price")));
  renderAlc(); renderDeal(); renderFactors();
}
const FKEYS = {xEnj:"enj", xFit:"fit", xStr:"str", xPer:"price"};
document.querySelectorAll(".factor").forEach(el=>{
  el.dataset.fk = FKEYS[el.querySelector("b").id];
  el.setAttribute("role","button"); el.tabIndex = 0;
});
function renderFactors(){
  document.querySelectorAll(".factor").forEach(el=>el.setAttribute("aria-pressed", exOn(el.dataset.fk)));
  const out = Object.keys(FACTOR_NAMES).filter(k=>!exOn(k));
  const top = (exOn("enj")?"enjoyment":"") + (exOn("fit")?(exOn("enj")?" × ":"")+"fit":"") + (exOn("str")?((exOn("enj")||exOn("fit"))?" × ":"")+"√standard drinks":"");
  const f = (top || "1") + (exOn("price") ? " ÷ price" : "");
  const note = out.length ? ` Left out: ${out.map(k=>FACTOR_NAMES[k]).join(", ")}${!exOn("price")?" (every drink is treated as $10)":""}.` : "";
  const p = document.querySelector(".factors + p.hint");
  if(p) p.textContent = `Tap a factor to leave it out. score = ${f}.${note} One standard drink is 0.6 oz of alcohol.`;
}
function toggleFactor(k){
  S.ex ||= {};
  if(exOn(k) && Object.keys(FACTOR_NAMES).filter(x=>exOn(x)).length===1){ toast("Keep at least one factor in the score."); return }
  S.ex[k] = !S.ex[k];
  renderLive(); toast(S.ex[k] ? `Leaving ${FACTOR_NAMES[k]} out of scores` : `Counting ${FACTOR_NAMES[k]} again`);
}
document.querySelector(".factors").addEventListener("click", e=>{ const el = e.target.closest(".factor"); if(el) toggleFactor(el.dataset.fk) });
document.querySelector(".factors").addEventListener("keydown", e=>{ const el = e.target.closest(".factor"); if(el && (e.key==="Enter"||e.key===" ")){ e.preventDefault(); toggleFactor(el.dataset.fk) } });
function renderDeal(){
  const c = S.cur, t = c.deal?.type || "";
  $("dealValWrap").hidden = !t;
  $("dealValLabel").textContent = t==="pct" ? "Percent off" : t==="off" ? "Dollars off" : "Deal price $";
  document.querySelectorAll("[data-quick]").forEach(b=>b.setAttribute("aria-pressed", t==="pct" && +c.deal.value===+b.dataset.quick));
  $("dealLine").textContent = !t ? "Happy hour or a special? Set it here and the score uses the deal price."
    : dealActive(c) ? `You pay $${fmt(effPrice(c))} instead of $${fmt(c.price)} (${dealText(c)}).`
    : `This deal is over (${dealText(c)}). Scoring at full price.`;
}
function loadCat(k){
  const p = CATS[k];
  S.cur = {name:"", cat:k, price:p.price, mode:"simple", parts:[], oz:p.oz, abv:p.abv, enj:null, rare:false};
  renderDrink(); renderLive(); toast(`Typical ${p.name} loaded. Edit to match the menu.`);
}
function loadDrink(d, msg){
  S.cur = JSON.parse(JSON.stringify(d)); S.cur.enj = null;
  renderDrink(); renderLive();
  $("drinkSec").scrollIntoView({behavior: reduceMotion()?"auto":"smooth", block:"start"});
  if(msg) toast(msg);
}

/* cocktail library search */
function libMatches(q){
  q = keyOf(q); if(!q) return [];
  return LIB.filter(c=>keyOf(c.name).includes(q)).slice(0,6);
}
function renderLib(){
  const list = libMatches($("libSearch").value);
  $("libList").innerHTML = list.map(c=>{
    const r = S.ratings[keyOf(c.name)];
    const sd = stdOf({mode:"parts",parts:c.parts});
    return `<li><button type="button" data-lib="${esc(c.name)}">
      <span class="ln">${esc(c.name)}</span><span class="lr">${r?.r!=null?`★ ${fmt(r.r,1)}`:""}</span>
      <span class="ls">${c.parts.map(([k,oz])=>`${oz} oz ${ING[k].name}`).join(" + ")} · ${fmt(sd,1)} std</span></button></li>`;
  }).join("");
}
$("libSearch").addEventListener("input", renderLib);
$("libList").addEventListener("click", e=>{
  const b = e.target.closest("[data-lib]"); if(!b) return;
  const c = LIB.find(x=>x.name===b.dataset.lib);
  $("libSearch").value = ""; renderLib();
  loadDrink(fromLibrary(c), `${c.name} loaded with a typical recipe. Set the price from the menu.`);
});

/* drink form events */
$("cats").addEventListener("click", e=>{ const b=e.target.closest("[data-cat]"); if(b) loadCat(b.dataset.cat) });
document.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>{
  const c = S.cur, m = b.dataset.mode;
  if(m===c.mode) return;
  if(m==="parts" && !(c.parts?.length)){
    // seed one spirit that matches current strength
    c.parts = [[c.cat==="wine"?"wine":isBeer(c.cat)||c.cat==="seltzer"?"beer":"bourbon", c.oz||1.5]];
  }
  if(m==="simple" && c.mode==="parts"){
    const oz = c.parts.reduce((x,[,o])=>x+(+o||0),0);
    c.oz = Math.round(oz*100)/100 || CATS[c.cat].oz;
    c.abv = oz ? Math.round(alcOz(c)/oz*1000)/10 : CATS[c.cat].abv;
  }
  c.mode = m; renderDrink(); renderLive();
});
$("fName").addEventListener("input", e=>{ S.cur.name = e.target.value; S.cur.enj = null; renderEnj(); renderScore(); save() });
$("fPrice").addEventListener("input", e=>{ S.cur.price = parseFloat(e.target.value)||0; renderScore(); save() });
$("fCat").addEventListener("change", e=>{ S.cur.cat = e.target.value; $("sizeHint").textContent = CATS[S.cur.cat].hint; renderEnj(); renderLive() });
$("fDealType").addEventListener("change", e=>{
  const t = e.target.value, p = S.cur.price||0;
  S.cur.deal = t ? {type:t, value: t==="pct" ? 50 : t==="off" ? 1 : Math.round(p/2*4)/4, label:""} : null;
  $("fDealVal").value = S.cur.deal ? S.cur.deal.value : ""; renderLive();
});
$("fDealVal").addEventListener("input", e=>{ if(!S.cur.deal) return; S.cur.deal.value = parseFloat(e.target.value)||0; S.cur.deal.label = ""; S.cur.deal.until = null; renderScore(); save() });
$("dealQuick").addEventListener("click", e=>{
  const b = e.target.closest("[data-quick]"); if(!b) return;
  const v = +b.dataset.quick, on = S.cur.deal?.type==="pct" && +S.cur.deal.value===v;
  S.cur.deal = on ? null : {type:"pct", value:v, label:""};
  renderDrink(); renderLive();
});
$("fOz").addEventListener("input", e=>{ S.cur.oz = parseFloat(e.target.value)||0; renderScore(); save() });
$("fAbv").addEventListener("input", e=>{ S.cur.abv = parseFloat(e.target.value)||0; renderScore(); save() });
$("fRare").addEventListener("change", e=>{ S.cur.rare = e.target.checked; renderScore(); save() });
$("fEnj").addEventListener("input", e=>{ S.cur.enj = +e.target.value; renderEnj(); renderScore(); save() });
$("addPart").onclick = ()=>{ S.cur.parts.push(["vodka",1]); renderParts(); renderScore(); save() };
$("partsList").addEventListener("change", e=>{
  const i = e.target.dataset.pi; if(i==null) return;
  S.cur.parts[+i][0] = e.target.value; renderScore(); save();
});
$("partsList").addEventListener("input", e=>{
  const i = e.target.dataset.po; if(i==null) return;
  S.cur.parts[+i][1] = parseFloat(e.target.value)||0; renderScore(); save();
});
$("partsList").addEventListener("click", e=>{
  const i = e.target.closest("[data-px]")?.dataset.px; if(i==null) return;
  S.cur.parts.splice(+i,1); renderParts(); renderScore(); save();
});

