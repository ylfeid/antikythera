// Saros dial predictions against the real eclipses.
//
// For every actual Full and New Moon in the range, read the Saros dial cell the
// mechanism's pointer is in at that instant and compare its glyph (Σ lunar,
// Η solar) with what Astronomy Engine says happened. Like Babylonian schemes,
// the dial predicts eclipse possibilities, not visibility, so the primary
// score counts eclipses anywhere on Earth; lunar eclipses seen from Rhodes are
// reported as well.

import { Astronomy, timeOf } from '../model/ephemeris.ts';
import { J2000 } from '../model/calendar.ts';
import { Mechanism, EPOCH_JD } from '../model/mechanism.ts';

export const RHODES = new Astronomy.Observer(36.43, 28.22, 0);

export type LunarKind = 'penumbral' | 'partial' | 'total';
export type SolarKind = 'partial' | 'annular' | 'total' | 'hybrid';

export interface Syzygy {
  jd: number;
  type: 'full' | 'new';
  lunation: number; // whole lunations since FM1 (full) or NM before it (new)
  sarosMonth: number; // 1–223, cell under the pointer
  predicted: boolean;
  actual: LunarKind | SolarKind | null;
  visibleRhodes?: boolean;
}

const jdOf = (t: { ut: number }) => t.ut + J2000;

const phasesBetween = (target: 0 | 180, from: number, to: number) => {
  const out: number[] = [];
  let t = from;
  for (;;) {
    const r = Astronomy.SearchMoonPhase(target, timeOf(t), 40);
    if (!r) break;
    const jd = jdOf(r);
    if (jd > to) break;
    out.push(jd);
    t = jd + 20;
  }
  return out;
};

const lunarEclipses = (from: number, to: number) => {
  const out: { jd: number; kind: LunarKind; visibleRhodes: boolean }[] = [];
  let e = Astronomy.SearchLunarEclipse(timeOf(from));
  while (jdOf(e.peak) <= to) {
    const eq = Astronomy.Equator(Astronomy.Body.Moon, e.peak, RHODES, true, true);
    const hor = Astronomy.Horizon(e.peak, RHODES, eq.ra, eq.dec, 'normal');
    out.push({ jd: jdOf(e.peak), kind: e.kind as LunarKind, visibleRhodes: hor.altitude > 0 && e.kind !== 'penumbral' });
    e = Astronomy.NextLunarEclipse(e.peak);
  }
  return out;
};

const solarEclipses = (from: number, to: number) => {
  const out: { jd: number; kind: SolarKind }[] = [];
  let e = Astronomy.SearchGlobalSolarEclipse(timeOf(from));
  while (jdOf(e.peak) <= to) {
    out.push({ jd: jdOf(e.peak), kind: e.kind as SolarKind });
    e = Astronomy.NextGlobalSolarEclipse(e.peak);
  }
  return out;
};

export const checkEclipses = (mech: Mechanism, from: number, to: number): Syzygy[] => {
  const lunar = lunarEclipses(from - 2, to + 2);
  const solar = solarEclipses(from - 2, to + 2);
  const out: Syzygy[] = [];
  const near = <T extends { jd: number }>(list: T[], jd: number) => list.find((e) => Math.abs(e.jd - jd) < 1.5);
  const synodic = 29.530589;
  for (const type of ['full', 'new'] as const) {
    for (const jd of phasesBetween(type === 'full' ? 180 : 0, from, to)) {
      const dial = mech.dials(mech.yearsAt(jd));
      const cell = Math.floor(dial.sarosMonth) + 1;
      const glyph = dial.glyph;
      const predicted = type === 'full' ? !!glyph?.lunar : !!glyph?.solar;
      const lunation = Math.round((jd - EPOCH_JD - (type === 'new' ? synodic / 2 : 0)) / synodic);
      if (type === 'full') {
        const e = near(lunar, jd);
        out.push({ jd, type, lunation, sarosMonth: cell, predicted, actual: e?.kind ?? null, visibleRhodes: e?.visibleRhodes ?? false });
      } else {
        const e = near(solar, jd);
        let visibleRhodes = false;
        if (e) {
          // Seen from Rhodes: some obscuration with the Sun above the horizon.
          const local = Astronomy.SearchLocalSolarEclipse(timeOf(jd - 2), RHODES);
          visibleRhodes = Math.abs(jdOf(local.peak.time) - jd) < 1.5 && local.obscuration > 0 && local.peak.altitude > 0;
        }
        out.push({ jd, type, lunation, sarosMonth: cell, predicted, actual: e?.kind ?? null, visibleRhodes });
      }
    }
  }
  return out.sort((a, b) => a.jd - b.jd);
};

export interface EclipseScore {
  predicted: number;
  hits: number; // predicted and an eclipse happened (lunar: umbral)
  penumbralOnly: number; // lunar predictions that produced only a penumbral eclipse
  falseAlarms: number;
  misses: number; // eclipse happened (lunar: umbral) but no glyph
  actual: number;
}

export const score = (s: Syzygy[], type: 'full' | 'new', filter: (x: Syzygy) => boolean = () => true): EclipseScore => {
  const xs = s.filter((x) => x.type === type && filter(x));
  const counts = (x: Syzygy) => (type === 'full' ? x.actual === 'partial' || x.actual === 'total' : x.actual !== null);
  const r: EclipseScore = { predicted: 0, hits: 0, penumbralOnly: 0, falseAlarms: 0, misses: 0, actual: 0 };
  for (const x of xs) {
    if (x.predicted) r.predicted++;
    if (counts(x)) r.actual++;
    if (x.predicted && counts(x)) r.hits++;
    else if (x.predicted && x.actual === 'penumbral') r.penumbralOnly++;
    else if (x.predicted) r.falseAlarms++;
    else if (counts(x)) r.misses++;
  }
  return r;
};

// Saros cycle index relative to the dial start (0 = the cycle that begins at
// the epoch, −1 the one before).
export const sarosCycle = (x: Syzygy) => Math.floor(x.lunation / 223);
