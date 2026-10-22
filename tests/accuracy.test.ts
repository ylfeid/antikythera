// End-to-end: calibrate against the ephemeris, then check the mechanism's
// errors and eclipse predictions against bounds and against published values.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Mechanism, EPOCH_JD } from '../src/model/mechanism.ts';
import { julianToJD } from '../src/model/calendar.ts';
import { longitude } from '../src/model/ephemeris.ts';
import { calibratedMechanism, sampleJDs } from '../src/analysis/calibrate.ts';
import { errorSeries, stats, driftPerCentury } from '../src/analysis/compare.ts';
import { checkEclipses, score, sarosCycle } from '../src/analysis/eclipseCheck.ts';
import { simulate, EDMUNDS_CASES, makeMeshError, rng } from '../src/analysis/montecarlo.ts';
import { Astronomy, timeOf } from '../src/model/ephemeris.ts';
import { FRONT_AXES, angleOf } from '../src/model/layout.ts';
import savedCalibration from '../src/data/calibration.json' with { type: 'json' };

const mech = calibratedMechanism(new Mechanism(), 8);
const FROM = julianToJD({ year: -250, month: 1, day: 1 });
const TO = julianToJD({ year: -50, month: 1, day: 1 });

test('epoch is the Full Moon of 12 May 205 BC (Freeth 2014)', () => {
  const fm = Astronomy.SearchMoonPhase(180, timeOf(EPOCH_JD - 3), 6)!;
  assert.ok(Math.abs(fm.ut + 2451545 - EPOCH_JD) < 1 / 1440);
});

test('calibrated mean Sun at the epoch agrees with Freeth 2014 (46.75°)', () => {
  // An independent check: Freeth derived 46.75° from the glyph times on the
  // Saros dial; here it comes from fitting the Sun pointer to the ephemeris.
  assert.ok(Math.abs(mech.calibration.mount.sun - 46.75) < 0.3, `${mech.calibration.mount.sun}`);
  // The inferior planets ride on b1, the mean Sun, so their fitted settings
  // must agree with it once the drawing angle of each epicycle axis is added.
  const wrap = (x: number) => x - 360 * Math.round(x / 360);
  const m = mech.calibration.mount;
  assert.ok(Math.abs(wrap(m.venus - angleOf(FRONT_AXES.r1) - m.sun)) < 0.5, `venus ${m.venus}`);
  assert.ok(Math.abs(wrap(m.mercury - angleOf(FRONT_AXES.merc20) - m.sun)) < 1, `mercury ${m.mercury}`);
});

test('saved app calibration matches a fresh fit', () => {
  assert.ok(Math.abs(savedCalibration.mount.sun - mech.calibration.mount.sun) < 0.05);
  assert.ok(Math.abs(savedCalibration.mount.moon - mech.calibration.mount.moon) < 0.2);
});

test('longitude errors over 250–50 BC are within the expected bounds', () => {
  const s = errorSeries(mech, sampleJDs(FROM, TO, 15));
  const rms = (b: keyof typeof s.total) => stats(s.total[b]).rms;
  assert.ok(rms('sun') < 1, `sun ${rms('sun')}`);
  assert.ok(rms('moon') < 5, `moon ${rms('moon')}`);
  assert.ok(rms('venus') < 3, `venus ${rms('venus')}`);
  // Freeth & Jones (2012) report the Mars pointer up to 38° out near retrograde.
  const mars = stats(s.total.mars).maxAbs;
  assert.ok(mars > 25 && mars < 45, `mars max ${mars}`);
  // Period drifts: the 365¼-day year loses 0.77° per century against the
  // tropical Sun; the Metonic month is 2 hours long per cycle.
  const sunDrift = driftPerCentury(s.jd, s.periods.sun);
  assert.ok(Math.abs(sunDrift + 0.77) < 0.05, `sun drift ${sunDrift}`);
  const moonDrift = driftPerCentury(s.jd, s.periods.moon);
  assert.ok(moonDrift < -3 && moonDrift > -7, `moon drift ${moonDrift}`);
  // The theories alone, with perfect periods, keep the Sun within half a degree.
  assert.ok(stats(s.theory.sun).maxAbs < 0.5);
});

test('dials at the epoch', () => {
  const d = mech.dials(mech.yearsAt(EPOCH_JD));
  assert.equal(Math.floor(d.sarosMonth), 0);
  assert.ok(Math.abs(d.sarosMonth - 17 / 38) < 1e-9);
  assert.equal(Math.floor(d.olympiadYear), 3);
  // At the epoch Full Moon the Moon is opposite the Sun.
  const r = mech.read(EPOCH_JD);
  assert.ok(Math.abs(r.phase - 180) < 8, `phase ${r.phase}`);
  assert.ok(Math.abs(((r.longitude.moon - longitude('moon', EPOCH_JD) + 540) % 360) - 180) < 3);
});

test('Saros dial predicts the eclipses of its own cycle', () => {
  const s = checkEclipses(mech, EPOCH_JD - 20, EPOCH_JD + 6585);
  const own = (x: (typeof s)[number]) => sarosCycle(x) === 0;
  const L = score(s, 'full', own);
  const S = score(s, 'new', own);
  assert.equal(L.predicted, 38);
  assert.equal(S.predicted, 28);
  assert.equal(L.misses, 0, 'no umbral lunar eclipse missed');
  assert.ok(L.hits + L.penumbralOnly >= 36);
  assert.equal(S.hits, 28, 'every solar glyph is followed by a solar eclipse somewhere');
});

test('Monte Carlo: no manufacturing error, no pointer error; seeded runs repeat', () => {
  const perfect = simulate(mech, { id: '0', sigma: 0, systematic: 0 }, 2, { samples: 40 });
  for (const r of perfect) for (const v of Object.values(r.sigma)) assert.ok(v < 1e-9);
  const a = simulate(mech, EDMUNDS_CASES[0], 3, { samples: 60, seed: 5 });
  const b = simulate(mech, EDMUNDS_CASES[0], 3, { samples: 60, seed: 5 });
  assert.deepEqual(a.map((r) => r.sigma), b.map((r) => r.sigma));
  // The lunar train amplifies upstream tooth errors ~13×, so the Moon scatters
  // far more than the slow calendar pointers (Edmunds 2011).
  assert.ok(a[0].sigma.moon > 5 * a[0].sigma.metonic);
  const err = makeMeshError(EDMUNDS_CASES[3], rng(1));
  assert.equal(typeof err({ kind: 'mesh', a: 'b2', b: 'c1', frame: 'main' }, 'b2', 'c1', 0.3), 'number');
});
