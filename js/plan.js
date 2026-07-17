// ─────────────────────────────────────────────────────────────
// Дані плану. Це єдине місце, яке редагуєш руками.
// Коли з'явиться реальна дата бревету — онови TARGET_WEEK_START,
// дати 11-го тижня і (якщо треба) зсунь тапер.
// ─────────────────────────────────────────────────────────────

export const START = '2026-07-20';
export const TARGET_WEEK_START = '2026-09-28'; // початок тижня бревету
export const TARGET_LABEL = 'кінець вересня — перший тиждень жовтня';
export const HR_ZONE = '120–140';

// kind: 'build' — робочий тиждень, 'recovery' — розвантаження, 'goal' — бревет
export const WEEKS = [
  {
    n: 1, start: '2026-07-20', end: '2026-07-26', kind: 'build',
    long: { km: 65, event: 'Dirty Paws', date: '2026-07-25', note: 'сб 25.07' },
    mid: null, midNote: 'тиждень легкий перед заїздом',
    short: { km: 45, label: '2× 20–25 км', note: 'пн–пт, спокійно', rides: 2 },
    note: 'старт білду',
  },
  {
    n: 2, start: '2026-07-27', end: '2026-08-02', kind: 'build',
    long: { km: 70 },
    mid: { km: 45, note: 'рівно' },
    short: { km: 25, note: 'вільно' },
    note: 'якщо DP був важкий — зроби легшим',
  },
  {
    n: 3, start: '2026-08-03', end: '2026-08-09', kind: 'build',
    long: { km: 85 },
    mid: { km: 50 },
    short: { km: 25 },
    note: '',
  },
  {
    n: 4, start: '2026-08-10', end: '2026-08-16', kind: 'recovery',
    long: { km: 50, note: 'розвантаження' },
    mid: { km: 40, note: 'легко' },
    short: { km: 25 },
    note: 'відновлення, не лінь',
  },
  {
    n: 5, start: '2026-08-17', end: '2026-08-23', kind: 'build', milestone: '100',
    long: { km: 100 },
    mid: { km: 55 },
    short: { km: 30 },
    note: 'перша сотня — рубіж',
  },
  {
    n: 6, start: '2026-08-24', end: '2026-08-30', kind: 'build',
    long: { km: 115 },
    mid: { km: 55 },
    short: { km: 30 },
    note: '',
  },
  {
    n: 7, start: '2026-08-31', end: '2026-09-06', kind: 'build',
    long: { km: 130 },
    mid: { km: 60 },
    short: { km: 30 },
    note: '',
  },
  {
    n: 8, start: '2026-09-07', end: '2026-09-13', kind: 'recovery',
    long: { km: 70, note: 'розвантаження' },
    mid: { km: 45, note: 'легко' },
    short: { km: 25 },
    note: 'відновлення',
  },
  {
    n: 9, start: '2026-09-14', end: '2026-09-20', kind: 'build', milestone: '150',
    long: { km: 150 },
    mid: { km: 55 },
    short: { km: 30 },
    note: 'пік. Проїхав комфортно = готовий до 200',
  },
  {
    n: 10, start: '2026-09-21', end: '2026-09-27', kind: 'recovery',
    long: { km: 90 },
    mid: { km: 45 },
    short: { km: 25 },
    note: 'розвантаження перед стартом',
  },
  {
    n: 11, start: '2026-09-28', end: '2026-10-04', kind: 'goal', milestone: '200',
    long: { km: 200, label: 'Бревет' },
    mid: { km: 0, note: 'лише легкі спіни до старту' },
    short: null,
    note: 'ціль',
  },
];

// ── дати ────────────────────────────────────────────────────

export function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isoOf(date) {
  const p = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function daysBetween(a, b) {
  const MS = 24 * 3600 * 1000;
  const az = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const bz = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((bz - az) / MS);
}

const dd = d => String(d.getDate()).padStart(2, '0');
const mm = d => String(d.getMonth() + 1).padStart(2, '0');

export function fmtRange(startISO, endISO) {
  const a = parseISO(startISO), b = parseISO(endISO);
  return a.getMonth() === b.getMonth()
    ? `${dd(a)}–${dd(b)}.${mm(a)}`
    : `${dd(a)}.${mm(a)}–${dd(b)}.${mm(b)}`;
}

export function fmtDay(date) {
  return `${dd(date)}.${mm(date)}`;
}

const DOW = new Intl.DateTimeFormat('uk-UA', { weekday: 'short' });
export function fmtDow(date) {
  return DOW.format(date).replace('.', '');
}

// Сьогодні. Для перевірки станів можна відкрити сторінку з ?today=2026-08-20
export function today() {
  const q = new URLSearchParams(location.search).get('today');
  if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return parseISO(q);
  return new Date();
}

// ── зведення по плану ───────────────────────────────────────

function rideEntries(week) {
  const out = [];
  if (week.long?.km) out.push({ id: `${week.n}:long`, type: 'long', km: week.long.km });
  if (week.mid?.km) out.push({ id: `${week.n}:mid`, type: 'mid', km: week.mid.km });
  if (week.short?.km) out.push({ id: `${week.n}:short`, type: 'short', km: week.short.km });
  return out;
}

export function planStats() {
  let totalKm = 0, longKm = 0, rides = 0;
  for (const w of WEEKS) {
    for (const r of rideEntries(w)) {
      totalKm += r.km;
      rides += (r.type === 'short' && w.short.rides) ? w.short.rides : 1;
    }
    longKm += w.long?.km || 0;
  }
  return { totalKm, longKm, rides, weeks: WEEKS.length };
}

export function weekRides(week) {
  return rideEntries(week);
}

export function currentWeek(date) {
  const iso = isoOf(date);
  return WEEKS.find(w => iso >= w.start && iso <= w.end) || null;
}

export function weekStatus(week, date) {
  const iso = isoOf(date);
  if (iso < week.start) return 'future';
  if (iso > week.end) return 'past';
  return 'current';
}

// Всі дні плану — для стрічки сезону
export function seasonDays() {
  const out = [];
  const start = parseISO(WEEKS[0].start);
  const end = parseISO(WEEKS.at(-1).end);
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const w = currentWeek(d);
    out.push({
      date: new Date(d),
      iso: isoOf(d),
      week: w,
      isSat: d.getDay() === 6, // суботу вважаємо типовим днем довгого
    });
  }
  return out;
}
