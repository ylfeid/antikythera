// Exact rational arithmetic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Q, q, factorize, formatFactors, floorDiv } from '../src/model/rational.ts';

test('normalises sign and common factors', () => {
  const a = q(6, -8);
  assert.equal(a.n, -3n);
  assert.equal(a.d, 4n);
  assert.ok(q(254, 19).eq(q(508, 38)));
});

test('field operations are exact', () => {
  const x = q(64, 38).mul(q(48, 24)).mul(q(127, 32));
  assert.equal(x.toString(), '254/19');
  assert.equal(q(1, 3).add(q(1, 6)).toString(), '1/2');
  assert.equal(q(1, 3).sub(q(1, 2)).toString(), '-1/6');
  assert.equal(q(3, 4).div(q(9, 8)).toString(), '2/3');
  assert.equal(Q.ONE.sub(q(427, 442)).toString(), '15/442');
});

test('floor and fractional part handle negatives', () => {
  assert.equal(floorDiv(-7n, 2n), -4n);
  assert.equal(floorDiv(7n, -2n), -4n);
  assert.equal(q(-7, 2).floor(), -4n);
  assert.equal(q(-7, 2).frac().toString(), '1/2');
  assert.equal(q(22, 7).frac().toString(), '1/7');
});

test('fromNumber is exact for doubles', () => {
  assert.equal(Q.fromNumber(0.5).toString(), '1/2');
  assert.equal(Q.fromNumber(-3.25).toString(), '-13/4');
  assert.equal(Q.fromNumber(0.1).toNumber(), 0.1);
  assert.equal(Q.fromNumber(1646679.04084).toNumber(), 1646679.04084);
});

test('toNumber keeps precision for huge numerators and denominators', () => {
  // A million years of Moon: the fractional turn must still be right.
  const turns = q(254, 19).mul(q(1_000_000));
  assert.equal(turns.frac().toString(), '1/19'); // 254·10⁶ ≡ 1 (mod 19)
  assert.ok(Math.abs(turns.frac().toNumber() - 1 / 19) < 1e-15);
  const big = new Q(10n ** 40n + 1n, 10n ** 40n);
  assert.ok(Math.abs(big.toNumber() - 1) < 1e-15);
});

test('prime factorisation of period relations', () => {
  assert.deepEqual(factorize(462n), [2n, 3n, 7n, 11n]);
  assert.equal(formatFactors(289n), '17²');
  assert.equal(formatFactors(480n), '2⁵·3·5');
  assert.equal(formatFactors(223n), '223');
});
