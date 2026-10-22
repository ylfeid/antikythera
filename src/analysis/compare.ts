// Mechanism versus ephemeris: error time series and their decomposition.
//
// total    = mechanism (real gearing)              − ephemeris
// theory   = mechanism with exact modern periods    − ephemeris
// periods  = total − theory
//
// "theory" is what the Greek geometric models would give if their periods were
// perfect: missing ellipses, evection, equants. "periods" is what the gear
// ratios (period relations, the 365¼-day year) add on top, growing with time.

import { BODIES, type Body } from '../model/ephemeris.ts';
import { Mechanism, idealRates, IDEAL_DAYS_PER_YEAR, type Calibration } from '../model/mechanism.ts';
import { prepareSamples } from './calibrate.ts';

export const wrap180 = (x: number) => x - 360 * Math.round(x / 360);

export interface ErrorSeries {
  jd: number[];
  truth: Record<Body, Float64Array>;
  total: Record<Body, Float64Array>;
  theory: Record<Body, Float64Array>;
  periods: Record<Body, Float64Array>;
}

export const idealMechanism = (cal: Calibration) => new Mechanism(idealRates(), IDEAL_DAYS_PER_YEAR, cal);

export const errorSeries = (mech: Mechanism, jds: number[], bodies: Body[] = BODIES): ErrorSeries => {
  const ideal = idealMechanism(mech.calibration);
  const { truth } = prepareSamples(mech, jds, bodies);
  const make = () => Object.fromEntries(bodies.map((b) => [b, new Float64Array(jds.length)])) as Record<Body, Float64Array>;
  const total = make();
  const theory = make();
  const periods = make();
  jds.forEach((jd, i) => {
    const real = mech.longitudes(mech.gearsAt(jd));
    const perfect = ideal.longitudes(ideal.gearsAt(jd));
    for (const b of bodies) {
      total[b][i] = wrap180(real[b] - truth[b][i]);
      theory[b][i] = wrap180(perfect[b] - truth[b][i]);
      periods[b][i] = wrap180(total[b][i] - theory[b][i]);
    }
  });
  return { jd: jds, truth, total, theory, periods };
};

export interface Stats {
  rms: number;
  maxAbs: number;
  mean: number;
  p95: number;
}

export const stats = (x: ArrayLike<number>): Stats => {
  const a = Array.from(x);
  if (a.length === 0) return { rms: NaN, maxAbs: NaN, mean: NaN, p95: NaN };
  const mean = a.reduce((s, v) => s + v, 0) / a.length;
  const rms = Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
  const abs = a.map(Math.abs).sort((p, q) => p - q);
  return { rms, maxAbs: abs[abs.length - 1], mean, p95: abs[Math.min(abs.length - 1, Math.floor(0.95 * abs.length))] };
};

// Linear drift rate (degrees per century) of a series against time, by least
// squares: the signature of a period-relation error.
export const driftPerCentury = (jd: number[], y: ArrayLike<number>) => {
  const n = jd.length;
  const t = jd.map((j) => (j - jd[0]) / 36525);
  const mt = t.reduce((s, v) => s + v, 0) / n;
  let my = 0;
  for (let i = 0; i < n; i++) my += y[i];
  my /= n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (t[i] - mt) * (y[i] - my);
    den += (t[i] - mt) ** 2;
  }
  return num / den;
};
