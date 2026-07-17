import {
  WEEKS, START, TARGET_WEEK_START, TARGET_LABEL, HR_ZONE,
  parseISO, isoOf, fmtRange, fmtDay, fmtDow, daysBetween, today,
  planStats, currentWeek, weekStatus, seasonDays, weekRides,
} from './plan.js';
import { mountDots, countUp, dotsSVG } from './dots.js';
import { isDone, setDone, doneKm, isChecked, setChecked } from './store.js';
import { initWeather } from './weather.js';

const TODAY = today();
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const KIND_TEXT = { build: 'білд', recovery: 'відновлення', goal: 'бревет' };
const RIDE_TEXT = { long: 'Довгий', mid: 'Середній', short: 'Короткий' };

// ── шапка ───────────────────────────────────────────────────

function initHeader() {
  $('#logo-dots').innerHTML = dotsSVG('200', { dot: 3, gap: 1.6, off: false });
  $('#today-pill').textContent = `${fmtDow(TODAY)}, ${fmtDay(TODAY)}`;
}

// ── KPI (набираються при появі в кадрі) ─────────────────────

function initKpis() {
  const stats = planStats();
  const kpis = [
    ['kpi-goal', 200, 'ціль, км'],
    ['kpi-weeks', stats.weeks, 'тижнів'],
    ['kpi-rides', stats.rides, 'виїздів'],
    ['kpi-total', stats.totalKm, 'км за план'],
  ];
  for (const [id, value] of kpis) {
    const elx = $('#' + id);
    elx.dataset.target = value;
    mountDots(elx, ' '.repeat(String(value).length), { dot: 4.4, gap: 2.6, label: value });
  }
}

// ── картки «зараз» ──────────────────────────────────────────

function renderNow() {
  const cw = currentWeek(TODAY);
  const numEl = $('#now-num');
  const capEl = $('#now-cap');
  const subEl = $('#now-sub');
  const listEl = $('#now-rides');

  if (cw) {
    capEl.textContent = 'поточний тиждень';
    mountDots(numEl, cw.n, { dot: 9, gap: 5.5, pop: !REDUCED, label: `тиждень ${cw.n}` });
    subEl.textContent = `з ${WEEKS.length} · ${fmtRange(cw.start, cw.end)}`;
    listEl.textContent = '';
    for (const r of weekRides(cw)) {
      const li = document.createElement('li');
      const km = document.createElement('b');
      km.textContent = `${r.km} км`;
      li.append(`${RIDE_TEXT[r.type]} — `, km);
      listEl.append(li);
    }
    if (cw.note) {
      const li = document.createElement('li');
      li.className = 'now-note';
      li.textContent = cw.note;
      listEl.append(li);
    }
  } else if (isoOf(TODAY) < START) {
    const d = daysBetween(TODAY, parseISO(START));
    capEl.textContent = 'до старту плану';
    mountDots(numEl, d, { dot: 9, gap: 5.5, pop: !REDUCED, label: `${d} днів` });
    subEl.textContent = `дн${d === 1 ? 'ень' : d < 5 ? 'і' : 'ів'} · старт пн ${fmtDay(parseISO(START))}`;
    listEl.innerHTML = '';
    const li = document.createElement('li');
    li.textContent = 'Тиждень 1: Dirty Paws 65 км · сб 25.07';
    listEl.append(li);
  } else {
    capEl.textContent = 'план завершено';
    mountDots(numEl, 200, { dot: 9, gap: 5.5, label: '200' });
    subEl.textContent = 'сезон закритий — час планувати наступний';
  }

  const kmDone = doneKm(WEEKS);
  $('#now-done').textContent = kmDone
    ? `зроблено ${kmDone} із ${planStats().totalKm} км`
    : 'відмічай виїзди в картках тижнів — тут росте сума';

  // помаранчева картка: до бревету
  const dTarget = daysBetween(TODAY, parseISO(TARGET_WEEK_START));
  const tgt = $('#tgt-num');
  if (dTarget > 0) {
    mountDots(tgt, dTarget, { dot: 9, gap: 5.5, pop: !REDUCED, label: `${dTarget} днів` });
    $('#tgt-sub').textContent = `дн${dTarget === 1 ? 'ень' : dTarget < 5 ? 'і' : 'ів'} до тижня бревету · ${fmtRange(TARGET_WEEK_START, WEEKS.at(-1).end)}`;
  } else {
    mountDots(tgt, 200, { dot: 9, gap: 5.5, label: '200 км' });
    $('#tgt-sub').textContent = 'тиждень бревету — котись';
  }
}

// ── стрічка сезону ──────────────────────────────────────────

function renderSeason() {
  const mount = $('#season');
  const days = seasonDays();
  mount.style.setProperty('--n', days.length);
  $('#season-marks').style.setProperty('--n', days.length);
  const tIso = isoOf(TODAY);

  const frag = document.createDocumentFragment();
  days.forEach((d, i) => {
    const s = document.createElement('span');
    s.className = `sd k-${d.week.kind}${d.isSat ? ' sat' : ''}${d.iso === tIso ? ' today' : ''}`;
    s.style.setProperty('--i', i);
    s.title = `${fmtDow(d.date)} ${fmtDay(d.date)} · тиж ${d.week.n}${d.isSat ? ' · орієнтовний довгий' : ''}`;
    frag.append(s);
  });
  mount.append(frag);

  // мітки під стрічкою
  const marks = [
    ['2026-07-25', 'DP 65'],
    ['2026-08-22', '100'],
    ['2026-09-19', '150'],
    ['2026-10-03', '200'],
  ];
  const lane = $('#season-marks');
  for (const [iso, label] of marks) {
    const idx = days.findIndex(d => d.iso === iso);
    if (idx < 0) continue;
    const m = document.createElement('span');
    m.className = 'sm';
    m.style.setProperty('--at', idx);
    m.textContent = label;
    lane.append(m);
  }
}

// ── графік прогресії довгого ────────────────────────────────

const BAR = { build: '#4a9e2f', recovery: '#c6c6bc', goal: '#e0417f' };

function renderChart() {
  const host = $('#chart');
  const tip = $('#chart-tip');
  const w = host.clientWidth;
  if (!w) return;
  const h = 280;
  const pad = { l: 34, r: 10, t: 26, b: 30 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const max = 200;
  const slot = iw / WEEKS.length;
  const bw = Math.min(24, slot * 0.45);

  const y = km => pad.t + ih - (km / max) * ih;
  const labelled = new Set([65, 100, 150, 200]);

  let g = '';
  // сітка: тонкі лінії на 0/50/100/150/200
  for (let v = 0; v <= max; v += 50) {
    g += `<line x1="${pad.l}" y1="${y(v)}" x2="${w - pad.r}" y2="${y(v)}" class="grid"/>`
      + `<text x="${pad.l - 8}" y="${y(v) + 3.5}" class="tick" text-anchor="end">${v}</text>`;
  }

  WEEKS.forEach((wk, i) => {
    const km = wk.long.km;
    const cx = pad.l + slot * i + slot / 2;
    const x = cx - bw / 2;
    const yTop = y(km);
    const bh = pad.t + ih - yTop;
    const r = Math.min(4, bw / 2);
    // колонка: заокруглений верх, рівний низ
    const d = `M${x},${yTop + bh} L${x},${yTop + r} Q${x},${yTop} ${x + r},${yTop} L${x + bw - r},${yTop} Q${x + bw},${yTop} ${x + bw},${yTop + r} L${x + bw},${yTop + bh} Z`;
    const done = isDone(`${wk.n}:long`);
    g += `<path d="${d}" class="bar${done ? ' done' : ''}" fill="${BAR[wk.kind]}" tabindex="0" role="img"
      data-wk="${wk.n}" style="--d:${i * 55}ms; transform-origin: ${cx}px ${pad.t + ih}px"
      aria-label="Тиждень ${wk.n}, довгий ${km} км${wk.kind === 'recovery' ? ', розвантаження' : wk.kind === 'goal' ? ', бревет' : ''}"/>`;
    if (labelled.has(km)) {
      g += `<text x="${cx}" y="${yTop - 8}" class="bar-label" text-anchor="middle">${km}</text>`;
    }
    if (done) {
      g += `<text x="${cx}" y="${pad.t + ih - 8}" class="bar-check" text-anchor="middle">✓</text>`;
    }
    g += `<text x="${cx}" y="${h - 10}" class="tick x" text-anchor="middle">${wk.n}</text>`;
  });

  const anim = !renderChart._ran && !REDUCED;
  renderChart._ran = true;
  host.innerHTML = `<svg class="${anim ? 'anim' : ''}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Дистанція довгого виїзду по тижнях, від 65 до 200 км">${g}</svg>`;

  // тултіпи: бар — і ціль для ховера, і фокусована точка
  const show = wk => {
    const rides = weekRides(wk).map(r => `<div class="tip-row"><b>${r.km} км</b><span>${RIDE_TEXT[r.type].toLowerCase()}</span></div>`).join('');
    tip.innerHTML = `<div class="tip-head">Тиж ${wk.n} · ${fmtRange(wk.start, wk.end)}</div>${rides}`
      + (wk.note ? `<div class="tip-note"></div>` : '');
    if (wk.note) tip.querySelector('.tip-note').textContent = wk.note;
    const bar = host.querySelector(`[data-wk="${wk.n}"]`);
    tip.hidden = false;
    const br = bar.getBoundingClientRect();
    const cr = tip.offsetParent.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const left = Math.max(8, Math.min(br.left - cr.left + br.width / 2 - tw / 2, cr.width - tw - 8));
    const top = Math.max(6, br.top - cr.top - tip.offsetHeight - 10);
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  };
  const hide = () => { tip.hidden = true; };

  $$('.bar', host).forEach(bar => {
    const wk = WEEKS[+bar.dataset.wk - 1];
    bar.addEventListener('pointerenter', () => show(wk));
    bar.addEventListener('pointerleave', hide);
    bar.addEventListener('focus', () => show(wk));
    bar.addEventListener('blur', hide);
  });
}

// ── картки тижнів ───────────────────────────────────────────

function tickButton(rideId, onToggle) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tick';
  const sync = () => {
    const done = isDone(rideId);
    b.classList.toggle('on', done);
    b.setAttribute('aria-pressed', done);
    b.title = done ? 'зроблено — зняти' : 'відмітити зробленим';
  };
  b.addEventListener('click', () => {
    setDone(rideId, !isDone(rideId));
    sync();
    onToggle();
  });
  sync();
  return b;
}

function renderWeeks() {
  const grid = $('#weeks-grid');
  const onToggle = () => {
    $('#now-done').textContent = `зроблено ${doneKm(WEEKS)} із ${planStats().totalKm} км`;
    renderChart();
  };

  WEEKS.forEach((w, i) => {
    const st = weekStatus(w, TODAY);
    const card = document.createElement('article');
    card.className = `card week k-${w.kind} st-${st}`;
    card.dataset.reveal = '';
    card.style.setProperty('--i', i % 6);

    const head = document.createElement('header');
    head.className = 'wk-head';
    const num = document.createElement('span');
    num.className = 'wk-chip';
    num.textContent = `Тиж ${w.n}`;
    const dates = document.createElement('span');
    dates.className = 'wk-dates';
    dates.textContent = fmtRange(w.start, w.end);
    const kind = document.createElement('span');
    kind.className = `pill kind k-${w.kind}`;
    kind.textContent = st === 'current' ? 'зараз' : KIND_TEXT[w.kind];
    if (st === 'current') kind.classList.add('now');
    head.append(num, dates, kind);
    card.append(head);

    // довгий — головне число тижня
    const longBox = document.createElement('div');
    longBox.className = 'wk-long';
    const dotsEl = document.createElement('span');
    dotsEl.className = 'wk-long-num';
    mountDots(dotsEl, w.long.km, { dot: 4.6, gap: 2.6, off: false, label: `${w.long.km} км` });
    const unit = document.createElement('span');
    unit.className = 'wk-long-unit';
    unit.textContent = 'км · довгий';
    longBox.append(dotsEl, unit, tickButton(`${w.n}:long`, onToggle));
    card.append(longBox);

    if (w.long.event) {
      const ev = document.createElement('div');
      ev.className = 'pill lime wk-event';
      ev.textContent = `${w.long.event} · ${w.long.note}`;
      card.append(ev);
    } else if (w.long.note) {
      const ln = document.createElement('div');
      ln.className = 'wk-long-note';
      ln.textContent = w.long.note;
      card.append(ln);
    }

    // середній і короткий
    const ul = document.createElement('ul');
    ul.className = 'wk-rides';
    const row = (label, ride, id) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'wr-name';
      name.textContent = label;
      const val = document.createElement('b');
      val.className = 'wr-km';
      val.textContent = ride?.km ? `${ride.label || `${ride.km} км`}` : '—';
      const note = document.createElement('span');
      note.className = 'wr-note';
      note.textContent = ride?.note || '';
      li.append(name, val, note);
      if (ride?.km) li.append(tickButton(id, onToggle));
      return li;
    };
    if (w.mid || w.midNote) {
      const li = row('Середній', w.mid, `${w.n}:mid`);
      if (!w.mid && w.midNote) li.querySelector('.wr-note').textContent = w.midNote;
      if (w.mid && !w.mid.km && w.mid.note) { li.querySelector('.wr-km').textContent = '—'; li.querySelector('.wr-note').textContent = w.mid.note; }
      ul.append(li);
    }
    if (w.short) ul.append(row('Короткий', w.short.label ? { ...w.short, label: w.short.label } : w.short, `${w.n}:short`));
    card.append(ul);

    if (w.note) {
      const note = document.createElement('p');
      note.className = 'wk-note';
      note.textContent = w.note;
      card.append(note);
    }

    // місце під погодні чипи (заповнює weather.js, якщо тиждень у горизонті)
    const wx = document.createElement('div');
    wx.className = 'wk-wx empty';
    const wxRow = document.createElement('div');
    wxRow.className = 'wk-wx-row';
    wxRow.dataset.wxWeek = w.n;
    wx.append(wxRow);
    card.append(wx);

    grid.append(card);
  });
}

// ── чекліст бази ────────────────────────────────────────────

function initChecklist() {
  $$('[data-check]').forEach(box => {
    const id = box.dataset.check;
    const sync = () => {
      const on = isChecked(id);
      box.classList.toggle('on', on);
      box.setAttribute('aria-pressed', on);
    };
    box.addEventListener('click', () => { setChecked(id, !isChecked(id)); sync(); });
    sync();
  });
}

// ── анімації появи ──────────────────────────────────────────

function initReveal() {
  if (REDUCED) {
    $$('[data-reveal]').forEach(n => n.classList.add('in'));
    $$('[data-count]').forEach(n => mountDots(n, n.dataset.target, { dot: 4.4, gap: 2.6 }));
    return;
  }
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('in');
      if (e.target.dataset.count !== undefined) {
        countUp(e.target, e.target.dataset.target, { dot: 4.4, gap: 2.6 });
      }
      io.unobserve(e.target);
    }
  }, { threshold: 0.25 });
  $$('[data-reveal], [data-count]').forEach(n => io.observe(n));
}

// ── старт ───────────────────────────────────────────────────

initHeader();
initKpis();
renderNow();
renderSeason();
renderWeeks();
renderChart();
initChecklist();
initReveal();
initWeather(WEEKS);

let rt;
addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(renderChart, 150); });
