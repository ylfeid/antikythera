// Monte Carlo manufacturing simulation.
//
// Tooth placement follows Edmunds (2011), who measured the surviving gears in
// the CT data: each tooth sits off its ideal angle by a random error with
// standard deviation σ (a fraction of the tooth pitch; he found 0.04–0.08) plus
// a sinusoidal systematic error of amplitude A (0–2°; from eccentric mounting
// or from marking out the teeth). His four scenarios are Cases A–D below.
//
// At each mesh the driven gear picks up (Na/Nb)·δa[ka] − δb[kb], where k are
// the teeth currently in contact. The errors propagate down the trains with the
// exact kinematics, through the pin-and-slot devices, to every pointer.
//
// Backlash does not move a pointer while the crank turns one way, since a
// constant lag is calibrated out, but reversing the crank leaves each pointer
// standing in a dead band. Per mesh the circumferential backlash of triangular
// teeth is 2·G·tan 30° for a radial clearance G; Szigety & Arenas (2025) find
// G ≈ 40% of the 1.1 mm tooth height avoids both jamming and disengagement.

import { GEAR, type Edge } from '../model/gears.ts';
import { SCHEDULE, turnsOf, type MeshError } from '../model/kinematics.ts';
import { Mechanism } from '../model/mechanism.ts';
import { Q } from '../model/rational.ts';

export interface Case {
  id: string;
  sigma: number; // random tooth error, fraction of pitch
  systematic: number; // sinusoidal amplitude, degrees
}

// Edmunds (2011) via Szigety & Arenas (2025), Table 2.
export const EDMUNDS_CASES: Case[] = [
  { id: 'A', sigma: 0.04, systematic: 0 },
  { id: 'B', sigma: 0.04, systematic: 0.5 },
  { id: 'C', sigma: 0.04, systematic: 1.0 },
  { id: 'D', sigma: 0.08, systematic: 2.0 },
];

// Edmunds' published output spreads (σ – Dm, degrees) for comparison.
export const EDMUNDS_RESULTS: Record<string, { moon: [number, number]; metonic: [number, number]; saros: [number, number] }> = {
  A: { moon: [4.4, 13], metonic: [0.32, 1.15], saros: [0.38, 1.3] },
  B: { moon: [7, 20], metonic: [0.5, 1.5], saros: [1.1, 2.7] },
  C: { moon: [14, 33], metonic: [0.85, 2.3], saros: [2.1, 4.9] },
  D: { moon: [26, 57], metonic: [1.6, 3.9], saros: [3.8, 8.6] },
};

export const TOOTH_HEIGHT_MM = 1.1; // Efstathiou et al. 2012, via Szigety & Arenas 2025
export const CLEARANCE_FRACTION = 0.4;
export const backlashMM = (clearance = CLEARANCE_FRACTION) => 2 * clearance * TOOTH_HEIGHT_MM * Math.tan(Math.PI / 6);
export const SLOT_PLAY_MM = 0.05;

// Seeded generator so results are reproducible (mulberry32).
export const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const gaussian = (rand: () => number) => {
  const u = Math.max(rand(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
};

export const pitchRadius = (id: string) => {
  const g = GEAR.get(id)!;
  return g.measured?.pitchR ?? (g.teeth * 0.495) / 2;
};

// A manufactured instance: per-gear tooth errors (turns) and per-mesh contact
// offsets.
export const makeMeshError = (c: Case, rand: () => number): MeshError => {
  const teethErr = new Map<string, Float64Array>();
  const toothErrors = (id: string) => {
    let e = teethErr.get(id);
    if (!e) {
      const n = GEAR.get(id)!.teeth;
      const phase = rand() * 2 * Math.PI;
      e = new Float64Array(n);
      for (let k = 0; k < n; k++) e[k] = (c.sigma * gaussian(rand)) / n + (c.systematic / 360) * Math.sin((2 * Math.PI * k) / n + phase);
      teethErr.set(id, e);
    }
    return e;
  };
  const meshes = new Map<Edge, { psi: number; c: number }>();
  return (edge, from, to, fromTurns) => {
    if (edge.kind !== 'mesh') return 0;
    const a = GEAR.get(from)!;
    const b = GEAR.get(to)!;
    if (a.contrate || b.contrate) return 0;
    let m = meshes.get(edge);
    if (!m) {
      m = { psi: rand(), c: Math.floor(rand() * 1e6) };
      meshes.set(edge, m);
    }
    // Teeth in contact: the known gear's angle picks its tooth, and the other
    // gear's tooth advances one for one in the opposite sense.
    const [na, nb] = [a.teeth, b.teeth];
    const ka = ((Math.floor((fromTurns + m.psi) * na) % na) + na) % na;
    const kb = (((m.c - ka) % nb) + nb) % nb;
    return (na / nb) * toothErrors(from)[ka] - toothErrors(to)[kb];
  };
};

export interface Output {
  id: string;
  name: string;
  gear: string;
  daysPerDegree?: number;
}

export const OUTPUTS: Output[] = [
  { id: 'moon', name: 'Moon pointer', gear: 'b3' },
  { id: 'metonic', name: 'Metonic pointer', gear: 'n1', daysPerDegree: (19 * 365.25) / 5 / 360 },
  { id: 'saros', name: 'Saros pointer', gear: 'g1', daysPerDegree: (223 * 29.530589) / 4 / 360 },
  { id: 'venus', name: 'Venus', gear: 'r1' },
  { id: 'mars', name: 'Mars', gear: 'mars80' },
  { id: 'saturn', name: 'Saturn', gear: 'sat86' },
];

export interface TrialResult {
  sigma: Record<string, number>; // rms pointer error about its mean, degrees
  maxDev: Record<string, number>; // max |error − mean|, degrees
  deadBand: Record<string, number>; // reversal dead band, degrees
}

const wrapTurns = (x: number) => x - Math.round(x);

// Pointer angle of an output in degrees: planet outputs are read as zodiac
// longitudes (through the followers), the rest straight off the arbor.
const pointer = (mech: Mechanism, state: Float64Array, o: Output) => {
  if (o.id === 'venus' || o.id === 'mars' || o.id === 'saturn') return mech.longitudes(state)[o.id];
  return turnsOf(state, o.gear) * 360;
};

// Dead band: for every mesh, the backlash lets the driven gear turn freely by
// j / r (j circumferential backlash, r its pitch radius); a slot lets its gear
// turn by the play over the pin radius. Each is weighted by how much the
// output moves per turn of that gear, found by nudging the gear's phase.
const deadBand = (mech: Mechanism, mean: Float64Array, rand: () => number, clearance: number) => {
  const lash = backlashMM(clearance);
  const base = mech.kin.propagate(mean, mech.calibration.phases);
  const out: Record<string, number> = Object.fromEntries(OUTPUTS.map((o) => [o.id, 0]));
  const eps = 1e-6;
  for (const step of SCHEDULE) {
    const e = step.edge;
    if (!e || (e.kind !== 'mesh' && e.kind !== 'pinSlot')) continue;
    const g = step.gear;
    const gear = GEAR.get(g)!;
    if (gear.contrate || GEAR.get(step.from!)!.contrate) continue;
    const play =
      e.kind === 'mesh'
        ? (lash * (0.5 + rand())) / (2 * Math.PI * pitchRadius(g))
        : (SLOT_PLAY_MM * (0.5 + rand())) / (2 * Math.PI * e.pin);
    const nudged = mech.kin.propagate(mean, { ...mech.calibration.phases, [g]: (mech.calibration.phases[g] ?? 0) + eps });
    for (const o of OUTPUTS) {
      const d = (wrapTurns((pointer(mech, nudged, o) - pointer(mech, base, o)) / 360) * 360) / eps;
      out[o.id] += Math.abs(d) * play;
    }
  }
  return out;
};

export const simulate = (mech: Mechanism, c: Case, trials: number, opts: { years?: number; samples?: number; seed?: number; clearance?: number } = {}) => {
  const years = opts.years ?? 19;
  const n = opts.samples ?? 1200;
  const rand = rng(opts.seed ?? 1);
  const Ts = Array.from({ length: n }, (_, i) => Q.fromNumber((i / n) * years));
  const means = Ts.map((T) => mech.kin.meanTurns(T));
  const ideal = means.map((m) => {
    const s = mech.kin.propagate(m, mech.calibration.phases);
    return OUTPUTS.map((o) => pointer(mech, s, o));
  });
  const results: TrialResult[] = [];
  for (let t = 0; t < trials; t++) {
    const err = makeMeshError(c, rand);
    const series = OUTPUTS.map(() => new Float64Array(n));
    means.forEach((m, i) => {
      const s = mech.kin.propagate(m, mech.calibration.phases, err);
      OUTPUTS.forEach((o, k) => (series[k][i] = wrapTurns((pointer(mech, s, o) - ideal[i][k]) / 360) * 360));
    });
    const sigma: Record<string, number> = {};
    const maxDev: Record<string, number> = {};
    OUTPUTS.forEach((o, k) => {
      const x = series[k];
      const mean = x.reduce((a, v) => a + v, 0) / n;
      let ss = 0;
      let mx = 0;
      for (const v of x) {
        ss += (v - mean) ** 2;
        mx = Math.max(mx, Math.abs(v - mean));
      }
      sigma[o.id] = Math.sqrt(ss / n);
      maxDev[o.id] = mx;
    });
    results.push({ sigma, maxDev, deadBand: deadBand(mech, means[0], rand, opts.clearance ?? CLEARANCE_FRACTION) });
  }
  return results;
};

export const summarize = (results: TrialResult[], key: keyof TrialResult, id: string) => {
  const v = results.map((r) => r[key][id]).sort((a, b) => a - b);
  const q = (p: number) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  return { median: q(0.5), p05: q(0.05), p95: q(0.95), mean: v.reduce((a, x) => a + x, 0) / v.length, values: v };
};
