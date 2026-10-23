/* ================= menu scan (viewer's own key) ================= */
const apiKey = () => ls.get("lc.apikey");
function renderScanCard(){
  const has = !!apiKey();
  $("scanReady").hidden = !has;
  if(!document.querySelector(".scan").classList.contains("busy"))
    $("scanStatus").innerHTML = has
      ? "Claude reads the drinks, prices, sizes and ABV off the photo. Tap one to score it."
      : `To scan menus, add your Anthropic API key under <button type="button" class="btn ghost" style="padding:0;text-decoration:underline" data-goto="settings">Me</button>. You can still find cocktails or pick a type below.`;
  renderMenu();
}
document.addEventListener("click", e=>{ const g = e.target.closest("[data-goto]"); if(g) showView(g.dataset.goto) });
function renderMenu(){
  $("menuClear").hidden = !S.menu.length;
  $("menuList").innerHTML = S.menu.map((m,i)=>({m, i, r:score(m)})).sort((a,b)=>b.r.sc-a.r.sc).map(({m,i,r},rank)=>{
    return `<li><button type="button" data-menu="${i}">
      <span class="ln">${rank+1}. ${esc(m.name)}</span><span class="lr">${dealActive(m)?`<s class="was">$${fmt(m.price)}</s> `:""}$${fmt(effPrice(m))}</span>
      <span class="ls">${esc(CATS[m.cat].name)} · ${fmt(stdOf(m),1)} std${m.guess?" · strength estimated":""}${m.deal?.type?` · ${esc(dealText(m))}`:""} · score ${fmt(r.sc)}</span></button></li>`;
  }).join("");
}
$("menuList").addEventListener("click", e=>{
  const b = e.target.closest("[data-menu]"); if(!b) return;
  const m = S.menu[+b.dataset.menu];
  loadDrink(m, m.guess ? "Strength is estimated. Check it against the menu." : null);
});
$("menuClear").onclick = ()=>{ S.menu = []; renderMenu(); save() };

function scanPrompt(){
  return `This photo shows a bar or restaurant drink menu. List every alcoholic drink on it that has a price.
Reply with only a JSON array, one object per drink:
{"name": string, "cat": one of ${Object.keys(CATS).map(k=>`"${k}"`).join(",")}, "price": number, "oz": number, "abv": number, "guess": boolean, "classic": string or null, "deal": null or {"type": "pct" | "off" | "price", "value": number, "label": string, "ends": "HH:MM" or null}}
- cat: light = light beer (Bud Light, Michelob Ultra); lager = lager, pilsner, Mexican lager, bock; wheat = wheat, hefeweizen, witbier; amber = amber, brown, red ale, Märzen, Oktoberfest, other malty ales; craft = IPA or pale ale; hazy = hazy, juicy, double or imperial IPA; stout = stout or porter; sour = sour, gose, Berliner weisse, fruited beer; belgian = Belgian ales, tripel, dubbel, quad, saison, barleywine, strong ale; whiskey = whiskey or any spirit served neat or on the rocks; stirred = spirit-forward cocktail (Old Fashioned, Manhattan, Negroni, martini); citrus = citrus, sweet, frozen, tiki or creamy cocktail; highball = liquor plus a mixer (G&T, mule, vodka soda, ranch water); wine = wine or sparkling by the glass; seltzer = hard seltzer or cider; shot = shots.
- oz and abv: for beer, wine, cider and seltzer use the full serving. For cocktails and spirits use only the liquor: total ounces of liquor and its average ABV (for example 2 oz at 42).
- guess: false only if the menu itself states the size or ABV; otherwise use typical values and set true.
- classic: if the drink is clearly one of these classics (even with a house twist), give its exact name from this list, otherwise null: ${LIB.map(c=>c.name).join("; ")}.
- deal: menus often state discounts away from the prices, in a section header, footer, banner or note (for example "50% off all drafts", "$2 off wells", "$5 house wines 4-7pm"). Apply each such discount to every drink it covers and keep "price" as the printed price. type pct = percent off, off = dollars off, price = fixed deal price. label = a short phrase from the menu, like "50% off drafts". ends = the end time in 24-hour HH:MM if the menu states one, otherwise null. Use only deals printed on the menu. If it is unclear which drinks a deal covers, apply it only to drinks in the same section. Use null when no deal applies.
- If a drink lists several prices (glass/bottle, single/double), use the glass or single.
- Skip non-alcoholic drinks and anything without a price. If no drinks are readable, reply with [].`;
}
async function toJpegBase64(file){
  try{
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600/Math.max(bmp.width, bmp.height));
    const cv = document.createElement("canvas");
    cv.width = Math.round(bmp.width*scale); cv.height = Math.round(bmp.height*scale);
    cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
    const blob = await new Promise(r=>cv.toBlob(r, "image/jpeg", .85));
    return {type:"image/jpeg", data: await blobB64(blob)};
  }catch{
    if(!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error("That photo format can't be read. Try a JPEG or PNG.");
    return {type:file.type, data: await blobB64(file)};
  }
}
function endsToMs(s){
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s||"").trim()); if(!m) return null;
  const t = new Date(); t.setHours(+m[1], +m[2], 0, 0);
  if(t.getTime() < Date.now() - 12*36e5) t.setDate(t.getDate()+1);
  return t.getTime();
}
const blobB64 = b => new Promise((res,rej)=>{ const fr = new FileReader(); fr.onload = ()=>res(String(fr.result).split(",")[1]); fr.onerror = rej; fr.readAsDataURL(b) });
let scanAbort = null;
function setScanBusy(on, msg){
  document.querySelector(".scan").classList.toggle("busy", on);
  $("scanCtl").hidden = !on; if(msg!=null) $("scanStatus").textContent = msg;
}
async function scanMenu(file){
  const key = apiKey(); if(!key) return;
  scanAbort = new AbortController();
  setScanBusy(true, "Reading the menu… this takes about 10–30 seconds.");
  try{
    const img = await toJpegBase64(file);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST", signal:scanAbort.signal,
      headers:{"content-type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
      body: JSON.stringify({model:SCAN_MODEL, max_tokens:6000, messages:[{role:"user", content:[
        {type:"image", source:{type:"base64", media_type:img.type, data:img.data}},
        {type:"text", text:scanPrompt()}]}]})
    });
    const body = await res.json().catch(()=>null);
    if(!res.ok){
      const m = res.status===401 ? "Anthropic didn't accept that API key. Check it under Me."
        : res.status===429 ? "Anthropic says you're scanning too fast. Wait a minute and try again."
        : res.status===400 && /credit/i.test(body?.error?.message||"") ? "Your Anthropic account is out of credit. Add some at console.anthropic.com."
        : "Anthropic couldn't read the menu right now. Try again.";
      throw new Error(m);
    }
    const text = (body?.content||[]).filter(c=>c.type==="text").map(c=>c.text).join("");
    const a = text.indexOf("["), z = text.lastIndexOf("]");
    let items = []; try{ items = JSON.parse(text.slice(a, z+1)) }catch{ throw new Error("Couldn't make sense of that menu. Try a closer, well-lit photo.") }
    const clean = (Array.isArray(items)?items:[]).map(x=>{
      const cat = CATS[x.cat] ? x.cat : "citrus";
      const lib = x.classic ? LIB.find(c=>keyOf(c.name)===keyOf(x.classic)) : null;
      const d = {name:String(x.name||"").slice(0,80), cat, price:+x.price, mode:"simple", parts:[], oz:+x.oz, abv:+x.abv, enj:null, rare:false, guess:!!x.guess};
      const dl = x.deal;
      if(dl && ["pct","off","price"].includes(dl.type) && +dl.value>0) d.deal = {type:dl.type, value:+dl.value, label:String(dl.label||"").slice(0,40), until:endsToMs(dl.ends)};
      if(lib && x.guess){ d.mode = "parts"; d.parts = lib.parts.map(p=>[...p]); d.cat = lib.cat }
      return d;
    }).filter(d=>d.name && d.price>0 && (d.mode==="parts" || (d.oz>0 && d.abv>0 && d.abv<100)));
    S.menu = clean; save(); renderMenu();
    setScanBusy(false, clean.length ? `Found ${clean.length} drinks${clean.some(d=>d.deal)?`, ${clean.filter(d=>d.deal).length} with a deal applied`:""}, ranked best score first. Tap one to score it.` : "Couldn't find priced drinks in that photo. Try a closer, well-lit shot.");
  }catch(e){
    setScanBusy(false, e.name==="AbortError" ? "Stopped." : (e.message || "Something went wrong reading the menu."));
  }finally{ scanAbort = null }
}
["menuPhoto","menuPick"].forEach(id=>$(id).addEventListener("change", e=>{ const f = e.target.files?.[0]; e.target.value = ""; if(f) scanMenu(f) }));
$("scanStop").onclick = ()=> scanAbort?.abort();

