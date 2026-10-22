// From gear angles to what the Mechanism displays: longitudes on the zodiac,
// the moon phase, and the positions on the back dials.

import { INFERIOR_FOLLOWER, SOLAR_APOGEE_DEG, SUN_FOLLOWER } from './gears.ts';
import { Kinematics, RATES, SCHEDULE, turnsOf, type MeshError, type Phases, type Rates } from './kinematics.ts';
import { Q } from './rational.ts';
import { MODERN, type Body } from './ephemeris.ts';
import { FRONT_AXES, angleOf } from './layout.ts';
import { GLYPH_BY_MONTH, type Glyph } from './eclipses.ts';

// The epoch: Full Moon 1 of the Saros dial, 12 May 205 BC (Freeth 2014), as
// timed by Astronomy Engine. Mechanism time is measured in days from here.
export const EPOCH_JD = 1646679.04084;

// Where the epoch falls on each dial (fractions of a cell / turn).
// - Saros: FM1 is 17 EYu into month 1 (Freeth 2014).
// - Metonic: assumed to start with the same lunar month as the Saros dial.
// - Olympiad: 205 BC is year 4 of Olympiad 143; the games of Olympiad 144
//   were held in summer 204 BC.
// - Callippic: the first Callippic period began at the summer solstice of
//   330 BC; the epoch is 48.88 years into the third period.
export const SAROS_EPOCH_MONTHS = Q.of(17, 38);
export const METONIC_EPOCH_MONTHS = Q.of(17, 38);
export const OLYMPIAD_EPOCH_YEARS = 3 + 0.45 / 12.37;
export const CALLIPPIC_EPOCH_YEARS = 48.88;

export interface Calibration {
  phases: Phases;
  // Degrees added to each output where its pointer or ring was set on its tube.
  mount: Record<Body, number>;
}

export const ZERO_CALIBRATION: Calibration = {
  phases: {},
  mount: { sun: 0, moon: 0, mercury: 0, venus: 0, mars: 0, jupiter: 0, saturn: 0, nodes: 0 },
};

export interface Readout {
  jd: number;
  gears: Float64Array;
  longitude: Record<Body, number>;
  meanSun: number;
  // Elongation of the Moon from the mean Sun, which is what turns the phase
  // ball (0 = new, 180 = full).
  phase: number;
  dials: Dials;
}

export interface Dials {
  metonicMonth: number; // 0 ≤ x < 235, cumulative within the cycle
  sarosMonth: number; // 0 ≤ x < 223
  glyph: Glyph | undefined;
  exeligmos: number; // 0 ≤ x < 3, continuous
  exeligmosSector: number; // 0, 1, 2 → +0, +8, +16 hours
  olympiadYear: number; // 0 ≤ x < 4
  callippicYear: number; // 0 ≤ x < 76
}

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;
const wrap360 = (x: number) => ((x % 360) + 360) % 360;
const modQ = (x: Q, m: number) => {
  const mq = Q.of(m);
  return x.sub(mq.mul(Q.of(x.div(mq).floor()))).toNumber();
};

// Sum of two vectors given as (length, angle in degrees); returns the angle.
const vecAngle = (r1: number, a1: number, r2: number, a2: number) =>
  Math.atan2(r1 * Math.sin(a1 * RAD) + r2 * Math.sin(a2 * RAD), r1 * Math.cos(a1 * RAD) + r2 * Math.cos(a2 * RAD)) * DEG;

export class Mechanism {
  readonly kin: Kinematics;
  readonly daysPerYear: Q;
  calibration: Calibration;

  constructor(rates: Rates = RATES, daysPerYear: Q = Q.of(1461, 4), calibration: Calibration = ZERO_CALIBRATION) {
    this.kin = new Kinematics(rates, SCHEDULE);
    this.daysPerYear = daysPerYear;
    this.calibration = calibration;
  }

  yearsAt(jd: number | Q) {
    const days = typeof jd === 'number' ? Q.fromNumber(jd).sub(Q.fromNumber(EPOCH_JD)) : jd.sub(Q.fromNumber(EPOCH_JD));
    return days.div(this.daysPerYear);
  }

  gearsAt(jd: number, meshError?: MeshError) {
    return this.kin.evaluate(this.yearsAt(jd), this.calibration.phases, meshError);
  }

  // Zodiac longitudes from a gear state.
  longitudes(g: Float64Array, cal: Calibration = this.calibration): Record<Body, number> {
    const m = cal.mount;
    const b1 = turnsOf(g, 'b1') * 360;
    const mean = b1 + m.sun;
    // The epicycle's centre sits on b1 at the drawing angle of its axis; the
    // kinematic angles run the other way, hence the minus sign.
    const inferior = (body: 'mercury' | 'venus', gear: string) =>
      vecAngle(INFERIOR_FOLLOWER[body].centre, b1 - angleOf(FRONT_AXES[gear]), INFERIOR_FOLLOWER[body].pin, turnsOf(g, gear) * 360) + m[body];
    return {
      // Follower on the pin of the stationary 56: mean Sun plus a fixed vector
      // towards the apogee, i.e. Hipparchus' eccentric.
      sun: wrap360(vecAngle(SUN_FOLLOWER.centre, mean, SUN_FOLLOWER.pin, SOLAR_APOGEE_DEG + turnsOf(g, 'sun56') * 360)),
      moon: wrap360(turnsOf(g, 'b3') * 360 + m.moon),
      mercury: wrap360(inferior('mercury', 'merc20')),
      venus: wrap360(inferior('venus', 'r1')),
      mars: wrap360(turnsOf(g, 'mars80') * 360 + m.mars),
      jupiter: wrap360(turnsOf(g, 'jup65') * 360 + m.jupiter),
      saturn: wrap360(turnsOf(g, 'sat86') * 360 + m.saturn),
      nodes: wrap360(turnsOf(g, 'nodes48') * 360 + m.nodes),
    };
  }

  dials(T: Q): Dials {
    const r = (id: string) => this.kin.rate(id);
    // Spiral dials need the cumulative count, not just the angle, so they are
    // computed from the exact rational turn count.
    const metonic = modQ(r('n1').neg().mul(T).mul(Q.of(47)).add(METONIC_EPOCH_MONTHS), 235);
    const saros = modQ(r('g1').neg().mul(T).mul(Q.of(223, 4)).add(SAROS_EPOCH_MONTHS), 223);
    const exeligmos = modQ(r('i1').neg().mul(T).mul(Q.of(3)), 3);
    const olympiad = modQ(r('o1').mul(T).mul(Q.of(4)), 4) + OLYMPIAD_EPOCH_YEARS;
    const callippic = modQ(r('q1').neg().mul(T).mul(Q.of(76)), 76) + CALLIPPIC_EPOCH_YEARS;
    return {
      metonicMonth: metonic,
      sarosMonth: saros,
      glyph: GLYPH_BY_MONTH.get(Math.floor(saros) + 1),
      exeligmos,
      exeligmosSector: Math.floor(exeligmos),
      olympiadYear: olympiad % 4,
      callippicYear: callippic % 76,
    };
  }

  read(jd: number, meshError?: MeshError): Readout {
    const T = this.yearsAt(jd);
    const gears = this.kin.evaluate(T, this.calibration.phases, meshError);
    const longitude = this.longitudes(gears);
    const meanSun = wrap360(turnsOf(gears, 'b1') * 360 + this.calibration.mount.sun);
    return { jd, gears, longitude, meanSun, phase: wrap360(longitude.moon - meanSun), dials: this.dials(T) };
  }
}

// The same mechanism with every period relation replaced by the exact modern
// mean motion (per tropical year). Comparing it with the real gearing separates
// errors of the period relations from errors of the geometric theories.
export const idealRates = (): Rates => {
  const Y = MODERN.tropicalYear;
  const f = (x: number) => Q.fromNumber(x);
  const sidereal = Y / MODERN.tropicalMonth;
  const anomalistic = Y / MODERN.anomalisticMonth;
  const draconic = Y / MODERN.draconicMonth;
  const apsides = sidereal - anomalistic; // prograde turns per year
  const rates = new Map(RATES);
  const set = (ids: string[], v: number) => ids.forEach((id) => rates.set(id, f(v)));
  // The lunar arbors turn backwards (four meshes from b1 to b3).
  set(['e2', 'e5', 'e6', 'e1'], -sidereal);
  set(['b3'], sidereal);
  set(['e3', 'e4'], -apsides);
  // k1 = 2·e3 − e5 (mesh e5~k1 in the frame of e3).
  set(['k1', 'k2'], -2 * apsides + sidereal);
  set(['ma1'], 2 * sidereal - 1);
  const synodicMonths = Y / MODERN.synodicMonth;
  set(['g1', 'g2'], (-synodicMonths * 4) / 223);
  set(['i1'], -synodicMonths / 669);
  set(['n1', 'n2', 'n3'], (-synodicMonths * 5) / 235);
  set(['nodes48'], sidereal - draconic);
  const syn = (p: keyof typeof MODERN.synodic) => Y / MODERN.synodic[p];
  set(['merc20'], 1 + syn('mercury'));
  set(['r1'], 1 + syn('venus'));
  set(['sat68', 'sat86s'], 1 + syn('saturn'));
  set(['sat86'], 1 - syn('saturn'));
  set(['jup43', 'jup65s'], 1 + syn('jupiter'));
  set(['jup65'], 1 - syn('jupiter'));
  set(['mars71', 'mars80s'], 1 + syn('mars'));
  set(['mars80'], 1 - syn('mars'));
  return rates;
};

export const IDEAL_DAYS_PER_YEAR = Q.fromNumber(MODERN.tropicalYear);
