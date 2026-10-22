// Dial faces drawn with Canvas 2D. The layout follows the published
// descriptions (zodiac and Egyptian calendar on the front; five-turn Metonic,
// four-turn Saros spirals and subsidiary dials on the back), but every line
// and letter is generated here: no photographs, CT images or copied drawings.
// Glyph positions on the Saros dial come from the Eclipse Year Model.

import { CASE, DIAL_CENTRES, FRONT_RADII, BACK_RADII } from '../model/layout.ts';
import { ZODIAC_GREEK, EGYPTIAN_MONTHS_GREEK } from '../model/calendar.ts';
import { GLYPHS } from '../model/eclipses.ts';

const PX_PER_MM = 8;
const SERIF = 'Georgia, "Times New Roman", serif';

const INK = 'rgba(22, 15, 8, 0.92)';
const INK_SOFT = 'rgba(22, 15, 8, 0.4)';
const FACE = '#7d6c4d';

const canvas = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

// Patinated bronze: a base colour with low-frequency mottling.
const bronze = (ctx: CanvasRenderingContext2D, w: number, h: number, base: string, seed = 1) => {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 220; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = (0.03 + rand() * 0.12) * Math.max(w, h);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const tint = rand() < 0.5 ? '90, 110, 70' : '120, 85, 45';
    g.addColorStop(0, `rgba(${tint}, ${0.05 + rand() * 0.06})`);
    g.addColorStop(1, `rgba(${tint}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
};

// World (mm) to canvas pixels for a plate seen from the front, or from the back
// (mirrored left to right).
const frontMap = (x: number, y: number): [number, number] => [(x - CASE.left) * PX_PER_MM, (CASE.top - y) * PX_PER_MM];
const backMap = (x: number, y: number): [number, number] => [(CASE.right - x) * PX_PER_MM, (CASE.top - y) * PX_PER_MM];

// Angle convention on canvas: 0 at 12 o'clock, increasing clockwise as drawn.
const at = (cx: number, cy: number, r: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
};

const radialText = (ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, r: number, deg: number, size: number) => {
  ctx.save();
  ctx.translate(...at(cx, cy, r, deg));
  ctx.rotate((deg * Math.PI) / 180);
  ctx.font = `${size}px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0);
  ctx.restore();
};

export const frontPlate = () => {
  const w = (CASE.right - CASE.left) * PX_PER_MM;
  const h = (CASE.top - CASE.bottom) * PX_PER_MM;
  const c = canvas(w, h);
  const ctx = c.getContext('2d')!;
  bronze(ctx, w, h, '#3e3426', 3);
  const [cx, cy] = frontMap(DIAL_CENTRES.front.x, DIAL_CENTRES.front.y);
  const k = PX_PER_MM;
  const { zodiacInner: zi, zodiacOuter: zo } = FRONT_RADII;
  // Recess for the dial
  ctx.fillStyle = 'rgba(25, 18, 10, 0.35)';
  ctx.beginPath();
  ctx.arc(cx, cy, (FRONT_RADII.calendarOuter + 1.5) * k, 0, Math.PI * 2);
  ctx.fill();
  // Zodiac ring
  ctx.fillStyle = FACE;
  ctx.beginPath();
  ctx.arc(cx, cy, zo * k, 0, Math.PI * 2);
  ctx.arc(cx, cy, zi * k, 0, Math.PI * 2, true);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = 2;
  for (const r of [zi, zo, zi + 3.2]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * k, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let d = 0; d < 360; d++) {
    const len = d % 30 === 0 ? 3.2 : d % 5 === 0 ? 1.8 : 1.0;
    ctx.lineWidth = d % 30 === 0 ? 2.5 : 1.2;
    ctx.beginPath();
    ctx.moveTo(...at(cx, cy, zi * k, d));
    ctx.lineTo(...at(cx, cy, (zi + (d % 30 === 0 ? 10 : len)) * k, d));
    ctx.stroke();
  }
  ZODIAC_GREEK.forEach((name, i) => radialText(ctx, name, cx, cy, (zi + 6.6) * k, i * 30 + 15, 3.1 * k));
  // Parapegma panels: ruled lines only (the inscriptions are not reproduced).
  ctx.strokeStyle = INK_SOFT;
  ctx.lineWidth = 1.5;
  for (const [y0, y1] of [
    [CASE.top - 8, FRONT_RADII.calendarOuter + 10],
    [-FRONT_RADII.calendarOuter - 10, CASE.bottom + 8],
  ]) {
    const [x0p, y0p] = frontMap(CASE.left + 12, y0);
    const [x1p, y1p] = frontMap(CASE.right - 12, y1);
    ctx.strokeRect(x0p, y0p, x1p - x0p, y1p - y0p);
    for (let y = y0p + 4 * k; y < y1p - 2 * k; y += 4.2 * k) {
      ctx.beginPath();
      ctx.moveTo(x0p + 3 * k, y);
      ctx.lineTo(x1p - 3 * k, y);
      ctx.stroke();
    }
  }
  return c;
};

// The movable Egyptian calendar ring: 12 months of 30 days and 5 epagomenal
// days, 365 divisions. Drawn on a square texture mapped onto the ring.
export const calendarRing = () => {
  const R = FRONT_RADII.calendarOuter;
  const size = 2048;
  const c = canvas(size, size);
  const ctx = c.getContext('2d')!;
  const k = size / (2 * R);
  const cx = size / 2;
  const cy = size / 2;
  bronze(ctx, size, size, '#73634a', 9);
  const ri = FRONT_RADII.calendarInner;
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = 2;
  for (const r of [ri + 0.6, R - 0.6, ri + 3.4]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * k, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let d = 0; d < 365; d++) {
    const deg = (d / 365) * 360;
    const monthStart = d % 30 === 0 || d === 365;
    ctx.lineWidth = monthStart ? 2.6 : 1.1;
    ctx.beginPath();
    ctx.moveTo(...at(cx, cy, (ri + 0.6) * k, deg));
    ctx.lineTo(...at(cx, cy, (ri + (monthStart ? 9 : 2.6)) * k, deg));
    ctx.stroke();
  }
  EGYPTIAN_MONTHS_GREEK.forEach((name, i) => {
    const mid = i < 12 ? i * 30 + 15 : 360 + 2.5;
    radialText(ctx, name, cx, cy, (ri + 6.4) * k, (mid / 365) * 360, (i < 12 ? 2.7 : 2.1) * k);
  });
  return c;
};

const spiral = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  cells: number,
  turns: number,
  r0: number,
  r1: number,
  k: number,
  label: (cell: number, deg: number, r: number) => void,
) => {
  const perTurn = cells / turns;
  const pitch = (r1 - r0) / turns;
  const radius = (cell: number) => r0 + (cell / perTurn) * pitch; // centre line of the groove
  // Lighter dial face under the spiral.
  ctx.fillStyle = FACE;
  ctx.beginPath();
  ctx.arc(cx, cy, (r1 + pitch * 0.6) * k, 0, Math.PI * 2);
  ctx.arc(cx, cy, (r0 - pitch * 0.6) * k, 0, Math.PI * 2, true);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = INK;
  // Spiral boundaries, half a pitch either side of the centre line.
  for (const off of [-0.5, 0.5]) {
    ctx.beginPath();
    for (let s = 0; s <= cells * 8; s++) {
      const cell = s / 8;
      const p = at(cx, cy, (radius(cell) + off * pitch) * k, (cell / perTurn) * 360);
      if (s === 0) ctx.moveTo(...p);
      else ctx.lineTo(...p);
    }
    ctx.stroke();
  }
  ctx.lineWidth = 1.2;
  for (let cell = 0; cell <= cells; cell++) {
    const deg = (cell / perTurn) * 360;
    const r = radius(cell);
    ctx.beginPath();
    ctx.moveTo(...at(cx, cy, (r - pitch * 0.5) * k, deg));
    ctx.lineTo(...at(cx, cy, (r + pitch * 0.5) * k, deg));
    ctx.stroke();
    if (cell < cells) label(cell, ((cell + 0.5) / perTurn) * 360, radius(cell + 0.5));
  }
};

const subsidiary = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, k: number, labels: string[]) => {
  ctx.fillStyle = FACE;
  ctx.beginPath();
  ctx.arc(cx, cy, r * k, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r * k, 0, Math.PI * 2);
  ctx.stroke();
  labels.forEach((text, i) => {
    const deg = (i / labels.length) * 360;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(...at(cx, cy, r * k, deg));
    ctx.stroke();
    const lines = text.split('\n');
    lines.forEach((line, j) => radialText(ctx, line, cx, cy, (r * 0.62 - j * 2.4) * k, deg + 180 / labels.length, 1.9 * k));
  });
};

export const backPlate = () => {
  const w = (CASE.right - CASE.left) * PX_PER_MM;
  const h = (CASE.top - CASE.bottom) * PX_PER_MM;
  const c = canvas(w, h);
  const ctx = c.getContext('2d')!;
  const k = PX_PER_MM;
  bronze(ctx, w, h, '#3b3124', 5);
  ctx.fillStyle = INK;
  // Metonic: 235 months in five turns (47 per turn).
  const met = BACK_RADII.metonic;
  const [mx, my] = backMap(DIAL_CENTRES.metonic.x, DIAL_CENTRES.metonic.y);
  spiral(ctx, mx, my, 235, met.turns, met.inner, met.outer, k, (cell, deg, r) => {
    if (cell % 12 === 0 || cell === 234) radialText(ctx, String(cell + 1), mx, my, r * k, deg, 1.7 * k);
  });
  // Saros: 223 months in four turns, glyphs from the Eclipse Year Model.
  const sar = BACK_RADII.saros;
  const [sx, sy] = backMap(DIAL_CENTRES.saros.x, DIAL_CENTRES.saros.y);
  const glyphs = new Map(GLYPHS.map((g) => [g.month, g]));
  spiral(ctx, sx, sy, 223, sar.turns, sar.inner, sar.outer, k, (cell, deg, r) => {
    const g = glyphs.get(cell + 1);
    if (g) {
      const t = (g.lunar ? 'Σ' : '') + (g.solar ? 'Η' : '');
      ctx.fillStyle = g.solar ? '#3a1c08' : INK;
      radialText(ctx, t, sx, sy, r * k, deg, (t.length > 1 ? 2.2 : 2.6) * k);
      ctx.fillStyle = INK;
    }
  });
  const sub = BACK_RADII.subsidiary;
  const [ox, oy] = backMap(DIAL_CENTRES.olympiad.x, DIAL_CENTRES.olympiad.y);
  // Games of the four-year cycle (Freeth et al. 2008).
  subsidiary(ctx, ox, oy, sub, k, ['ΙΣΘΜΙΑ\nΟΛΥΜΠΙΑ', 'ΝΕΜΕΑ\nΝΑΑ', 'ΙΣΘΜΙΑ\nΠΥΘΙΑ', 'ΝΕΜΕΑ\nΑΛΙΕΙΑ']);
  const [qx, qy] = backMap(DIAL_CENTRES.callippic.x, DIAL_CENTRES.callippic.y);
  subsidiary(ctx, qx, qy, sub, k, ['Α', 'Β', 'Γ', 'Δ']);
  const [ix, iy] = backMap(DIAL_CENTRES.exeligmos.x, DIAL_CENTRES.exeligmos.y);
  subsidiary(ctx, ix, iy, sub, k, ['', 'Η', 'ΙϚ']);
  return c;
};

// Half silver, half black: the moon-phase ball.
export const phaseBall = () => {
  const c = canvas(256, 128);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#d9d6cf';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#101010';
  ctx.fillRect(128, 0, 128, 128);
  return c;
};
