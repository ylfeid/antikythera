// Modern reference positions from Astronomy Engine (VSOP87 planets, NAO 1954 /
// Brown lunar theory, Espenak–Meeus ΔT). Everything is geocentric, apparent,
// in the true ecliptic and equinox of date, i.e. tropical longitude, which is
// the frame of the Mechanism's zodiac.

import * as Astronomy from 'astronomy-engine';
import { J2000 } from './calendar.ts';

export type Body = 'sun' | 'moon' | 'mercury' | 'venus' | 'mars' | 'jupiter' | 'saturn' | 'nodes';

export const BODIES: Body[] = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'nodes'];

export const BODY_NAME: Record<Body, string> = {
  sun: 'Sun',
  moon: 'Moon',
  mercury: 'Mercury',
  venus: 'Venus',
  mars: 'Mars',
  jupiter: 'Jupiter',
  saturn: 'Saturn',
  nodes: 'Ascending node',
};

const ENGINE_BODY = {
  mercury: Astronomy.Body.Mercury,
  venus: Astronomy.Body.Venus,
  mars: Astronomy.Body.Mars,
  jupiter: Astronomy.Body.Jupiter,
  saturn: Astronomy.Body.Saturn,
} as const;

export const timeOf = (jd: number) => Astronomy.MakeTime(jd - J2000);

// Mean ascending node of the Moon (Meeus, Astronomical Algorithms, 47.7). The
// Dragon Hand models a uniformly regressing node, so the mean node is the fair
// comparison; the true node oscillates about it by ±1.5°.
export const meanNode = (jd: number) => {
  const T = (jd - J2000) / 36525;
  return 125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + (T * T * T) / 467441 - (T * T * T * T) / 60616000;
};

export const longitude = (body: Body, jd: number): number => {
  const t = timeOf(jd);
  let lon: number;
  if (body === 'sun') lon = Astronomy.SunPosition(t).elon;
  else if (body === 'moon') lon = Astronomy.EclipticGeoMoon(t).lon;
  else if (body === 'nodes') lon = meanNode(jd);
  else lon = Astronomy.Ecliptic(Astronomy.GeoVector(ENGINE_BODY[body], t, true)).elon;
  return ((lon % 360) + 360) % 360;
};

export const allLongitudes = (jd: number) => Object.fromEntries(BODIES.map((b) => [b, longitude(b, jd)])) as Record<Body, number>;

// Mean periods (days) used to build the "ideal gearing" comparison: the same
// geometric theories with exact modern mean motions. J2000 values; their
// secular change over two millennia is far below the effects studied here.
export const MODERN = {
  tropicalYear: 365.242190,
  tropicalMonth: 27.321582,
  anomalisticMonth: 27.554550,
  draconicMonth: 27.212221,
  synodicMonth: 29.530589,
  synodic: { mercury: 115.8775, venus: 583.9214, mars: 779.9361, jupiter: 398.884, saturn: 378.0919 },
} as const;

export { Astronomy };
