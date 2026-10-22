// Calibration: setting the pointers, as the maker would have done from
// observations around the epoch.
//
// Gear ratios, pin-and-slot geometry and epicycle sizes are never fitted. The
// only free parameters are the ones a maker sets at assembly: where each
// pointer sits on its tube (a constant angle) and, for each anomaly mechanism,
// which tooth of the pin gear engages (the anomaly phase). They are fitted by
// least squares against the ephemeris over a 19-year window centred on the
// epoch; everything outside that window is a prediction.

import { BODIES, longitude, type Body } from '../model/ephemeris.ts';
import { Mechanism, EPOCH_JD, type Calibration } from '../model/mechanism.ts';

export const CALIBRATION_WINDOW: [number, number] = [EPOCH_JD - 9.5 * 365.25, EPOCH_JD + 9.5 * 365.25];

// Gear whose assembly phase sets each body's anomaly.
export const ANOMALY_GEAR: Partial<Record<Body, string>> = {
  moon: 'k1',
  mercury: 'merc20',
  venus: 'r1',
  mars: 'mars71',
  jupiter: 'jup43',
  saturn: 'sat68',
};

const wrap180 = (x: number) => x - 360 * Math.round(x / 360);

export const sampleJDs = (from: number, to: number, step: number) => {
  const out: number[] = [];
  for (let jd = from; jd <= to + 1e-9; jd += step) out.push(jd);
  return out;
};

interface Samples {
  jds: number[];
  means: Float64Array[];
  truth: Record<Body, Float64Array>;
}

export const prepareSamples = (mech: Mechanism, jds: number[], bodies: Body[] = BODIES): Samples => {
  const means = jds.map((jd) => mech.kin.meanTurns(mech.yearsAt(jd)));
  const truth = Object.fromEntries(bodies.map((b) => [b, Float64Array.from(jds, (jd) => longitude(b, jd))])) as Record<Body, Float64Array>;
  return { jds, means, truth };
};

// Circular mean of the residuals and their rms after removing it.
const residualStats = (res: number[]) => {
  let s = 0;
  let c = 0;
  for (const r of res) {
    s += Math.sin((r * Math.PI) / 180);
    c += Math.cos((r * Math.PI) / 180);
  }
  const mean = (Math.atan2(s, c) * 180) / Math.PI;
  let ss = 0;
  for (const r of res) ss += wrap180(r - mean) ** 2;
  return { mean, rms: Math.sqrt(ss / res.length) };
};

export const calibrate = (mech: Mechanism, samples: Samples, bodies: Body[] = BODIES): Calibration => {
  const cal: Calibration = { phases: { ...mech.calibration.phases }, mount: { ...mech.calibration.mount } };
  const residuals = (body: Body, c: Calibration) =>
    samples.means.map((m, i) => {
      const g = mech.kin.propagate(m, c.phases);
      return wrap180(mech.longitudes(g, c)[body] - samples.truth[body][i]);
    });
  // Fix the mount for given phases; iterate because the true Sun's fixed
  // apogee makes its mount slightly nonlinear.
  const fitMount = (body: Body, c: Calibration) => {
    let st = residualStats(residuals(body, c));
    for (let k = 0; k < 4 && Math.abs(st.mean) > 1e-7; k++) {
      c.mount[body] -= st.mean;
      st = residualStats(residuals(body, c));
    }
    return st.rms;
  };

  for (const body of bodies) {
    const gear = ANOMALY_GEAR[body];
    if (!gear) {
      fitMount(body, cal);
      continue;
    }
    const tryPhase = (p: number) => {
      const c: Calibration = { phases: { ...cal.phases, [gear]: p }, mount: { ...cal.mount } };
      const rms = fitMount(body, c);
      return { rms, c };
    };
    // Coarse scan of the anomaly phase, then golden-section refinement.
    let best = tryPhase(0);
    let bestP = 0;
    const N = 72;
    for (let k = 1; k < N; k++) {
      const t = tryPhase(k / N);
      if (t.rms < best.rms) {
        best = t;
        bestP = k / N;
      }
    }
    let a = bestP - 1 / N;
    let b = bestP + 1 / N;
    const g = (Math.sqrt(5) - 1) / 2;
    for (let it = 0; it < 30; it++) {
      const x1 = b - g * (b - a);
      const x2 = a + g * (b - a);
      if (tryPhase(x1).rms < tryPhase(x2).rms) b = x2;
      else a = x1;
    }
    best = tryPhase((a + b) / 2);
    cal.phases[gear] = best.c.phases[gear];
    cal.mount[body] = best.c.mount[body];
  }
  return cal;
};

export const calibratedMechanism = (mech: Mechanism, step = 4) => {
  const samples = prepareSamples(mech, sampleJDs(CALIBRATION_WINDOW[0], CALIBRATION_WINDOW[1], step));
  mech.calibration = calibrate(mech, samples);
  return mech;
};
