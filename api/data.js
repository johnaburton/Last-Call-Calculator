import { json, readBody, userFromRequest, readJSON, writeJSON, dataPath, MAX_DOC_BYTES } from './_lib.js';

export async function GET(request) {
  const key = userFromRequest(request);
  if (!key) return json({ error: 'Please sign in again.' }, 401);
  return json({ data: await readJSON(dataPath(key)) });
}

export async function PUT(request) {
  const key = userFromRequest(request);
  if (!key) return json({ error: 'Please sign in again.' }, 401);
  const body = await readBody(request);
  if (!body || typeof body.data !== 'object' || body.data === null) return json({ error: 'Nothing to save.' }, 400);
  const doc = { ...body.data, savedAt: Date.now() };
  if (JSON.stringify(doc).length > MAX_DOC_BYTES) return json({ error: 'Your data is too large to save. Clear some old history.' }, 413);
  await writeJSON(dataPath(key), doc);
  return json({ ok: true, savedAt: doc.savedAt });
}
