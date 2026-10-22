// Exact kinematics of the gear graph.
//
// Mean rates: every coupling is linear in the angular velocities, so the rates
// (turns per year, b1 = 1) solve a linear system over the rationals. Gaussian
// elimination on Q gives them exactly, with no floating point anywhere.
//
// Angles: θ(t) = ω·T + f, where ω·T (T = years, a Q) is exact and reduced mod 1
// with BigInt before conversion, and f is a small bounded float holding the
// assembly phases and the pin-and-slot anomalies. Nothing that grows with time
// is ever a float, so 10⁶ years of cranking costs no precision.

import { EDGES, GEAR, GEARS, DRIVER, FRAME_GEAR, type Edge, type Frame } from './gears.ts';
import { Q } from './rational.ts';

export type Rates = Map<string, Q>;

const frameGear = (f: Frame) => (f === 'main' ? null : FRAME_GEAR[f]);

export const solveRates = (edges: Edge[] = EDGES, driver = DRIVER): Rates => {
  const ids = [...new Set(edges.flatMap((e) => (e.kind === 'fixed' ? [e.a] : [e.a, e.b])).concat(driver))];
  const index = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;
  const rows: Q[][] = [];
  const rhs: Q[] = [];
  const row = () => Array.from({ length: n }, () => Q.ZERO);
  const teeth = (id: string) => {
    const g = GEAR.get(id);
    if (!g) throw new Error(`unknown gear ${id}`);
    return BigInt(g.teeth);
  };

  // b1 turns once per year.
  {
    const r = row();
    r[index.get(driver)!] = Q.ONE;
    rows.push(r);
    rhs.push(Q.ONE);
  }
  for (const e of edges) {
    const r = row();
    if (e.kind === 'fixed') {
      r[index.get(e.a)!] = Q.ONE;
    } else if (e.kind === 'arbor') {
      r[index.get(e.a)!] = Q.ONE;
      r[index.get(e.b)!] = Q.of(-1);
    } else {
      // mesh:    Na(ωa − ωF) + Nb(ωb − ωF) = 0
      // pinSlot: (ωb − ωF) − (ωa − ωF) = 0
      const [ca, cb] = e.kind === 'mesh' ? [Q.of(teeth(e.a)), Q.of(teeth(e.b))] : [Q.of(-1), Q.ONE];
      const ia = index.get(e.a)!;
      const ib = index.get(e.b)!;
      r[ia] = r[ia].add(ca);
      r[ib] = r[ib].add(cb);
      const fg = frameGear(e.frame);
      if (fg) {
        const iF = index.get(fg)!;
        r[iF] = r[iF].sub(ca.add(cb));
      }
    }
    rows.push(r);
    rhs.push(Q.ZERO);
  }

  // Gauss–Jordan elimination with exact pivots.
  const m = rows.length;
  const where = new Array<number>(n).fill(-1);
  let rank = 0;
  for (let col = 0; col < n && rank < m; col++) {
    let piv = -1;
    for (let i = rank; i < m; i++) if (!rows[i][col].isZero()) { piv = i; break; }
    if (piv < 0) continue;
    [rows[piv], rows[rank]] = [rows[rank], rows[piv]];
    [rhs[piv], rhs[rank]] = [rhs[rank], rhs[piv]];
    const p = rows[rank][col];
    for (let j = col; j < n; j++) rows[rank][j] = rows[rank][j].div(p);
    rhs[rank] = rhs[rank].div(p);
    for (let i = 0; i < m; i++) {
      if (i === rank || rows[i][col].isZero()) continue;
      const f = rows[i][col];
      for (let j = col; j < n; j++) if (!rows[rank][j].isZero()) rows[i][j] = rows[i][j].sub(f.mul(rows[rank][j]));
      rhs[i] = rhs[i].sub(f.mul(rhs[rank]));
    }
    where[col] = rank++;
  }
  for (let i = rank; i < m; i++) if (!rhs[i].isZero()) throw new Error('gear graph is inconsistent');
  const free = ids.filter((_, i) => where[i] < 0);
  if (free.length) throw new Error(`gear graph under-determined: ${free.join(', ')}`);
  return new Map(ids.map((id, i) => [id, rhs[where[i]]]));
};

export const RATES = solveRates();

// Order in which gear angles can be computed: each gear has one parent edge,
// and the frame gear of that edge must already be known.
interface Step {
  gear: string;
  edge: Edge | null; // null: driver or fixed
  from: string | null;
  forward: boolean; // edge traversed a → b
}

const buildSchedule = (edges: Edge[], driver: string): Step[] => {
  const known = new Set<string>([driver]);
  const steps: Step[] = [{ gear: driver, edge: null, from: null, forward: true }];
  for (const e of edges) {
    if (e.kind === 'fixed' && !known.has(e.a)) {
      known.add(e.a);
      steps.push({ gear: e.a, edge: null, from: null, forward: true });
    }
  }
  let progress = true;
  while (progress) {
    progress = false;
    for (const e of edges) {
      if (e.kind === 'fixed') continue;
      const fg = e.kind === 'arbor' ? null : frameGear(e.frame);
      if (fg && !known.has(fg)) continue;
      // The pin-and-slot only runs forwards (the pin drives the slot).
      if (known.has(e.a) && !known.has(e.b)) {
        known.add(e.b);
        steps.push({ gear: e.b, edge: e, from: e.a, forward: true });
        progress = true;
      } else if (known.has(e.b) && !known.has(e.a) && e.kind !== 'pinSlot') {
        known.add(e.a);
        steps.push({ gear: e.a, edge: e, from: e.b, forward: false });
        progress = true;
      }
    }
  }
  const missing = GEARS.filter((g) => !known.has(g.id)).map((g) => g.id);
  if (missing.length) throw new Error(`gears not reachable from the drive: ${missing.join(', ')}`);
  return steps;
};

export const SCHEDULE = buildSchedule(EDGES, DRIVER);

// Assembly phase of each gear relative to the gear that drives it (turns).
// This is what a maker sets when choosing which teeth engage, and is what the
// calibration fits; it never affects any rate.
export type Phases = Record<string, number>;

// Optional perturbation hook for the manufacturing simulation: given a mesh,
// the gear already known (`from`), the gear being computed (`to`) and the
// known gear's angle in the mesh frame (turns), return extra rotation of `to`.
export type MeshError = (edge: Edge, from: string, to: string, fromTurns: number) => number;

const TAU = 2 * Math.PI;
const wrapHalf = (x: number) => x - Math.round(x);

export const pinSlotDelta = (alphaTurns: number, offset: number, pin: number, dirTurns = 0) => {
  // Pin on gear a at radius `pin`; slot gear b turns about an axis `offset` away
  // in direction `dirTurns` of the frame. Returns β − α in turns.
  const a = alphaTurns * TAU;
  const d = dirTurns * TAU;
  const beta = Math.atan2(pin * Math.sin(a) - offset * Math.sin(d), pin * Math.cos(a) - offset * Math.cos(d));
  return wrapHalf((beta - a) / TAU);
};

// Gear ids in a fixed order, so per-instant state can live in typed arrays.
export const GEAR_IDS = GEARS.map((g) => g.id);
export const GEAR_INDEX = new Map(GEAR_IDS.map((id, i) => [id, i]));

interface CompiledStep {
  gear: number;
  kind: 'root' | 'arbor' | 'mesh' | 'pinSlot';
  from: number;
  frame: number; // −1 for the main frame
  ratio: number; // Na/Nb for meshes
  offset: number;
  pin: number;
  dir: number;
  edge: Edge | null;
}

export class Kinematics {
  readonly rates: Rates;
  private readonly rateList: Q[];
  private readonly steps: CompiledStep[];

  constructor(rates: Rates = RATES, schedule: Step[] = SCHEDULE) {
    this.rates = rates;
    this.rateList = GEAR_IDS.map((id) => {
      const r = rates.get(id);
      if (!r) throw new Error(`no rate for ${id}`);
      return r;
    });
    this.steps = schedule.map((s) => {
      const gear = GEAR_INDEX.get(s.gear)!;
      if (!s.edge) return { gear, kind: 'root', from: -1, frame: -1, ratio: 0, offset: 0, pin: 0, dir: 0, edge: null };
      const from = GEAR_INDEX.get(s.from!)!;
      if (s.edge.kind === 'arbor') return { gear, kind: 'arbor', from, frame: -1, ratio: 0, offset: 0, pin: 0, dir: 0, edge: s.edge };
      if (s.edge.kind === 'fixed') throw new Error('fixed edges are roots');
      const fg = frameGear(s.edge.frame);
      const frame = fg ? GEAR_INDEX.get(fg)! : -1;
      if (s.edge.kind === 'mesh') {
        const ratio = GEAR.get(s.from!)!.teeth / GEAR.get(s.gear)!.teeth;
        return { gear, kind: 'mesh', from, frame, ratio, offset: 0, pin: 0, dir: 0, edge: s.edge };
      }
      return { gear, kind: 'pinSlot', from, frame, ratio: 1, offset: s.edge.offset, pin: s.edge.pin, dir: s.edge.dir, edge: s.edge };
    });
  }

  rate(id: string) {
    return this.rateList[GEAR_INDEX.get(id)!];
  }

  // Exact mean angles at T years, each reduced mod 1 turn in BigInt before it
  // becomes a float. This is the only place time enters.
  meanTurns(T: Q): Float64Array {
    const out = new Float64Array(this.rateList.length);
    for (let i = 0; i < out.length; i++) out[i] = this.rateList[i].mul(T).frac().toNumber();
    return out;
  }

  // Full angles (turns, unreduced): mean + assembly phases + pin-and-slot
  // anomalies (+ manufacturing errors), propagated down the schedule.
  propagate(mean: Float64Array, phases: Phases = {}, meshError?: MeshError): Float64Array {
    const f = new Float64Array(mean.length);
    for (const s of this.steps) {
      const ph = phases[GEAR_IDS[s.gear]] ?? 0;
      if (s.kind === 'root') {
        f[s.gear] = ph;
      } else if (s.kind === 'arbor') {
        f[s.gear] = f[s.from] + ph;
      } else {
        const fF = s.frame >= 0 ? f[s.frame] : 0;
        const mF = s.frame >= 0 ? mean[s.frame] : 0;
        const fa = f[s.from];
        const rel = mean[s.from] - mF + fa - fF;
        if (s.kind === 'mesh') {
          let v = fF - s.ratio * (fa - fF) + ph;
          if (meshError) v += meshError(s.edge!, GEAR_IDS[s.from], GEAR_IDS[s.gear], rel);
          f[s.gear] = v;
        } else {
          f[s.gear] = fa + pinSlotDelta(rel, s.offset, s.pin, s.dir) + ph;
        }
      }
    }
    for (let i = 0; i < f.length; i++) f[i] += mean[i];
    return f;
  }

  evaluate(T: Q, phases: Phases = {}, meshError?: MeshError) {
    return this.propagate(this.meanTurns(T), phases, meshError);
  }
}

export const turnsOf = (state: Float64Array, id: string) => state[GEAR_INDEX.get(id)!];

// One mechanism year is 365¼ days: the calendar ring's leap-day shifts make
// the Mechanism follow the Callippic year (Freeth et al. 2021, Supp. §6.4.4).
export const DAYS_PER_YEAR = Q.of(1461, 4);
export const yearsFromDays = (days: number | Q) => (typeof days === 'number' ? Q.fromNumber(days) : days).div(DAYS_PER_YEAR);
