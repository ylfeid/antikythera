// Physical layout for the 3D model, in millimetres. x right and y up as seen
// from the front, z towards the viewer; the main plate is at z = 0.
//
// This is schematic, not a survey of the fragments: axes are placed so that
// meshing gears sit exactly one sum of pitch radii apart (measured radii for
// surviving gears, module 0.48 for reconstructed ones), then arranged to fit a
// case and to put the Metonic and Saros dials on their arbors. Front-to-back
// layers follow the spaces given by Freeth et al. 2021 (15.0 mm between b1 and
// the Strap, 9.7 mm between the Strap and the Circular Plate).

import { GEAR, GEARS, INFERIOR_FOLLOWER, SUPERIOR_PIN_SLOT, SUN_FOLLOWER, LUNAR_OFFSET_MM, LUNAR_SLOT_ANGLE, type Frame } from './gears.ts';

export interface Vec2 {
  x: number;
  y: number;
}

export interface GearPlacement {
  id: string;
  // Axis position in the frame of its carrier (relative to the carrier's axis
  // for epicyclic gears, absolute for frame 'main').
  pos: Vec2;
  z: number; // front face of the gear
  thickness: number;
  outerR: number;
  innerR: number;
  pitchR: number;
  frame: Frame;
  spokes: number;
  hub: number; // hole / hub radius
}

const MODULE_FRONT = 0.48;
const MODULE_BACK = 0.5;
const MODULE_PLATE = 0.4; // the large equal pairs on the Circular Plate

export const pitchR = (id: string) => {
  const g = GEAR.get(id)!;
  if (g.measured) return g.measured.pitchR;
  // Freeth et al. 2021 Supp. §4.2.1: modules chosen so the nodes arbor lands
  // on the 27.0 mm bearing of spoke B and the output is concentric.
  if (id === 'nodes49' || id === 'nodes62') return (g.teeth * 0.486) / 2;
  if (id === 'nodes64' || id === 'nodes48') return (g.teeth * 0.482) / 2;
  const m = ['sat86', 'sat86s', 'jup65', 'jup65s', 'mars80', 'mars80s'].includes(id)
    ? MODULE_PLATE
    : g.frame === 'b1' || ['inf51', 'cp56', 'nodes49', 'nodes48', 'b0'].includes(id)
      ? MODULE_FRONT
      : MODULE_BACK;
  return (g.teeth * m) / 2;
};

const v = (x: number, y: number): Vec2 => ({ x, y });
const add = (a: Vec2, b: Vec2) => v(a.x + b.x, a.y + b.y);
const polar = (r: number, deg: number) => v(r * Math.cos((deg * Math.PI) / 180), r * Math.sin((deg * Math.PI) / 180));
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
const sum = (a: string, b: string) => pitchR(a) + pitchR(b);

// Intersection of two circles; `side` +1/−1 picks the solution to the left or
// right of the line from c1 to c2.
const intersect = (c1: Vec2, r1: number, c2: Vec2, r2: number, side: 1 | -1): Vec2 => {
  const d = dist(c1, c2);
  if (d > r1 + r2 + 1e-9 || d < Math.abs(r1 - r2) - 1e-9) throw new Error(`layout: circles do not meet (${d.toFixed(2)} vs ${r1.toFixed(2)}, ${r2.toFixed(2)})`);
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const ux = (c2.x - c1.x) / d;
  const uy = (c2.y - c1.y) / d;
  return v(c1.x + a * ux - side * h * uy, c1.y + a * uy + side * h * ux);
};

// ── Back gearing (frame 'main') ───────────────────────────────────────────
const A: Record<string, Vec2> = {};
A.b = v(0, 0);
A.e = v(0, -sum('e1', 'b3'));
A.n = v(0, 55); // Metonic dial centre
A.g = v(0, -98); // Saros dial centre
A.d = add(A.e, polar(sum('d2', 'e2'), 160));
A.c = intersect(A.b, sum('b2', 'c1'), A.d, sum('c2', 'd1'), -1);
A.m = intersect(A.e, sum('m3', 'e3'), A.n, sum('m2', 'n1'), -1);
A.l = intersect(A.b, sum('b2', 'l1'), A.m, sum('l2', 'm1'), -1);
A.o = add(A.n, polar(sum('n2', 'o1'), 205));
A.p = add(A.n, polar(sum('n3', 'p1'), -40));
A.q = add(A.p, polar(sum('p2', 'q1'), 35));
A.f = intersect(A.e, sum('e4', 'f1'), A.g, sum('f2', 'g1'), 1);
A.h = add(A.g, polar(sum('g2', 'h1'), 25));
A.i = add(A.h, polar(sum('h2', 'i1'), 125));
// The input crown gear a1 sits at the rim of b1, its axle pointing out of the
// side of the case.
A.a = v(pitchR('b1') + 2, 0);

export const AXES = A;
export const angleOf = (p: Vec2) => (Math.atan2(p.y, p.x) * 180) / Math.PI;
export const DIAL_CENTRES = { front: A.b, metonic: A.n, saros: A.g, olympiad: A.o, callippic: A.q, exeligmos: A.i };

// Lunar anomaly gears ride on e3: k1 at the mesh distance from e5, k2 1.1 mm
// further out (Freeth et al. 2006). Positions relative to the e axis.
const K1_POS = polar(sum('e5', 'k1'), 90);
const K2_POS = add(K1_POS, polar(LUNAR_OFFSET_MM, LUNAR_SLOT_ANGLE));

// ── Front gearing on b1 and the Circular Plate (frame 'b1') ───────────────
// Spokes at 1, 4, 7 and 10 o'clock: A Mercury, B Nodes, C Venus, D mean Sun.
export const SPOKE_ANGLE = { A: 60, B: -30, C: -150, D: 150 };
const F: Record<string, Vec2> = {};
F.merc72 = polar(sum('inf51', 'merc72'), SPOKE_ANGLE.A);
F.merc20 = polar(INFERIOR_FOLLOWER.mercury.centre, SPOKE_ANGLE.A + 38);
F.merc40 = intersect(F.merc72, sum('merc89', 'merc40'), F.merc20, sum('merc40', 'merc20'), 1);
F.ven44 = polar(sum('inf51', 'ven44'), SPOKE_ANGLE.C);
F.r1 = polar(INFERIOR_FOLLOWER.venus.centre, SPOKE_ANGLE.C + 50);
F.ven26 = intersect(F.ven44, sum('ven34', 'ven26'), F.r1, sum('ven26', 'r1'), -1);
F.nodes62 = polar(27.0, SPOKE_ANGLE.B);
F.cp52 = polar(sum('cp56', 'cp52'), 118);
F.sun56 = intersect(v(0, 0), SUN_FOLLOWER.centre, F.cp52, sum('cp52', 'sun56'), 1);
F.mj64 = polar(sum('cp56', 'mj64'), -90);
// Superior planets: slot gear g6 meshes the central output g7; the pin gear g5
// sits one offset away from g6, and the idler g4 bridges g3 to g5.
const superior = (g3: string, g4: string, g5: string, g6: string, g3axis: Vec2, p: { angle: number; offset: number }, side: 1 | -1) => {
  F[g6] = polar(pitchR(g6) * 2, p.angle);
  F[g5] = add(F[g6], polar(p.offset, p.angle + 180));
  F[g4] = intersect(g3axis, sum(g3, g4), F[g5], sum(g4, g5), side);
};
superior('sat61', 'sat40', 'sat68', 'sat86s', F.cp52, SUPERIOR_PIN_SLOT.saturn, -1);
superior('mars38', 'mars40', 'mars71', 'mars80s', F.mj64, SUPERIOR_PIN_SLOT.mars, 1);
superior('jup45', 'jup40', 'jup43', 'jup65s', F.mj64, SUPERIOR_PIN_SLOT.jupiter, -1);

export const FRONT_AXES = F;

// ── z layers ──────────────────────────────────────────────────────────────
// Front faces (mm). Meshing gears share a layer; arbor partners differ.
const Z: Record<string, number> = {
  a1: 2.5, b1: 3.4,
  b2: -3, c1: -3, l1: -3,
  c2: -7, d1: -7,
  d2: -11, e2: -11,
  b3: -5.5, e1: -5.5,
  l2: -9, m1: -9,
  // e axis, front to back: e1, e2, e4, e3, then the anomaly gears rearmost,
  // as they are seen at the back of Fragment A.
  e4: -15, f1: -15,
  m3: -19, e3: -19,
  e5: -23, k1: -23,
  k2: -25, e6: -25,
  f2: -29, g1: -29,
  g2: -32, h1: -32,
  h2: -35, i1: -35,
  m2: -26, n1: -26,
  n2: -31, o1: -31,
  n3: -28.5, p1: -28.5,
  p2: -33.5, q1: -33.5,
  b0: 15.2, ma1: 47,
  // between b1 and the Strap
  inf51: 6, merc72: 6, ven44: 6,
  merc89: 8, merc40: 8, merc20: 8,
  ven34: 10, ven26: 10, r1: 10,
  nodes49: 12, nodes62: 12,
  nodes64: 14, nodes48: 14,
  // between the Strap and the Circular Plate, and in front of it
  cp56: 31, cp52: 31, mj64: 31, sun56: 31,
  sat61: 26, sat40: 26, sat68: 26, sat86s: 24.3, sat86: 24.3,
  mars38: 22.5, mars40: 22.5, mars71: 22.5, mars80s: 20.8, mars80: 20.8,
  jup45: 26, jup40: 26, jup43: 26, jup65s: 24.3, jup65: 24.3,
};

export const PLATES = {
  main: { z: 0, thickness: 1.2 },
  strap: { z: 17.8, thickness: 1.6 },
  circular: { z: 29.5, thickness: 2.0, radius: 50 },
  front: { z: 36, thickness: 1.5 },
  back: { z: -38, thickness: 1.5 },
};

export const CASE = {
  left: -92,
  right: 92,
  top: 138,
  bottom: -178,
  front: 37.5,
  back: -39.5,
};

// Front display radii (mm), after the ring display of Freeth et al. 2021.
export const FRONT_RADII = {
  zodiacInner: 60,
  zodiacOuter: 70,
  calendarInner: 70.5,
  calendarOuter: 80,
  rings: { mercury: 19, venus: 25, sun: 31, mars: 37, jupiter: 43, saturn: 49, date: 55 } as Record<string, number>,
};

export const BACK_RADII = {
  metonic: { inner: 44, outer: 74, turns: 5 },
  saros: { inner: 42, outer: 70, turns: 4 },
  subsidiary: 13,
};

const frameOf = (id: string) => GEAR.get(id)!.frame;
const axisOf = (id: string): Vec2 => {
  if (F[id]) return F[id];
  switch (id) {
    case 'merc89': return F.merc72;
    case 'ven34': return F.ven44;
    case 'nodes64': return F.nodes62;
    case 'sat61': return F.cp52;
    case 'mars38': case 'jup45': return F.mj64;
    case 'k1': return K1_POS;
    case 'k2': return K2_POS;
    case 'ma1': return v(0, 0);
  }
  if (frameOf(id) === 'b1') return v(0, 0);
  const letter = id[0];
  if (['inf51', 'cp56', 'nodes49', 'nodes48', 'sat86', 'jup65', 'mars80', 'b0'].includes(id)) return v(0, 0);
  if (A[letter]) return A[letter];
  throw new Error(`layout: no axis for ${id}`);
};

export const PLACEMENTS: GearPlacement[] = GEARS.map((g) => {
  const p = pitchR(g.id);
  const outerR = g.measured?.outerR ?? p + 0.55;
  const innerR = g.measured?.innerR ?? p - 0.55;
  const thickness = g.measured?.thickness ?? (g.frame === 'b1' || g.frame === 'main' ? 1.2 : 1);
  const z = Z[g.id];
  if (z === undefined) throw new Error(`layout: no z for ${g.id}`);
  const spokes = outerR > 30 ? 4 : outerR > 11 ? 4 : 0;
  return { id: g.id, pos: axisOf(g.id), z, thickness, outerR, innerR, pitchR: p, frame: g.frame, spokes, hub: Math.min(3, innerR * 0.3) };
});

export const PLACEMENT = new Map(PLACEMENTS.map((p) => [p.id, p]));

// Axis position at the instant all carriers are at angle zero.
export const restPosition = (id: string): Vec2 => {
  const p = PLACEMENT.get(id)!;
  return p.frame === 'e3' ? add(A.e, p.pos) : p.pos;
};

// Every mesh must sit at the sum of its pitch radii (used by the tests).
export const meshDistanceErrors = (edges: { kind: string; a?: string; b?: string }[]) => {
  const errs: { a: string; b: string; error: number }[] = [];
  for (const e of edges) {
    if (e.kind !== 'mesh' || !e.a || !e.b) continue;
    if (GEAR.get(e.a)!.contrate || GEAR.get(e.b)!.contrate) continue;
    const d = dist(restPosition(e.a), restPosition(e.b));
    errs.push({ a: e.a, b: e.b, error: d - (pitchR(e.a) + pitchR(e.b)) });
  }
  return errs;
};
