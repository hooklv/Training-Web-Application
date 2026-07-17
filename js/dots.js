// Крапкові цифри в стилі LED-матриці (5×7), як на референсах.
// Рендеримо як SVG з кружечків, колір — currentColor.

const FONT = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['01110', '10001', '00001', '00110', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

const ROWS = 7, COLS = 5;

export function dotsSVG(value, { dot = 5, gap = 3, off = true, pop = false } = {}) {
  const str = String(value);
  const cell = dot + gap;
  const digitW = COLS * cell - gap;
  const space = Math.round(cell * 1.1);
  const width = str.length * digitW + (str.length - 1) * space;
  const height = ROWS * cell - gap;
  const r = dot / 2;

  let circles = '';
  let x0 = 0;
  for (let i = 0; i < str.length; i++) {
    const glyph = FONT[str[i]] || FONT[' '];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const on = glyph[row][col] === '1';
        if (!on && !off) continue;
        const cx = x0 + col * cell + r;
        const cy = row * cell + r;
        const k = i * (COLS + 2) + col; // хвиля зліва направо
        circles += `<circle cx="${cx}" cy="${cy}" r="${r}" style="--k:${k}" class="${on ? 'on' : 'off'}"/>`;
      }
    }
    x0 += digitW + space;
  }

  return `<svg class="dots-svg${pop ? ' pop' : ''}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">${circles}</svg>`;
}

export function mountDots(el, value, opts = {}) {
  el.innerHTML = dotsSVG(value, opts);
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', String(opts.label ?? value));
}

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Плавний набір числа від 0 до цілі (для великих KPI при появі в кадрі)
export function countUp(el, target, opts = {}, dur = 900) {
  const n = Number(target);
  if (REDUCED || !Number.isFinite(n) || n <= 0) {
    mountDots(el, target, opts);
    return;
  }
  const t0 = performance.now();
  const ease = t => 1 - Math.pow(1 - t, 3);
  const tick = now => {
    const t = Math.min(1, (now - t0) / dur);
    const v = Math.round(ease(t) * n);
    // тримаємо ширину: доганяємо до розрядності цілі пробілами
    const pad = String(v).padStart(String(n).length, ' ');
    mountDots(el, pad, { ...opts, label: n });
    if (t < 1) requestAnimationFrame(tick);
    else mountDots(el, n, { ...opts, pop: false, label: n });
  };
  requestAnimationFrame(tick);
}
