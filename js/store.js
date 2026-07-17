// Локальний стан у localStorage: локація погоди, виконані виїзди, чекліст.
// Етап 2 (Strava через MCP) підключається саме тут: setDone/isDone
// почнуть живитись реальними активностями замість ручних галочок.

const KEY = 'w200k.v1';

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function save(patch) {
  const cur = load();
  const next = { ...cur, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* приватний режим — живемо без збереження */ }
  return next;
}

// ── локація для погоди ──────────────────────────────────────

export function getLocation() {
  return load().location || null;
}

export function setLocation(loc) {
  save({ location: loc }); // {name, lat, lon}
}

// ── журнал виїздів (ручний, до Strava) ──────────────────────

export function isDone(rideId) {
  return Boolean(load().done?.[rideId]);
}

export function setDone(rideId, val) {
  const done = { ...(load().done || {}) };
  if (val) done[rideId] = true;
  else delete done[rideId];
  save({ done });
}

export function doneKm(weeks) {
  const done = load().done || {};
  let km = 0;
  for (const w of weeks) {
    if (done[`${w.n}:long`]) km += w.long?.km || 0;
    if (done[`${w.n}:mid`]) km += w.mid?.km || 0;
    if (done[`${w.n}:short`]) km += w.short?.km || 0;
  }
  return km;
}

// ── чекліст спорядження ─────────────────────────────────────

export function isChecked(id) {
  return Boolean(load().checks?.[id]);
}

export function setChecked(id, val) {
  const checks = { ...(load().checks || {}) };
  if (val) checks[id] = true;
  else delete checks[id];
  save({ checks });
}

// ── кеш погоди ──────────────────────────────────────────────

export function getWxCache(key, ttlMs) {
  const c = load().wx?.[key];
  if (c && Date.now() - c.t < ttlMs) return c.data;
  return null;
}

export function setWxCache(key, data) {
  save({ wx: { [key]: { t: Date.now(), data } } }); // тримаємо лише останню локацію
}
