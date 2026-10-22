// Julian day numbers, the Egyptian calendar and Olympiads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { julianToJD, jdToJulian, egyptianDate, NABONASSAR_EPOCH, olympiadOf, formatJD, formatLongitude } from '../src/model/calendar.ts';

test('Julian calendar to JD (Meeus examples)', () => {
  assert.equal(julianToJD({ year: -4712, month: 1, day: 1.5 }), 0);
  assert.equal(julianToJD({ year: 333, month: 1, day: 27.5 }), 1842713);
  assert.equal(julianToJD({ year: -1000, month: 7, day: 12.5 }), 1356001);
  // J2000.0 is 1 Jan 2000 Gregorian = 19 Dec 1999 Julian, noon.
  assert.equal(julianToJD({ year: 1999, month: 12, day: 19.5 }), 2451545);
});

test('JD round trip', () => {
  for (const jd of [1600000.25, 1646679.04084, 1721423.5, 1700000.9]) {
    const back = julianToJD(jdToJulian(jd));
    assert.ok(Math.abs(back - jd) < 1e-6, `${jd} → ${back}`);
  }
  assert.equal(formatJD(julianToJD({ year: -204, month: 5, day: 12 })), '12 May 205 BC');
});

test('Egyptian calendar: era of Nabonassar', () => {
  const e = egyptianDate(NABONASSAR_EPOCH + 0.3);
  assert.deepEqual([e.year, e.month, e.day], [1, 0, 1]);
  // 365 days later is Thoth 1 of year 2; 360 days after the epoch is the first epagomenal day.
  assert.deepEqual([egyptianDate(NABONASSAR_EPOCH + 365).year, egyptianDate(NABONASSAR_EPOCH + 365).day], [2, 1]);
  assert.equal(egyptianDate(NABONASSAR_EPOCH + 360).month, 12);
  // The Egyptian year slips one day against the Julian every 4 years.
  const a = egyptianDate(julianToJD({ year: -204, month: 5, day: 12 }));
  const b = egyptianDate(julianToJD({ year: -200, month: 5, day: 12 }));
  assert.equal((b.dayOfYear - a.dayOfYear + 365) % 365, 1);
});

test('Olympiads', () => {
  assert.deepEqual(olympiadOf(-775), { olympiad: 1, year: 1 });
  assert.deepEqual(olympiadOf(-203), { olympiad: 144, year: 1 });
  assert.deepEqual(olympiadOf(-204), { olympiad: 143, year: 4 });
});

test('zodiac formatting', () => {
  assert.equal(formatLongitude(46.75), 'Taurus 16°45′');
  assert.equal(formatLongitude(-1), 'Pisces 29°00′');
});
