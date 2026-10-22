"use strict";
/* deal pricing helpers */
function dealActive(d){ const x = d && d.deal; return !!(x && x.type && +x.value>0 && (!x.until || Date.now() < x.until)); }
function effPrice(d){
  const p = +d.price||0; if(!dealActive(d)) return p;
  const v = +d.deal.value, t = d.deal.type;
  const r = t==="pct" ? p*(1-Math.min(v,100)/100) : t==="off" ? p-v : v;
  return Math.max(0, Math.round(r*100)/100);
}
function dealText(d){
  const x = d && d.deal; if(!x || !x.type) return "";
  const v = +x.value;
  const base = x.label || (x.type==="pct" ? `${v}% off` : x.type==="off" ? `$${fmt(v)} off` : `deal price $${fmt(v)}`);
  if(!x.until) return base;
  const t = new Date(x.until).toLocaleTimeString([], {hour:"numeric", minute:"2-digit"});
  return Date.now() < x.until ? `${base}, until ${t}` : `${base}, ended ${t}`;
}

/* factor on/off: a left-out factor counts as a neutral constant so scores stay on the same scale */
const NEUTRAL = {e:7, fit:1, str:1, price:10};
const FACTOR_NAMES = {enj:"enjoyment", fit:"fit", str:"strength", price:"price"};
function exOn(k){ return !(S && S.ex && S.ex[k]); }
function combine(e, fit, str, price){
  const E = exOn("enj") ? e : NEUTRAL.e, F = exOn("fit") ? fit : NEUTRAL.fit;
  const St = exOn("str") ? str : (str===0 ? 0 : NEUTRAL.str), P = exOn("price") ? price : NEUTRAL.price;
  return P>0 ? E*F*St/P : 0;
}
document.head.insertAdjacentHTML("beforeend", "<style>.factor{cursor:pointer;user-select:none}.factor[aria-pressed=false]{opacity:.5;border-style:dashed}.factor[aria-pressed=false] b{text-decoration:line-through}</style>");
