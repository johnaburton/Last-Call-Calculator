import { put, get } from '@vercel/blob';
import crypto from 'node:crypto';

const SECRET = process.env.SESSION_SECRET || '';
const TOKEN_DAYS = 90;
export const MAX_DOC_BYTES = 400_000;

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function readBody(request) {
  try { return await request.json(); } catch { return null; }
}

/* ---------- names & PINs ---------- */
export function normName(name) {
  const display = String(name || '').trim().replace(/\s+/g, ' ');
  const key = display.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (display.length < 2 || display.length > 24 || key.length < 2) return null;
  return { display, key };
}
export function validPin(pin) {
  return /^\d{4}$/.test(String(pin || ''));
}
export function hashPin(pin, salt) {
  return crypto.scryptSync(String(pin), salt, 32).toString('hex');
}
export function pinMatches(pin, salt, hash) {
  const a = Buffer.from(hashPin(pin, salt), 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------- tokens ---------- */
const b64 = s => Buffer.from(s).toString('base64url');
const sig = s => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
export function makeToken(key) {
  const body = b64(JSON.stringify({ u: key, exp: Date.now() + TOKEN_DAYS * 864e5 }));
  return body + '.' + sig(body);
}
export function userFromRequest(request) {
  if (!SECRET) return null;
  const h = request.headers.get('authorization') || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  const [body, s] = tok.split('.');
  if (!body || !s) return null;
  const expect = sig(body);
  if (expect.length !== s.length || !crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(s))) return null;
  try {
    const { u, exp } = JSON.parse(Buffer.from(body, 'base64url').toString());
    return exp > Date.now() ? u : null;
  } catch { return null; }
}

/* ---------- private blob JSON ---------- */
export async function readJSON(path) {
  const res = await get(path, { access: 'private', useCache: false });
  if (!res || res.statusCode !== 200 || !res.stream) return null;
  const text = await new Response(res.stream).text();
  try { return JSON.parse(text); } catch { return null; }
}
export async function writeJSON(path, obj, { overwrite = true } = {}) {
  return put(path, JSON.stringify(obj), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: overwrite,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
  });
}
export const accountPath = key => `accounts/${key}.json`;
export const dataPath = key => `data/${key}.json`;
