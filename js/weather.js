// Погода: Open-Meteo (безкоштовно, без ключа, CORS відкритий).
// Прогноз до 16 днів наперед — тижні плану в межах горизонту
// отримують почасові чипи, решта підтягнеться ближче до дат.

import { getLocation, setLocation, getWxCache, setWxCache } from './store.js';
import { parseISO, fmtDow, fmtDay } from './plan.js';

const DEFAULT_LOC = { name: 'Київ', lat: 50.4501, lon: 30.5234 };
const TTL = 30 * 60 * 1000;

// ── іконки (мінімальні лінійні, у стилі референсів) ─────────

const I = {
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7"/>',
  partly: '<circle cx="8.5" cy="9" r="3.4"/><path d="M8.5 2.8v1.8M2.3 9h1.8M4.1 4.6l1.3 1.3M13 4.6l-1.3 1.3" /><path d="M9.5 19h8.2a3.3 3.3 0 0 0 .6-6.5A4.6 4.6 0 0 0 9.6 11a3.9 3.9 0 0 0-.1 8z" fill="var(--card, #fff)"/>',
  cloud: '<path d="M7 18.5h9.5a3.6 3.6 0 0 0 .7-7.1A5 5 0 0 0 7.4 9.6 4.4 4.4 0 0 0 7 18.5z"/>',
  fog: '<path d="M7 13.5h9.5a3.6 3.6 0 0 0 .7-7.1A5 5 0 0 0 7.4 4.6 4.4 4.4 0 0 0 7 13.5z"/><path d="M5.5 17h13M7.5 20.2h9"/>',
  drizzle: '<path d="M7 15.5h9.5a3.6 3.6 0 0 0 .7-7.1A5 5 0 0 0 7.4 6.6 4.4 4.4 0 0 0 7 15.5z"/><path d="M9 19v.2M12.5 19v.2M16 19v.2M10.8 21.5v.2M14.3 21.5v.2"/>',
  rain: '<path d="M7 14.5h9.5a3.6 3.6 0 0 0 .7-7.1A5 5 0 0 0 7.4 5.6 4.4 4.4 0 0 0 7 14.5z"/><path d="M9.5 17.5l-1 3M13.5 17.5l-1 3M17.5 17.5l-1 3"/>',
  storm: '<path d="M7 13.5h9.5a3.6 3.6 0 0 0 .7-7.1A5 5 0 0 0 7.4 4.6 4.4 4.4 0 0 0 7 13.5z"/><path d="M12.8 15.5l-2.3 3.6h3l-2.3 3.6"/>',
  snow: '<path d="M7 14.5h9.5a3.6 3.6 0 0 0 .7-7.1A5 5 0 0 0 7.4 5.6 4.4 4.4 0 0 0 7 14.5z"/><path d="M9 18.2v.2M12.5 20v.2M16 18.2v.2M9 21.4v.2M16 21.4v.2"/>',
};

export function iconSVG(name, size = 24) {
  return `<svg class="wx-ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[name] || I.cloud}</svg>`;
}

// WMO weather_code → іконка + підпис
const WMO = [
  [[0], 'sun', 'ясно'],
  [[1], 'sun', 'переважно ясно'],
  [[2], 'partly', 'мінлива хмарність'],
  [[3], 'cloud', 'хмарно'],
  [[45, 48], 'fog', 'туман'],
  [[51, 53, 55, 56, 57], 'drizzle', 'мряка'],
  [[61, 63, 80], 'rain', 'дощ'],
  [[65, 81, 82], 'rain', 'злива'],
  [[66, 67], 'rain', 'крижаний дощ'],
  [[71, 73, 75, 77, 85, 86], 'snow', 'сніг'],
  [[95, 96, 99], 'storm', 'гроза'],
];

export function wmo(code) {
  for (const [codes, icon, text] of WMO) {
    if (codes.includes(code)) return { icon, text };
  }
  return { icon: 'cloud', text: 'хмарно' };
}

// Наскільки день годиться під виїзд: top / ok / poor
export function rideScore(d) {
  if (d.pp <= 25 && d.wind <= 24 && d.tmax >= 10 && d.tmax <= 29) return 'top';
  if (d.pp <= 55 && d.wind <= 35 && d.tmax >= 4 && d.tmax <= 33) return 'ok';
  return 'poor';
}
const SCORE_TEXT = { top: 'топ для виїзду', ok: 'норм', poor: 'так собі' };

// ── API ─────────────────────────────────────────────────────

async function getJSON(url, timeout = 10000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

export async function fetchForecast(loc) {
  const key = `${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}`;
  const cached = getWxCache(key, TTL);
  if (cached) return cached;

  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${loc.lat}&longitude=${loc.lon}`
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max'
    + '&timezone=auto&forecast_days=16';
  const raw = await getJSON(url);

  const d = raw.daily;
  const days = d.time.map((iso, i) => ({
    iso,
    code: d.weather_code[i],
    tmax: Math.round(d.temperature_2m_max[i]),
    tmin: Math.round(d.temperature_2m_min[i]),
    pp: d.precipitation_probability_max?.[i] ?? 0,
    rain: d.precipitation_sum?.[i] ?? 0,
    wind: Math.round(d.wind_speed_10m_max[i]),
    gusts: Math.round(d.wind_gusts_10m_max?.[i] ?? 0),
  }));
  setWxCache(key, days);
  return days;
}

export async function searchCity(q) {
  const url = 'https://geocoding-api.open-meteo.com/v1/search'
    + `?name=${encodeURIComponent(q)}&count=5&language=uk&format=json`;
  const raw = await getJSON(url);
  return (raw.results || []).map(r => ({
    name: r.name,
    area: [r.admin1, r.country].filter(Boolean).join(', '),
    lat: r.latitude,
    lon: r.longitude,
  }));
}

// ── рендер ──────────────────────────────────────────────────

const $ = (sel, root = document) => root.querySelector(sel);

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text; // текст завжди через textContent
  return n;
}

function dayChip(d, { compact = false } = {}) {
  const date = parseISO(d.iso);
  const { icon, text } = wmo(d.code);
  const score = rideScore(d);

  const chip = el('div', `wx-day s-${score}${compact ? ' compact' : ''}`);
  chip.title = `${text} · опади ${d.pp}% · вітер до ${d.wind} км/г${d.gusts ? ` (пориви ${d.gusts})` : ''} · ${SCORE_TEXT[score]}`;

  const dow = el('div', 'wx-dow', fmtDow(date));
  const dnum = el('div', 'wx-date', fmtDay(date).slice(0, 5));
  const ic = el('div', 'wx-icwrap');
  ic.innerHTML = iconSVG(icon, compact ? 20 : 26);
  const t = el('div', 'wx-t', `${d.tmax}°`);
  const tmin = el('div', 'wx-tmin', `${d.tmin}°`);

  chip.append(dow, dnum, ic, t, tmin);

  if (!compact) {
    const meta = el('div', 'wx-meta');
    const rain = el('span', 'wx-m', `${d.pp}%`);
    rain.title = 'ймовірність опадів';
    const wind = el('span', 'wx-m', `${d.wind} км/г`);
    wind.title = 'вітер';
    meta.append(rain, wind);
    chip.append(meta);
    const dot = el('div', `wx-dot d-${score}`);
    dot.setAttribute('aria-label', SCORE_TEXT[score]);
    chip.append(dot);
  }
  return chip;
}

function renderStrip(days, weeks) {
  const strip = $('#wx-strip');
  strip.textContent = '';
  const horizon = days.slice(0, 10);
  for (const d of horizon) strip.append(dayChip(d));

  // чипи погоди в картках тижнів, що потрапляють у горизонт
  const byIso = new Map(days.map(d => [d.iso, d]));
  for (const w of weeks) {
    const mount = document.querySelector(`[data-wx-week="${w.n}"]`);
    if (!mount) continue;
    mount.textContent = '';
    let hit = 0;
    for (let d = parseISO(w.start), i = 0; i < 7; i++, d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const day = byIso.get(iso);
      if (day) { mount.append(dayChip(day, { compact: true })); hit++; }
    }
    mount.closest('.wk-wx')?.classList.toggle('empty', hit === 0);
  }
}

function setStatus(text, busy = false) {
  const s = $('#wx-status');
  if (!s) return;
  s.textContent = text || '';
  s.classList.toggle('busy', busy);
}

async function refresh(weeks) {
  const loc = getLocation() || DEFAULT_LOC;
  $('#wx-city').textContent = loc.name;
  setStatus('оновлюю…', true);
  $('#wx-strip').classList.add('loading');
  try {
    const days = await fetchForecast(loc);
    renderStrip(days, weeks);
    const best = days.slice(0, 10).filter(d => rideScore(d) === 'top').length;
    setStatus(best ? `${best} топ-дн${best === 1 ? 'ень' : best < 5 ? 'і' : 'ів'} у найближчі 10` : 'прогноз на 16 днів');
  } catch {
    setStatus('прогноз недоступний — перевір інтернет і спробуй ще раз');
  } finally {
    $('#wx-strip').classList.remove('loading');
  }
}

function initSearch(weeks) {
  const form = $('#wx-form');
  const input = $('#wx-input');
  const results = $('#wx-results');
  const popover = $('#wx-pop');

  const close = () => { popover.hidden = true; results.textContent = ''; input.value = ''; };

  $('#wx-city-btn').addEventListener('click', () => {
    popover.hidden = !popover.hidden;
    if (!popover.hidden) input.focus();
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const q = input.value.trim();
    if (q.length < 2) return;
    results.textContent = 'шукаю…';
    try {
      const found = await searchCity(q);
      results.textContent = '';
      if (!found.length) { results.textContent = 'нічого не знайшов'; return; }
      for (const f of found) {
        const b = el('button', 'wx-res');
        b.type = 'button';
        b.append(el('span', 'wx-res-name', f.name), el('span', 'wx-res-area', f.area));
        b.addEventListener('click', () => {
          setLocation({ name: f.name, lat: f.lat, lon: f.lon });
          close();
          refresh(weeks);
        });
        results.append(b);
      }
    } catch {
      results.textContent = 'пошук не вдався — спробуй ще раз';
    }
  });

  $('#wx-geo').addEventListener('click', () => {
    if (!navigator.geolocation) return;
    setStatus('визначаю локацію…', true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocation({ name: 'моя точка', lat: +pos.coords.latitude.toFixed(4), lon: +pos.coords.longitude.toFixed(4) });
        close();
        refresh(weeks);
      },
      () => setStatus('геолокація не спрацювала — обери місто вручну'),
      { timeout: 8000 },
    );
  });

  document.addEventListener('click', e => {
    if (!popover.hidden && !popover.contains(e.target) && e.target.id !== 'wx-city-btn') close();
  });
}

export function initWeather(weeks) {
  initSearch(weeks);
  $('#wx-retry').addEventListener('click', () => refresh(weeks));
  refresh(weeks);
}
