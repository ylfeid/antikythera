// The Eclipse Year Model regenerates the Saros dial glyphs (Freeth 2014).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLYPHS, GLYPH_BY_MONTH, nodeDistance, fullMoonEYu, newMoonEYu } from '../src/model/eclipses.ts';

test('51 glyphs: 38 lunar and 28 solar predictions', () => {
  assert.equal(GLYPHS.length, 51);
  assert.equal(GLYPHS.filter((g) => g.lunar).length, 38);
  assert.equal(GLYPHS.filter((g) => g.solar).length, 28);
});

test('glyphs discussed in Freeth 2014', () => {
  // Glyph 13 is solar, 20 EYu before the descending node point, hence north.
  const g13 = GLYPH_BY_MONTH.get(13)!;
  assert.ok(g13.solar && !g13.lunar);
  assert.equal(newMoonEYu(13), 46);
  assert.equal(nodeDistance(46).distance, 20);
  // Glyph 78: a solar eclipse (the worked example in the paper).
  assert.ok(GLYPH_BY_MONTH.get(78)!.solar);
  // Glyph 149 is both Σ and Η in EYM.
  const g149 = GLYPH_BY_MONTH.get(149)!;
  assert.ok(g149.lunar && g149.solar);
});

test('integer positions within the eclipse year', () => {
  assert.equal(fullMoonEYu(1), 17);
  assert.equal(newMoonEYu(1), 36);
  // 223 months later the pattern repeats exactly: 223·38 = 19·446.
  assert.equal((223 * 38) % 446, 0);
  // New Moon positions over a Saros hit every other EYu exactly once (Freeth
  // counts units from 1 and calls them the odd numbers 1–445; counted from 0
  // as here they are the even numbers 0–444).
  const pos = new Set(Array.from({ length: 223 }, (_, i) => newMoonEYu(i + 1)));
  assert.equal(pos.size, 223);
  for (const p of pos) assert.equal(p % 2, 0);
});

test('lunar predictions follow the Babylonian 6- and 5-month spacing', () => {
  const months = GLYPHS.filter((g) => g.lunar).map((g) => g.month);
  for (let i = 1; i < months.length; i++) assert.ok([5, 6].includes(months[i] - months[i - 1]), `gap at ${months[i]}`);
  // Wrapping into the next Saros.
  assert.ok([5, 6].includes(months[0] + 223 - months[months.length - 1]));
});
