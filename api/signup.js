import crypto from 'node:crypto';
import { json, readBody, normName, validPin, hashPin, makeToken, readJSON, writeJSON, accountPath } from './_lib.js';

export async function POST(request) {
  const body = await readBody(request);
  const n = normName(body?.name);
  if (!n) return json({ error: 'Pick a name with 2 to 24 letters or numbers.' }, 400);
  if (!validPin(body?.pin)) return json({ error: 'Your PIN must be exactly 4 digits.' }, 400);

  if (await readJSON(accountPath(n.key))) {
    return json({ error: 'That name is taken. Sign in instead, or pick another name.' }, 409);
  }
  const salt = crypto.randomBytes(16).toString('hex');
  try {
    await writeJSON(accountPath(n.key), {
      display: n.display, salt, hash: hashPin(body.pin, salt),
      fails: 0, lockedUntil: 0, created: Date.now(),
    }, { overwrite: false });
  } catch {
    return json({ error: 'That name is taken. Sign in instead, or pick another name.' }, 409);
  }
  return json({ token: makeToken(n.key), name: n.display, data: null });
}
