// ─────────────────────────────────────────────────────────────
// v0 адаптивного контуру: сторінка вміє показати згенерований
// («адаптований») тиждень із week.json. Це ШАР ПОКАЗУ — тут немає
// жодних інтеграцій. Коли з'явиться щотижневий ритуал (v1, Strava),
// він писатиме week.json з реальними даними, і ця логіка не зміниться.
//
// Якщо week.json відсутній або некоректний — сторінка працює як звичайно
// (чистий статичний план). Нічого не ламається.
// ─────────────────────────────────────────────────────────────

import { WEEKS, currentWeek, today, fmtDay, parseISO } from './plan.js';

const RIDE_TEXT = { long: 'Довгий', mid: 'Середній', short: 'Короткий' };
const VERDICT = {
  'step-up': { label: 'крок угору', cls: 'v-up' },
  'hold': { label: 'тримаємо план', cls: 'v-hold' },
  'deload': { label: 'розвантаження', cls: 'v-deload' },
};
const FORM = { up: 'росте', flat: 'рівно', down: 'просіла' };
const HRV = { balanced: 'збалансований', unbalanced: 'розбалансований', low: 'низький', poor: 'низький' };

// ── завантаження ────────────────────────────────────────────

export async function loadLiveWeek() {
  try {
    const res = await fetch('week.json', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || typeof data.weekNumber !== 'number' || !Array.isArray(data.rides)) return null;
    return data;
  } catch {
    return null; // немає файлу / офлайн / битий JSON — тихо лишаємось на статиці
  }
}

// ── дрібні хелпери ──────────────────────────────────────────

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text; // завжди textContent — дані можуть бути зовнішні
  return n;
}

function fmtGenerated(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  return fmtDay(parseISO(iso));
}

function badge(data) {
  const b = el('span', `pill live-badge${data.example ? ' is-example' : ''}`);
  b.append(el('span', 'live-dot'));
  b.append(document.createTextNode(data.example ? 'приклад адаптації' : 'адаптовано'));
  const g = fmtGenerated(data.generatedAt);
  if (g) b.title = `згенеровано ${g}`;
  return b;
}

function verdictChip(data) {
  const v = VERDICT[data.verdict] || VERDICT.hold;
  return el('span', `verdict ${v.cls}`, v.label);
}

function planKmOf(planWeek, type) {
  const r = planWeek && planWeek[type];
  return r && typeof r.km === 'number' ? r.km : null;
}

function stravaLine(s) {
  const p = [];
  if (s.lastWeekKm != null) p.push(`тиждень ${s.lastWeekKm} км`);
  if (s.longRideKm != null) p.push(`довгий ${s.longRideKm} км`);
  if (s.avgHrLong != null) p.push(`сер. пульс ${s.avgHrLong}`);
  if (s.formTrend) p.push(`форма ${FORM[s.formTrend] || s.formTrend}`);
  return p.join(' · ') || '—';
}

function garminLine(g) {
  const p = [];
  if (g.trainingReadiness != null) p.push(`readiness ${g.trainingReadiness}`);
  if (g.hrvStatus) p.push(`HRV ${HRV[g.hrvStatus] || g.hrvStatus}`);
  if (g.sleepAvgH != null) p.push(`сон ${g.sleepAvgH} год`);
  if (g.bodyBatteryLow != null) p.push(`Body Battery min ${g.bodyBatteryLow}`);
  return p.join(' · ') || '—';
}

function metricRow(label, value) {
  const row = el('div', 'wk-metric');
  row.append(el('span', 'wk-metric-l', label), el('span', 'wk-metric-v', value));
  return row;
}

// ── панель тренера в картці тижня ───────────────────────────

function coachPanel(data, planWeek) {
  const panel = el('div', `wk-coach ${(VERDICT[data.verdict] || VERDICT.hold).cls}`);

  const head = el('div', 'wk-coach-head');
  head.append(verdictChip(data));
  const g = fmtGenerated(data.generatedAt);
  if (g) head.append(el('span', 'wk-coach-date', `оновлено ${g}`));
  panel.append(head);

  if (data.coachNote) panel.append(el('p', 'wk-coach-note', data.coachNote));

  // адаптовані виїзди тижня; де відрізняються від плану — показуємо «план N»
  const ul = el('ul', 'wk-coach-rides');
  for (const r of data.rides) {
    if (!r || (r.km == null && !r.label)) continue;
    const li = el('li');
    li.append(el('span', 'cr-name', RIDE_TEXT[r.type] || r.type || ''));
    li.append(el('b', 'cr-km', r.label || (r.km != null ? `${r.km} км` : '—')));
    const planKm = planKmOf(planWeek, r.type);
    if (planKm != null && r.km != null && planKm !== r.km) {
      li.append(el('span', 'cr-was', `план ${planKm}`));
    }
    if (r.note) li.append(el('span', 'cr-note', r.note));
    ul.append(li);
  }
  if (ul.children.length) panel.append(ul);

  // «чому» — на чому базувалось рішення
  const hasWhy = data.basedOn && (data.basedOn.strava || data.basedOn.garmin);
  const flags = Array.isArray(data.flags) ? data.flags : [];
  if (hasWhy || flags.length) {
    const det = el('details', 'wk-why');
    det.append(el('summary', null, 'чому такий тиждень'));
    const body = el('div', 'wk-why-body');
    if (data.basedOn?.strava) body.append(metricRow('Strava · навантаження', stravaLine(data.basedOn.strava)));
    if (data.basedOn?.garmin) body.append(metricRow('Garmin · відновлення', garminLine(data.basedOn.garmin)));
    for (const f of flags) body.append(el('p', 'wk-flag', f));
    det.append(body);
    panel.append(det);
  }

  return panel;
}

// ── застосування до DOM (після статичного рендера) ──────────

export function applyLiveWeek(data) {
  const planWeek = WEEKS.find(w => w.n === data.weekNumber) || null;

  // 1) картка відповідного тижня
  const card = document.querySelector(`.week[data-wk="${data.weekNumber}"]`);
  if (card) {
    card.classList.add('is-live');
    if (data.example) card.classList.add('is-example');
    const head = card.querySelector('.wk-head');
    if (head && !head.querySelector('.live-badge')) {
      head.append(badge(data));
      head.insertAdjacentElement('afterend', coachPanel(data, planWeek));
    }
  }

  // 2) картка «зараз» — якщо адаптований тиждень і є поточним
  const cw = currentWeek(today());
  if (cw && cw.n === data.weekNumber) {
    const inner = document.querySelector('#now .mesh-inner');
    const sub = document.querySelector('#now-sub');
    if (inner && sub && !inner.querySelector('.now-verdict')) {
      const v = VERDICT[data.verdict] || VERDICT.hold;
      const row = el('div', 'now-verdict');
      const chip = el('span', 'now-vchip');
      chip.append(el('span', `now-vdot ${v.cls}`));
      chip.append(document.createTextNode(v.label));
      row.append(chip);
      row.append(el('span', `now-ex${data.example ? '' : ' hidden'}`, 'приклад'));
      sub.insertAdjacentElement('afterend', row);
      if (data.coachNote) {
        const foot = document.querySelector('#now-done');
        foot?.insertAdjacentElement('beforebegin', el('p', 'now-coach', data.coachNote));
      }
    }
  }
}
