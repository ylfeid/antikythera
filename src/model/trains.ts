// The gear trains as the user sees them: which pointer, which gears, and the
// exact period relation the teeth produce. Ratios are read off the solved
// rational rates, never typed in, so the README and UI cannot drift from the
// gear graph.

import { RATES } from './kinematics.ts';
import { Q } from './rational.ts';
import type { TrainId } from './gears.ts';

export interface Train {
  id: TrainId;
  name: string;
  output: string; // gear (or pseudo-output) whose rotation is shown
  path: string; // human-readable gear chain
  display: string; // what the pointer shows
  // The relation as cycles per years, derived from the rates.
  relation: () => { cycles: Q; years: Q; label: string };
  meaning: string;
  source: string;
}

const rate = (id: string) => RATES.get(id)!;
const abs = (x: Q) => (x.n < 0n ? x.neg() : x);

// cycles per `years`, chosen so both are integers.
const perYears = (r: Q, label: string) => ({ cycles: Q.of(abs(r).n), years: Q.of(abs(r).d), label });

export const TRAINS: Train[] = [
  {
    id: 'moon',
    name: 'Moon (sidereal)',
    output: 'b3',
    path: 'b1+b2 ~ c1+c2 ~ d1+d2 ~ e2+e5 ~ k1 ⊕ k2 ~ e6+e1 ~ b3',
    display: 'Moon pointer on the zodiac',
    relation: () => perYears(rate('b3'), 'sidereal months'),
    meaning: '254 sidereal months in 19 years: (64/38)·(48/24)·(127/32) = 254/19. The Metonic cycle stated for the sidereal month.',
    source: 'Freeth et al. 2006',
  },
  {
    id: 'moon',
    name: 'Lunar apsides (e3)',
    output: 'e3',
    path: 'b1+b2 ~ l1+l2 ~ m1+m3 ~ e3',
    display: 'Turns the pin-and-slot carrier, so the anomaly has the anomalistic period',
    relation: () => perYears(rate('e3'), 'turns of the line of apsides'),
    meaning: '(64/38)·(53/96)·(27/223) = 9·53/(19·223): the difference between sidereal and anomalistic months, from the Metonic and Saros cycles. One turn in 8.88 years.',
    source: 'Freeth et al. 2006',
  },
  {
    id: 'moon',
    name: 'Moon (anomalistic)',
    output: 'k1',
    path: 'e5 relative to e3',
    display: 'Phase of the lunar anomaly',
    relation: () => perYears(rate('b3').sub(rate('e3').neg()), 'anomalistic months'),
    meaning: '254/19 − 477/4237 = 56165/4237 anomalistic months per year.',
    source: 'Freeth et al. 2006',
  },
  {
    id: 'phase',
    name: 'Moon phase (synodic)',
    output: 'ma1',
    path: 'b3 − b0 (differential through contrate ma1)',
    display: 'Half-silvered phase ball',
    relation: () => perYears(rate('b3').sub(rate('b1')), 'synodic months'),
    meaning: '254/19 − 1 = 235/19: the Metonic 235 synodic months in 19 years.',
    source: 'Freeth et al. 2006; Freeth et al. 2021',
  },
  {
    id: 'metonic',
    name: 'Metonic calendar',
    output: 'n1',
    path: 'b1+b2 ~ l1+l2 ~ m1+m2 ~ n1',
    display: '235-month five-turn spiral (19 years)',
    relation: () => perYears(rate('n1'), 'turns'),
    meaning: '(64/38)·(53/96)·(15/53) = 5/19: five turns of the spiral, 47 months each, in 19 years.',
    source: 'Freeth et al. 2006; Freeth et al. 2008',
  },
  {
    id: 'callippic',
    name: 'Callippic dial',
    output: 'q1',
    path: 'n1+n3 ~ p1+p2 ~ q1',
    display: '76-year dial in four sectors',
    relation: () => perYears(rate('q1'), 'turns'),
    meaning: '(5/19)·(15/60)·(12/60) = 1/76: four Metonic cycles less one day.',
    source: 'Freeth et al. 2006; Freeth et al. 2008',
  },
  {
    id: 'olympiad',
    name: 'Olympiad dial',
    output: 'o1',
    path: 'n1+n2 ~ o1',
    display: 'Four-year games dial',
    relation: () => perYears(rate('o1'), 'turns'),
    meaning: '(5/19)·(57/60) = 1/4: one turn per Olympiad.',
    source: 'Freeth et al. 2008',
  },
  {
    id: 'saros',
    name: 'Saros eclipse dial',
    output: 'g1',
    path: 'm1+m3 ~ e3+e4 ~ f1+f2 ~ g1',
    display: '223-month four-turn spiral with eclipse glyphs',
    relation: () => perYears(rate('g1'), 'turns'),
    meaning: '(9·53/(19·223))·(188/53)·(30/54) = 940/4237: four turns per 223 synodic months, since 940/4237 × 223/4 = 235/19.',
    source: 'Freeth et al. 2006',
  },
  {
    id: 'exeligmos',
    name: 'Exeligmos dial',
    output: 'i1',
    path: 'g1+g2 ~ h1+h2 ~ i1',
    display: 'Three-sector dial: add 0, 8 or 16 hours to glyph times',
    relation: () => perYears(rate('i1'), 'turns'),
    meaning: '(940/4237)·(20/60)·(15/60) = 235/12711: one turn in three Saros cycles (669 months).',
    source: 'Freeth et al. 2006',
  },
  {
    id: 'nodes',
    name: 'Lunar nodes (Dragon Hand)',
    output: 'nodes48',
    path: '49 ~ 62+64 ~ 48 on b1',
    display: 'Double-ended Dragon Hand',
    relation: () => perYears(rate('nodes48'), 'turns (retrograde)'),
    meaning: '1 − (49·64)/(62·48) = −5/93: backwards once in 18.6 years. Speculative: no direct evidence.',
    source: 'Freeth et al. 2021',
  },
  {
    id: 'mercury',
    name: 'Mercury',
    output: 'merc20',
    path: '51 ~ 72+89 ~ 40 ~ 20 ⊕ follower',
    display: 'Mercury ring',
    relation: () => perYears(rate('merc20').sub(rate('b1')), 'synodic cycles'),
    meaning: '(51/72)·(89/20) = 1513/480: 1513 = 17·89 synodic cycles in 480 years.',
    source: 'Freeth et al. 2021',
  },
  {
    id: 'venus',
    name: 'Venus',
    output: 'r1',
    path: '51 ~ 44+34 ~ 26 ~ 63 ⊕ follower',
    display: 'Venus ring',
    relation: () => perYears(rate('r1').sub(rate('b1')), 'synodic cycles'),
    meaning: '(51/44)·(34/63) = 289/462 = 17²/(2·3·7·11), the period read from the Front Cover Inscription (462).',
    source: 'Freeth et al. 2021',
  },
  {
    id: 'sun',
    name: 'True Sun',
    output: 'sun56',
    path: '56 ~ 52 ~ 56 ⊕ follower',
    display: 'Sun ring with golden sphere',
    relation: () => perYears(rate('b1'), 'years'),
    meaning: 'The last 56 is held still in space, so its pin keeps the apogee direction fixed while the plate carries it round: the eccentric solar theory.',
    source: 'Freeth et al. 2021',
  },
  {
    id: 'mars',
    name: 'Mars',
    output: 'mars80',
    path: '56 ~ 64+38 ~ 40 ~ 71 ⊕ 80 ~ 80',
    display: 'Mars ring',
    relation: () => perYears(Q.ONE.sub(rate('mars80')), 'synodic cycles'),
    meaning: '(56/64)·(38/71) = 133/284: 133 = 7·19 synodic cycles in 284 years. Output 1 − 133/284 = 151/284 turns per year.',
    source: 'Freeth et al. 2021',
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    output: 'jup65',
    path: '56 ~ 64+45 ~ 40 ~ 43 ⊕ 65 ~ 65',
    display: 'Jupiter ring',
    relation: () => perYears(Q.ONE.sub(rate('jup65')), 'synodic cycles'),
    meaning: '(56/64)·(45/43) = 315/344: 315 = 3²·5·7 synodic cycles in 344 years.',
    source: 'Freeth et al. 2021',
  },
  {
    id: 'saturn',
    name: 'Saturn',
    output: 'sat86',
    path: '56 ~ 52+61 ~ 40 ~ 68 ⊕ 86 ~ 86',
    display: 'Saturn ring',
    relation: () => perYears(Q.ONE.sub(rate('sat86')), 'synodic cycles'),
    meaning: '(56/52)·(61/68) = 427/442, read from the Front Cover Inscription (442).',
    source: 'Freeth et al. 2021',
  },
];
