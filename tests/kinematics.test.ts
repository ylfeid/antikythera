// Angles from the gear graph: exactness over long spans, and the pin-and-slot
// devices reproducing the Greek epicyclic theories.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Kinematics, pinSlotDelta, turnsOf, yearsFromDays } from '../src/model/kinematics.ts';
import { LUNAR_MAX_EQUATION_DEG, LUNAR_OFFSET_MM, LUNAR_PIN_MM, SUPERIOR_PIN_SLOT } from '../src/model/gears.ts';
import { Q, q } from '../src/model/rational.ts';

const kin = new Kinematics();
const close = (a: number, b: number, tol: number, msg?: string) =>
  assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);
const wrapTurns = (x: number) => x - Math.round(x);
const RAD = Math.PI / 180;

test('pin-and-slot equals the epicycle equation of centre', () => {
  // Carman, Thorndike & Evans 2012: tan q = (e/r) sin α / (1 − (e/r) cos α).
  const k = LUNAR_OFFSET_MM / LUNAR_PIN_MM;
  let maxQ = 0;
  for (let i = 0; i < 3600; i++) {
    const a = i / 3600;
    const qq = pinSlotDelta(a, LUNAR_OFFSET_MM, LUNAR_PIN_MM) * 360;
    const ref = (Math.atan2(k * Math.sin(a * 2 * Math.PI), 1 - k * Math.cos(a * 2 * Math.PI)) * 180) / Math.PI;
    close(qq, ref, 1e-9);
    maxQ = Math.max(maxQ, Math.abs(qq));
  }
  close(maxQ, LUNAR_MAX_EQUATION_DEG, 0.002, 'maximum lunar equation');
});

test('mean angles stay exact after a million years', () => {
  // T = 1,000,000 years exactly: every gear with an integer-over-19 rate
  // lands on a predictable fraction. A float accumulation would not.
  const T = q(1_000_000);
  const m = kin.meanTurns(T);
  const idx = (id: string) => turnsOf(m, id);
  close(idx('b3'), (254_000_000 % 19) / 19, 1e-15, 'Moon: 254e6/19 mod 1');
  close(idx('n1'), 1 - (5_000_000 % 19) / 19, 1e-15, 'Metonic arbor');
  close(idx('b1'), 0, 0);
});

test('the true Moon oscillates about the mean Moon by ±6.53° with the anomalistic period', () => {
  const means: number[] = [];
  const dev: number[] = [];
  for (let d = 0; d < 400; d += 0.25) {
    const T = yearsFromDays(d);
    const mean = kin.meanTurns(T);
    const full = kin.propagate(mean);
    means.push(turnsOf(mean, 'b3'));
    dev.push(wrapTurns(turnsOf(full, 'b3') - turnsOf(mean, 'b3')) * 360);
  }
  close(Math.max(...dev), LUNAR_MAX_EQUATION_DEG, 0.01);
  close(Math.min(...dev), -LUNAR_MAX_EQUATION_DEG, 0.01);
  // Successive maxima are one anomalistic month apart (27.5543 d in 365¼-day years).
  const peaks: number[] = [];
  for (let i = 1; i < dev.length - 1; i++) if (dev[i] > dev[i - 1] && dev[i] >= dev[i + 1] && dev[i] > 6) peaks.push(i * 0.25);
  const spacing = (peaks[peaks.length - 1] - peaks[0]) / (peaks.length - 1);
  close(spacing, (365.25 * 4237) / 56165, 0.05, 'anomalistic month');
});

test('superior planet pin-and-slot reproduces deferent and epicycle', () => {
  // Freeth et al. 2021 Supp. §4.3.3: the output is red′ + black′, a vector of
  // length d turning with the planet's heliocentric motion plus one of length
  // o turning with the mean Sun.
  for (const [gear5, out, body] of [
    ['sat68', 'sat86', 'saturn'],
    ['jup43', 'jup65', 'jupiter'],
    ['mars71', 'mars80', 'mars'],
  ] as const) {
    const { offset: o, pin: d, angle } = SUPERIOR_PIN_SLOT[body];
    // Slot axis direction in kinematic (clockwise) degrees.
    const dir = -angle;
    const diffs: number[] = [];
    for (let k = 0; k < 200; k++) {
      const T = Q.fromNumber(k * 0.137);
      const g = kin.evaluate(T);
      const cp = turnsOf(g, 'b1') * 360;
      const alpha = (turnsOf(g, gear5) - turnsOf(g, 'b1')) * 360;
      // Reflecting in the line through the slot axis turns g7's reversed
      // motion into heliocentric motion plus the Sun vector (Freeth's mirrors).
      const helio = cp + 2 * dir - alpha;
      const sun = cp + dir + 180;
      const theory = Math.atan2(d * Math.sin(helio * RAD) + o * Math.sin(sun * RAD), d * Math.cos(helio * RAD) + o * Math.cos(sun * RAD)) / RAD;
      diffs.push(wrapTurns((turnsOf(g, out) * 360 - theory) / 360) * 360);
    }
    const spread = Math.max(...diffs) - Math.min(...diffs);
    close(spread, 0, 1e-8, `${body}: mechanism minus epicycle theory must be constant`);
  }
});

test('assembly phases propagate down the train', () => {
  const T = q(3, 7);
  const base = kin.evaluate(T);
  const shifted = kin.evaluate(T, { c1: 0.01 });
  // c1 → c2 → d1 (×−48/24) → d2 → e2 (×−127/32): b3 moves by 0.01·2·127/32·…
  const db3 = turnsOf(shifted, 'b3') - turnsOf(base, 'b3');
  assert.ok(Math.abs(db3) > 1e-4);
  // A phase on the Metonic arbor does not touch the Moon.
  const met = kin.evaluate(T, { n1: 0.2 });
  close(turnsOf(met, 'b3'), turnsOf(base, 'b3'), 1e-12);
  close(turnsOf(met, 'o1') - turnsOf(base, 'o1'), -0.2 * (57 / 60), 1e-12);
});

test('3D layout: every mesh sits at the sum of its pitch radii', async () => {
  const { meshDistanceErrors } = await import('../src/model/layout.ts');
  const { EDGES } = await import('../src/model/gears.ts');
  for (const e of meshDistanceErrors(EDGES)) {
    // k2~e6 is 0.2 mm short with the measured radii: the original's modules
    // were adjusted so e6 lands on axis e (Freeth et al. 2021, Supp. §4.2.1).
    const tol = e.a === 'k2' ? 0.25 : 0.05;
    assert.ok(Math.abs(e.error) <= tol, `${e.a}~${e.b} off by ${e.error.toFixed(3)} mm`);
  }
});
