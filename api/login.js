import { json, readBody, normName, validPin, pinMatches, makeToken, readJSON, writeJSON, accountPath, dataPath } from './_lib.js';

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

export async function POST(request) {
  const body = await readBody(request);
  const n = normName(body?.name);
  if (!n || !validPin(body?.pin)) return json({ error: 'Enter your name and 4-digit PIN.' }, 400);

  const acct = await readJSON(accountPath(n.key));
  if (!acct) return json({ error: "No one by that name yet. Tap \"New here?\" to create it." }, 404);

  const now = Date.now();
  if (acct.lockedUntil > now) {
    const mins = Math.ceil((acct.lockedUntil - now) / 60000);
    return json({ error: `Too many wrong PINs. Try again in ${mins} minute${mins === 1 ? '' : 's'}.` }, 429);
  }
  if (!pinMatches(body.pin, acct.salt, acct.hash)) {
    acct.fails = (acct.fails || 0) + 1;
    if (acct.fails >= MAX_FAILS) { acct.lockedUntil = now + LOCK_MS; acct.fails = 0; }
    await writeJSON(accountPath(n.key), acct);
    const left = MAX_FAILS - acct.fails;
    return json({ error: acct.lockedUntil > now ? 'Too many wrong PINs. Locked for 15 minutes.' : `Wrong PIN. ${left} tr${left === 1 ? 'y' : 'ies'} left before a 15-minute lock.` }, 401);
  }
  if (acct.fails) { acct.fails = 0; await writeJSON(accountPath(n.key), acct); }
  const data = await readJSON(dataPath(n.key));
  return json({ token: makeToken(n.key), name: acct.display, data });
}
