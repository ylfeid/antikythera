// The Saros dial's eclipse glyphs, generated with Freeth's Eclipse Year Model
// (EYM; Freeth 2014, PLoS ONE 9, e103275).
//
// Each synodic month is divided into 38 "eclipse year units" (EYu), so 19
// eclipse years = 223 months = 446·19 EYu and every eclipse year is exactly
// 446 EYu. The model is pure integer arithmetic, which is what makes it a
// plausible ancient scheme:
//   Full Moon of month n at 38(n − 1) + 17  (mod 446)
//   New Moon  of month n at 38(n − 1) + 36  (mod 446)
//   descending node point at 66 EYu, ascending at 289 = 66 + 223
// A lunar glyph if Full Moon is within 20 EYu of a node point; a solar glyph if
// New Moon is within 20 EYu north of the node, or 7 EYu south (solar eclipses
// are seen more easily when the Moon is north of the node from Greece). Months
// begin at first crescent, 2 EYu after New Moon.

export const EYU_PER_MONTH = 38;
export const EYU_PER_ECLIPSE_YEAR = 446;
export const DNP = 66;
export const ANP = DNP + 223;
export const LUNAR_LIMIT = 20;
export const SOLAR_LIMIT_NORTH = 20;
export const SOLAR_LIMIT_SOUTH = 7;
export const FULL_MOON_EYU = 17;
export const NEW_MOON_EYU = 36;

export interface Glyph {
  month: number; // 1–223
  lunar: boolean;
  solar: boolean;
  // Signed distance from the nearest node point, positive = north of the node.
  lunarDistance?: number;
  solarDistance?: number;
  node?: 'ascending' | 'descending';
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

// Distance (EYu) from the nearest node point, positive when the Moon is north
// of the ecliptic. Before the descending node the Moon is north; after it,
// south. The reverse holds at the ascending node.
export const nodeDistance = (pos: number) => {
  let best = { d: Infinity, node: 'descending' as 'ascending' | 'descending' };
  for (const [np, node] of [
    [DNP, 'descending'],
    [ANP, 'ascending'],
  ] as const) {
    for (const k of [-1, 0, 1]) {
      const raw = pos - (np + k * EYU_PER_ECLIPSE_YEAR);
      if (Math.abs(raw) < Math.abs(best.d)) best = { d: raw, node };
    }
  }
  // raw < 0: before the node point.
  const north = best.node === 'descending' ? -best.d : best.d;
  return { distance: north, node: best.node };
};

export const fullMoonEYu = (month: number) => mod(EYU_PER_MONTH * (month - 1) + FULL_MOON_EYU, EYU_PER_ECLIPSE_YEAR);
export const newMoonEYu = (month: number) => mod(EYU_PER_MONTH * (month - 1) + NEW_MOON_EYU, EYU_PER_ECLIPSE_YEAR);

export const generateGlyphs = (): Glyph[] => {
  const glyphs: Glyph[] = [];
  let lastLunar = -10;
  for (let n = 1; n <= 223; n++) {
    const fm = nodeDistance(fullMoonEYu(n));
    const nm = nodeDistance(newMoonEYu(n));
    // Consecutive-month rule: never two lunar predictions in successive months
    // (the second is nearly always penumbral; Babylonian schemes omit them).
    const lunar = Math.abs(fm.distance) <= LUNAR_LIMIT && n - lastLunar > 1;
    if (lunar) lastLunar = n;
    const solar = nm.distance >= 0 ? nm.distance <= SOLAR_LIMIT_NORTH : -nm.distance <= SOLAR_LIMIT_SOUTH;
    if (lunar || solar) {
      glyphs.push({
        month: n,
        lunar,
        solar,
        lunarDistance: lunar ? fm.distance : undefined,
        solarDistance: solar ? nm.distance : undefined,
        node: (lunar ? fm : nm).node,
      });
    }
  }
  return glyphs;
};

export const GLYPHS = generateGlyphs();
export const GLYPH_BY_MONTH = new Map(GLYPHS.map((g) => [g.month, g]));
