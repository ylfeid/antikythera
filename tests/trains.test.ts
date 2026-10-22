// Every gear train yields exactly the period relation the literature states.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RATES, solveRates } from '../src/model/kinematics.ts';
import { GEARS, EDGES } from '../src/model/gears.ts';
import { TRAINS } from '../src/model/trains.ts';
import { q, Q } from '../src/model/rational.ts';

const r = (id: string) => RATES.get(id)!;
const eq = (a: Q, b: Q, msg: string) => assert.equal(a.toString(), b.toString(), msg);

test('every gear is reachable and has a rational rate', () => {
  for (const g of GEARS) assert.ok(RATES.has(g.id), `missing rate for ${g.id}`);
});

test('69 gears: 30 surviving, 39 reconstructed (Freeth et al. 2021)', () => {
  assert.equal(GEARS.length, 69);
  assert.equal(GEARS.filter((g) => g.status === 'surviving').length, 30);
  const byFragment = (f: string) => GEARS.filter((g) => g.fragment === f).length;
  assert.equal(byFragment('A'), 27);
  assert.equal(byFragment('B'), 1);
  assert.equal(byFragment('C'), 1);
  assert.equal(byFragment('D'), 1);
  for (const g of GEARS) {
    if (g.status === 'reconstructed') assert.ok(g.confidence, `${g.id} needs a confidence level`);
    assert.ok(g.source.length > 0, `${g.id} needs a source`);
  }
});

test('lunar trains: Metonic sidereal and synodic months, anomaly', () => {
  eq(r('b3'), q(254, 19), 'sidereal Moon: 254 sidereal months in 19 years');
  eq(r('b3').sub(r('b1')), q(235, 19), 'synodic months: 235 in 19 years');
  eq(r('e3'), q(-477, 4237), 'line of apsides: 9·53/(19·223), retrograde gear sense');
  eq(r('b3').add(r('e3')), q(56165, 4237), 'anomalistic months per year');
  // The phase ball turns once per synodic month relative to the Moon pointer.
  eq(r('ma1').sub(r('b3')), q(235, 19), 'moon phase differential');
});

test('calendar dials', () => {
  eq(r('n1'), q(-5, 19), 'Metonic: 5 turns in 19 years');
  eq(r('n1').mul(q(-47)), q(235, 19), '47 months per spiral turn');
  eq(r('q1'), q(-1, 76), 'Callippic: one turn in 76 years');
  eq(r('o1'), q(1, 4), 'Olympiad: one turn in 4 years');
  // 76 Callippic years of 365¼ days are exactly 27,759 days.
  eq(q(76).mul(q(1461, 4)), q(27759), 'Callippic day count');
});

test('eclipse dials', () => {
  eq(r('g1'), q(-940, 4237), 'Saros pointer');
  eq(r('g1').mul(q(-223, 4)), q(235, 19), 'four turns per 223 synodic months');
  eq(r('i1').mul(q(-669)), q(235, 19), 'Exeligmos: one turn per 669 months');
});

test('2021 Cosmos: planetary period relations', () => {
  eq(r('merc20').sub(r('b1')), q(1513, 480), 'Mercury (1513, 480)');
  eq(r('r1').sub(r('b1')), q(289, 462), 'Venus (289, 462)');
  eq(Q.ONE.sub(r('mars80')), q(133, 284), 'Mars (133, 284)');
  eq(Q.ONE.sub(r('jup65')), q(315, 344), 'Jupiter (315, 344)');
  eq(Q.ONE.sub(r('sat86')), q(427, 442), 'Saturn (427, 442)');
  eq(r('nodes48'), q(-5, 93), 'Dragon Hand −5/93');
  eq(r('sun56'), Q.ZERO, 'true-Sun epicycle gear stands still');
});

test('the planetary pin gears turn at the synodic rate relative to the plate', () => {
  eq(r('sat68').sub(r('b1')), q(427, 442), 'Saturn g5');
  eq(r('jup43').sub(r('b1')), q(315, 344), 'Jupiter g5');
  eq(r('mars71').sub(r('b1')), q(133, 284), 'Mars g5');
});

test('train table is consistent with the graph', () => {
  for (const t of TRAINS) {
    const rel = t.relation();
    assert.ok(rel.cycles.d === 1n && rel.years.d === 1n, `${t.name} relation must be integral`);
  }
  const venus = TRAINS.find((t) => t.name === 'Venus')!.relation();
  assert.equal(`${venus.cycles}/${venus.years}`, '289/462');
});

test('an inconsistent graph is rejected', () => {
  const broken = [...EDGES, { kind: 'arbor' as const, a: 'b1', b: 'b3' }];
  assert.throws(() => solveRates(broken), /inconsistent/);
});
