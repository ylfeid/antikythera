// The gear catalogue and the kinematic graph that connects it.
//
// Every tooth count comes from the literature (see `source` on each entry):
// - behind the main drive wheel b1: Freeth et al. 2006 / 2008, with the measured
//   radii of the 30 surviving gears from Freeth et al. 2021, Supplementary Table S8;
// - in front of b1 (Sun, nodes, planets): Freeth et al. 2021, Fig. 3e,f and
//   Supplementary Discussion S4 / Table S9.
// Gear names follow Freeth et al. 2006/2008 for the surviving system. The 2021
// front gears have no names in the paper; they are named here by train and tooth
// count (merc72 = the 72-tooth gear of the Mercury train).

import type { SourceKey } from './sources.ts';

export type Status = 'surviving' | 'reconstructed';

// How strongly a reconstructed gear is constrained:
// - required: no physical trace, but a surviving dial or scale needs a train with
//   exactly this ratio (e.g. the Callippic and Olympiad dials)
// - modelled: the 2021 Cosmos model; the function is attested by inscriptions,
//   the gearing is the authors' reconstruction under their stated principles
// - speculative: no direct evidence for the function at all (Dragon Hand)
export type Confidence = 'required' | 'modelled' | 'speculative';

export type TrainId =
  | 'drive'
  | 'moon'
  | 'phase'
  | 'metonic'
  | 'callippic'
  | 'olympiad'
  | 'saros'
  | 'exeligmos'
  | 'sun'
  | 'nodes'
  | 'mercury'
  | 'venus'
  | 'mars'
  | 'jupiter'
  | 'saturn';

// Frames in which axes are stationary. 'main' is the case; 'b1' carries the
// front epicyclic systems (the Strap and Circular Plate are fixed to its
// pillars); 'e3' carries the lunar anomaly gears k1, k2; 'b3' is the Moon
// pointer, which carries the moon-phase contrate gear.
export type Frame = 'main' | 'b1' | 'e3' | 'b3';

export interface Measured {
  outerR: number; // mm
  innerR: number; // mm
  pitchR: number; // mm
  thickness: number; // mm
}

export interface Gear {
  id: string;
  teeth: number;
  status: Status;
  confidence?: Confidence; // reconstructed gears only
  train: TrainId;
  role: string;
  evidence: string;
  source: SourceKey[];
  fragment?: 'A' | 'B' | 'C' | 'D';
  measured?: Measured;
  // Mounted on a moving carrier (its axis turns with it).
  frame: Frame;
  contrate?: boolean;
  aliases?: string[];
  countNote?: string;
}

const S8 = (outerR: number, innerR: number, pitchR: number, thickness: number): Measured => ({
  outerR,
  innerR,
  pitchR,
  thickness,
});

const SURVIVING_BACK = 'Fragment A; tooth count and radii from X-ray CT (Freeth et al. 2006; radii from Freeth et al. 2021, Supp. Table S8).';
const LARGE_COUNT =
  'A partially preserved wheel: the count is estimated from the surviving tooth spacing, and the exact value is the one the astronomy requires (Freeth et al. 2006).';
const DIAL_REQUIRED =
  'Lost. The dial it drives survives (scale, spiral or inscriptions), so a train with exactly this ratio must have existed; the tooth count is the generally accepted reconstruction.';

export const GEARS: Gear[] = [
  // ── Drive ──────────────────────────────────────────────────────────────
  {
    id: 'a1', teeth: 48, status: 'surviving', train: 'drive', fragment: 'A', frame: 'main', contrate: true,
    role: 'Input contrate gear on the crank axle, meshing with the rim of b1.',
    evidence: 'Fragment A, at the edge of b1; contrate (crown) gear, so radii are not tabulated.',
    source: ['freeth2006', 'freeth2021'],
  },
  {
    id: 'b1', teeth: 223, status: 'surviving', train: 'drive', fragment: 'A', frame: 'main', measured: S8(65.0, 63.8, 64.4, 2.7),
    role: 'Main drive wheel: one turn per year. Carries the mean Sun, and in the 2021 model the epicyclic systems of the Cosmos on its four spokes and pillars.',
    evidence: 'The large four-spoked wheel visible on the front of Fragment A. Bearings, a pierced block and pillar stubs on its spokes are the physical evidence for lost gearing in front of it.',
    source: ['price1974', 'freeth2006', 'freeth2021'],
    countNote: 'Partially preserved; counted as 223 in Freeth et al. 2021 Table S8 (224 has also been proposed). It only meshes with the crank, so the count does not affect any output.',
  },
  {
    id: 'b2', teeth: 64, status: 'surviving', train: 'drive', fragment: 'A', frame: 'main', measured: S8(15.7, 15.0, 15.3, 2.3),
    role: 'On the b1 arbor behind the main plate; drives both the lunar train (c1) and the calendar trains (l1).',
    evidence: SURVIVING_BACK, source: ['freeth2006', 'freeth2021'],
  },
  // ── Lunar train ───────────────────────────────────────────────────────
  {
    id: 'c1', teeth: 38, status: 'surviving', train: 'moon', fragment: 'A', frame: 'main', measured: S8(10.3, 9.4, 9.8, 1.5),
    role: 'Lunar train, first stage: 64/38. 38 = 2·19 brings in the Metonic 19.',
    evidence: SURVIVING_BACK, source: ['freeth2006', 'freeth2021'],
  },
  {
    id: 'c2', teeth: 48, status: 'surviving', train: 'moon', fragment: 'A', frame: 'main', measured: S8(11.0, 10.5, 10.7, 1.3),
    role: 'Lunar train, second stage: 48/24.', evidence: SURVIVING_BACK, source: ['freeth2006', 'freeth2021'],
  },
  {
    id: 'd1', teeth: 24, status: 'surviving', train: 'moon', fragment: 'A', frame: 'main', measured: S8(5.8, 5.1, 5.4, 2.4),
    role: 'Lunar train, second stage.', evidence: SURVIVING_BACK, source: ['freeth2006', 'freeth2021'],
  },
  {
    id: 'd2', teeth: 127, status: 'surviving', train: 'moon', fragment: 'A', frame: 'main', measured: S8(31.7, 30.6, 31.2, 1.3),
    role: 'Lunar train, third stage: 127/32. 127 = 254/2, the number of sidereal months in 19 years.',
    evidence: SURVIVING_BACK, source: ['freeth2006', 'freeth2021'], countNote: LARGE_COUNT,
  },
  {
    id: 'e2', teeth: 32, status: 'surviving', train: 'moon', fragment: 'A', frame: 'main', measured: S8(7.8, 7.1, 7.4, 1.0),
    role: 'Turns at the mean sidereal Moon rate, 254/19 turns per year; same arbor as e5.',
    evidence: SURVIVING_BACK, source: ['freeth2006', 'freeth2021'],
  },
  {
    id: 'e5', teeth: 50, status: 'surviving', train: 'moon', fragment: 'A', frame: 'main', measured: S8(13.1, 12.2, 12.6, 0.5),
    role: 'Input to the pin-and-slot: meshes with k1, which rides on e3.', evidence: SURVIVING_BACK, source: ['freeth2006', 'freeth2021'],
  },
  {
    id: 'k1', teeth: 50, status: 'surviving', train: 'moon', fragment: 'A', frame: 'e3', measured: S8(13.3, 12.6, 13.0, 0.6),
    role: 'Pin gear of the lunar anomaly: carries a pin that engages a slot in k2. Mounted on e3.',
    evidence: 'Fragment A. The pin on k1 and the slot in k2 are visible in the CT; their axes are offset by about 1.1 mm (Freeth et al. 2006).',
    source: ['freeth2006', 'freeth2021'],
  },
  {
    id: 'k2', teeth: 50, status: 'surviving', train: 'moon', fragment: 'A', frame: 'e3', measured: S8(14.0, 13.1, 13.5, 0.5),
    role: 'Slot gear of the lunar anomaly: driven by the pin on k1 about an axis 1.1 mm away, so it turns at a varying rate.',
    evidence: 'Fragment A, with the slot and its supporting bridge (Freeth et al. 2006; Freeth & Jones 2012).',
    source: ['freeth2006', 'freethJones2012', 'freeth2021'],
  },
  {
    id: 'e6', teeth: 50, status: 'surviving', train: 'moon', fragment: 'A', frame: 'main', measured: S8(13.9, 12.9, 13.4, 0.6),
    role: 'Takes the varying lunar motion back to the central e axis.', evidence: SURVIVING_BACK, source: ['freeth2006', 'freeth2021'],
  },
  {
    id: 'e1', teeth: 32, status: 'surviving', train: 'moon', fragment: 'A', frame: 'main', measured: S8(9.7, 8.6, 9.2, 1.3),
    role: 'Same arbor as e6; passes the true Moon to b3 at 1:1.', evidence: SURVIVING_BACK, source: ['freeth2006', 'freeth2021'],
  },
  {
    id: 'b3', teeth: 32, status: 'surviving', train: 'moon', fragment: 'A', frame: 'main', measured: S8(9.2, 8.3, 8.7, 1.3),
    role: 'On the central arbor: turns the Moon pointer on the zodiac.', evidence: SURVIVING_BACK, source: ['freeth2006', 'freeth2021'],
  },
  // ── Moon phase ────────────────────────────────────────────────────────
  {
    id: 'b0', teeth: 20, status: 'reconstructed', confidence: 'modelled', train: 'phase', frame: 'main',
    role: 'Mean-Sun input to the moon-phase differential, on a tube fixed by a bar to the pierced block on spoke D of b1.',
    evidence: 'Hypothetical. Its tooth count matches the surviving contrate gear it must drive (Freeth et al. 2021, Supp. §6.2.6).',
    source: ['freeth2021'],
  },
  {
    id: 'ma1', teeth: 20, status: 'surviving', train: 'phase', fragment: 'C', frame: 'b3', contrate: true,
    role: 'Contrate gear on the Moon pointer: turns the half-silvered phase ball by Moon minus Sun, once per synodic month.',
    evidence: 'Fragment C, with the phase-ball housing. Called q1 in Freeth et al. 2021 Table S8. Its orientation (facing in or out) is still debated.',
    source: ['freeth2006', 'freeth2021'], aliases: ['q1 (Freeth et al. 2021)'],
  },
  // ── Calendar trains ───────────────────────────────────────────────────
  {
    id: 'l1', teeth: 38, status: 'surviving', train: 'metonic', fragment: 'A', frame: 'main', measured: S8(9.0, 8.3, 8.6, 1.5),
    role: 'Shared by the Metonic and Saros trains: 38 = 2·19 carries the Metonic 19 into both.',
    evidence: SURVIVING_BACK, source: ['freeth2006', 'freeth2021'],
  },
  {
    id: 'l2', teeth: 53, status: 'surviving', train: 'metonic', fragment: 'A', frame: 'main', measured: S8(13.3, 12.5, 12.9, 1.5),
    role: 'Calendar train: 53/96.', evidence: SURVIVING_BACK, source: ['freeth2006', 'freeth2021'],
  },
  {
    id: 'm1', teeth: 96, status: 'surviving', train: 'metonic', fragment: 'A', frame: 'main', measured: S8(24.7, 23.6, 24.1, 2.0),
    role: 'Calendar train: on the m arbor, which feeds the Metonic (m2) and Saros (m3) branches.',
    evidence: SURVIVING_BACK, source: ['freeth2006', 'freeth2021'],
  },
  {
    id: 'm2', teeth: 15, status: 'surviving', train: 'metonic', fragment: 'A', frame: 'main', measured: S8(4.0, 3.7, 3.9, 1.8),
    role: 'Drives the Metonic pointer arbor n.', evidence: SURVIVING_BACK, source: ['freeth2006', 'freeth2021'],
  },
  {
    id: 'n1', teeth: 53, status: 'reconstructed', confidence: 'required', train: 'metonic', frame: 'main',
    role: 'Metonic pointer arbor: 5 turns in 19 years, one per turn of the 235-month spiral.',
    evidence: DIAL_REQUIRED, source: ['freeth2006', 'freeth2008'],
  },
  {
    id: 'n2', teeth: 57, status: 'reconstructed', confidence: 'required', train: 'olympiad', frame: 'main',
    role: 'On the Metonic arbor; drives the Olympiad (games) dial: 57/60.',
    evidence: DIAL_REQUIRED + ' The Olympiad dial and its gear o1 were identified in Freeth et al. 2008.',
    source: ['freeth2008'],
  },
  {
    id: 'o1', teeth: 60, status: 'surviving', train: 'olympiad', fragment: 'B', frame: 'main', measured: S8(12.8, 12.2, 12.5, 1.1),
    role: 'Olympiad dial: one turn every 4 years (5/19 × 57/60 = 1/4).',
    evidence: 'The single gear in Fragment B (Freeth et al. 2008; radii from Freeth et al. 2021, Supp. Table S8).',
    source: ['freeth2008', 'freeth2021'],
  },
  {
    id: 'n3', teeth: 15, status: 'reconstructed', confidence: 'required', train: 'callippic', frame: 'main',
    role: 'On the Metonic arbor; first stage of the Callippic train, 15/60.', evidence: DIAL_REQUIRED, source: ['freeth2006', 'freeth2008'],
  },
  {
    id: 'p1', teeth: 60, status: 'reconstructed', confidence: 'required', train: 'callippic', frame: 'main',
    role: 'Callippic train.', evidence: DIAL_REQUIRED, source: ['freeth2006', 'freeth2008'],
  },
  {
    id: 'p2', teeth: 12, status: 'reconstructed', confidence: 'required', train: 'callippic', frame: 'main',
    role: 'Callippic train, second stage 12/60.', evidence: DIAL_REQUIRED, source: ['freeth2006', 'freeth2008'],
  },
  {
    id: 'q1', teeth: 60, status: 'reconstructed', confidence: 'required', train: 'callippic', frame: 'main',
    role: 'Callippic dial: one turn in 76 years (5/19 × 15/60 × 12/60 = 1/76).', evidence: DIAL_REQUIRED, source: ['freeth2006', 'freeth2008'],
  },
  {
    id: 'm3', teeth: 27, status: 'reconstructed', confidence: 'required', train: 'saros', frame: 'main',
    role: 'On the m arbor; drives e3 (27/223), bringing in the Saros 223.',
    evidence: DIAL_REQUIRED + ' It also sets the rate of e3, which the surviving lunar anomaly mechanism needs.',
    source: ['freeth2006'],
  },
  {
    id: 'e3', teeth: 223, status: 'surviving', train: 'saros', fragment: 'A', frame: 'main', measured: S8(52.4, 51.5, 51.9, 1.4),
    role: 'Carrier of the lunar anomaly gears. Turns once in 8.88 years, the period of the Moon’s line of apsides, and drives the Saros train. 223 is the Saros number of months.',
    evidence: SURVIVING_BACK, source: ['freeth2006', 'freeth2021'], countNote: LARGE_COUNT,
  },
  {
    id: 'e4', teeth: 188, status: 'surviving', train: 'saros', fragment: 'A', frame: 'main', measured: S8(49.9, 49.1, 49.5, 1.5),
    role: 'Same arbor as e3; Saros train 188/53.', evidence: SURVIVING_BACK, source: ['freeth2006', 'freeth2021'], countNote: LARGE_COUNT,
  },
  {
    id: 'f1', teeth: 53, status: 'surviving', train: 'saros', fragment: 'A', frame: 'main', measured: S8(13.6, 12.9, 13.2, 1.3),
    role: 'Saros train.', evidence: SURVIVING_BACK, source: ['freeth2006', 'freeth2021'],
  },
  {
    id: 'f2', teeth: 30, status: 'surviving', train: 'saros', fragment: 'A', frame: 'main', measured: S8(8.2, 7.4, 7.8, 1.2),
    role: 'Saros train 30/54.', evidence: SURVIVING_BACK, source: ['freeth2006', 'freeth2021'],
  },
  {
    id: 'g1', teeth: 54, status: 'surviving', train: 'saros', fragment: 'A', frame: 'main', measured: S8(14.4, 13.4, 13.9, 1.5),
    role: 'Saros pointer arbor: 4 turns per 223 months.', evidence: SURVIVING_BACK, source: ['freeth2006', 'freeth2021'],
  },
  {
    id: 'g2', teeth: 20, status: 'surviving', train: 'exeligmos', fragment: 'A', frame: 'main', measured: S8(4.9, 4.1, 4.5, 1.6),
    role: 'Exeligmos train 20/60.', evidence: SURVIVING_BACK, source: ['freeth2006', 'freeth2021'],
  },
  {
    id: 'h1', teeth: 60, status: 'surviving', train: 'exeligmos', fragment: 'A', frame: 'main', measured: S8(13.7, 13.0, 13.4, 1.0),
    role: 'Exeligmos train.', evidence: SURVIVING_BACK, source: ['freeth2006', 'freeth2021'],
  },
  {
    id: 'h2', teeth: 15, status: 'surviving', train: 'exeligmos', fragment: 'A', frame: 'main', measured: S8(3.8, 3.0, 3.4, 1.4),
    role: 'Exeligmos train 15/60.', evidence: SURVIVING_BACK, source: ['freeth2006', 'freeth2021'],
  },
  {
    id: 'i1', teeth: 60, status: 'surviving', train: 'exeligmos', fragment: 'A', frame: 'main', measured: S8(13.2, 12.6, 12.9, 1.2),
    role: 'Exeligmos pointer: one turn in three Saros cycles (54 years), stepping the eclipse times by 8 h per Saros.',
    evidence: SURVIVING_BACK, source: ['freeth2006', 'freeth2021'],
  },
  // ── 2021 Cosmos: between b1 and the Strap ───────────────────────────────
  {
    id: 'nodes49', teeth: 49, status: 'reconstructed', confidence: 'speculative', train: 'nodes', frame: 'main',
    role: 'Fixed central gear of the Dragon Hand train 49~62+64~48.',
    evidence: 'Hypothetical. Freeth et al. 2021 stress there is no direct physical evidence for a display of the lunar nodes; it is offered because it explains the large bearing on spoke B, 27.0 mm from the centre.',
    source: ['freeth2021'],
  },
  {
    id: 'nodes62', teeth: 62, status: 'reconstructed', confidence: 'speculative', train: 'nodes', frame: 'b1',
    role: 'Epicyclic idler on spoke B (bearing at 27.0 mm).', evidence: 'Hypothetical (Freeth et al. 2021, Fig. 3a, Supp. §4.2.1).', source: ['freeth2021'],
  },
  {
    id: 'nodes64', teeth: 64, status: 'reconstructed', confidence: 'speculative', train: 'nodes', frame: 'b1',
    role: 'Same arbor as 62.', evidence: 'Hypothetical (Freeth et al. 2021).', source: ['freeth2021'],
  },
  {
    id: 'nodes48', teeth: 48, status: 'reconstructed', confidence: 'speculative', train: 'nodes', frame: 'main',
    role: 'Output: turns the Dragon Hand at 1 − (49·64)/(62·48) = −5/93 turn per year, i.e. backwards once in 18.6 years.',
    evidence: 'Hypothetical (Freeth et al. 2021).', source: ['freeth2021'],
  },
  {
    id: 'inf51', teeth: 51, status: 'reconstructed', confidence: 'modelled', train: 'venus', frame: 'main',
    role: 'Fixed central gear shared by the Mercury and Venus trains (51 = 3·17; 17 is common to both period relations).',
    evidence: 'Reconstruction (Freeth et al. 2021, Fig. 3e). Fixed to a tube through b1 to the main plate.',
    source: ['freeth2021'],
  },
  {
    id: 'merc72', teeth: 72, status: 'reconstructed', confidence: 'modelled', train: 'mercury', frame: 'b1',
    role: 'Mercury train 51~72+89~40~20, on spoke A.',
    evidence: 'Reconstruction matching the flattened area and rivet on spoke A (Freeth et al. 2021).', source: ['freeth2021'],
  },
  {
    id: 'merc89', teeth: 89, status: 'reconstructed', confidence: 'modelled', train: 'mercury', frame: 'b1',
    role: 'Same arbor as 72. 89 is the prime in Mercury’s 1513 = 17·89 synodic cycles.', evidence: 'Reconstruction (Freeth et al. 2021).', source: ['freeth2021'],
  },
  {
    id: 'merc40', teeth: 40, status: 'reconstructed', confidence: 'modelled', train: 'mercury', frame: 'b1',
    role: 'Idler on the Strap.', evidence: 'Reconstruction (Freeth et al. 2021).', source: ['freeth2021'],
  },
  {
    id: 'merc20', teeth: 20, status: 'reconstructed', confidence: 'modelled', train: 'mercury', frame: 'b1',
    role: 'Mercury epicycle: carries the pin followed by the slotted Mercury follower. Turns 1513/480 relative to b1.',
    evidence: 'Reconstruction (Freeth et al. 2021, Fig. 3e). The paper’s Supp. Fig. S22 caption writes “40 ~ 24”; only 20 gives the stated 1513/480, so 20 is used.',
    source: ['freeth2021'],
  },
  {
    id: 'ven44', teeth: 44, status: 'reconstructed', confidence: 'modelled', train: 'venus', frame: 'b1',
    role: 'Venus train 51~44+34~26~63, on spoke C.', evidence: 'Reconstruction matching the bearing on spoke C (Freeth et al. 2021).', source: ['freeth2021'],
  },
  {
    id: 'ven34', teeth: 34, status: 'reconstructed', confidence: 'modelled', train: 'venus', frame: 'b1',
    role: 'Same arbor as 44 (34 = 2·17).', evidence: 'Reconstruction (Freeth et al. 2021).', source: ['freeth2021'],
  },
  {
    id: 'ven26', teeth: 26, status: 'reconstructed', confidence: 'modelled', train: 'venus', frame: 'b1',
    role: 'Idler, turning in the D-plate.', evidence: 'Reconstruction (Freeth et al. 2021).', source: ['freeth2021'],
  },
  {
    id: 'r1', teeth: 63, status: 'surviving', train: 'venus', fragment: 'D', frame: 'b1', measured: S8(16.9, 15.9, 16.4, 1.6),
    role: 'Venus epicycle in the 2021 model: with its riveted disk it carries the pin for the Venus follower. Turns 289/462 relative to b1.',
    evidence: 'The gear of Fragment D: 61 teeth survive with a gap of about 3 teeth, so 63 (Freeth & Jones 2012). It has a disk riveted to it, unique in the Mechanism. Its use as the Venus epicycle is the 2021 interpretation, not established fact.',
    source: ['freethJones2012', 'freeth2021'], aliases: ['Fragment D gear'],
  },
  // ── 2021 Cosmos: Circular Plate (true Sun and superior planets) ─────────
  {
    id: 'cp56', teeth: 56, status: 'reconstructed', confidence: 'modelled', train: 'sun', frame: 'main',
    role: 'Fixed central gear shared by the true Sun and all three superior planets (56 = 2³·7).',
    evidence: 'Reconstruction (Freeth et al. 2021, Fig. 3f); riveted to a fixed sub-plate.', source: ['freeth2021'],
  },
  {
    id: 'cp52', teeth: 52, status: 'reconstructed', confidence: 'modelled', train: 'saturn', frame: 'b1',
    role: 'Shared by the true Sun (as an idler) and Saturn (52 = 2²·13).', evidence: 'Reconstruction (Freeth et al. 2021).', source: ['freeth2021'],
  },
  {
    id: 'sun56', teeth: 56, status: 'reconstructed', confidence: 'modelled', train: 'sun', frame: 'b1',
    role: 'True Sun: 56~52~56 makes this gear stand still in space while the plate carries it round, so its pin keeps a fixed direction (the solar apogee) and the follower reproduces the eccentric solar orbit.',
    evidence: 'Reconstruction (Freeth et al. 2021, Fig. 3b); the 3-gear solar anomaly mechanism was first proposed by Wright 2002.',
    source: ['freeth2021'],
  },
  {
    id: 'sat61', teeth: 61, status: 'reconstructed', confidence: 'modelled', train: 'saturn', frame: 'b1',
    role: 'Saturn 56~52+61~40~68⊕86~86. 61 is the prime in 427 = 7·61.', evidence: 'Reconstruction (Freeth et al. 2021).', source: ['freeth2021'],
  },
  {
    id: 'sat40', teeth: 40, status: 'reconstructed', confidence: 'modelled', train: 'saturn', frame: 'b1',
    role: 'Idler.', evidence: 'Reconstruction (Freeth et al. 2021).', source: ['freeth2021'],
  },
  {
    id: 'sat68', teeth: 68, status: 'reconstructed', confidence: 'modelled', train: 'saturn', frame: 'b1',
    role: 'Saturn pin gear: 427/442 relative to the plate (442 = 2·13·17).', evidence: 'Reconstruction (Freeth et al. 2021).', source: ['freeth2021'],
  },
  {
    id: 'sat86s', teeth: 86, status: 'reconstructed', confidence: 'modelled', train: 'saturn', frame: 'b1',
    role: 'Saturn slot gear, on an axis 1.50 mm from the pin gear.', evidence: 'Reconstruction (Freeth et al. 2021, Supp. Table S9).', source: ['freeth2021'],
  },
  {
    id: 'sat86', teeth: 86, status: 'reconstructed', confidence: 'modelled', train: 'saturn', frame: 'main',
    role: 'Saturn output on the central tube.', evidence: 'Reconstruction (Freeth et al. 2021).', source: ['freeth2021'],
  },
  {
    id: 'mj64', teeth: 64, status: 'reconstructed', confidence: 'modelled', train: 'jupiter', frame: 'b1',
    role: 'Shared first epicyclic gear of Mars and Jupiter.', evidence: 'Reconstruction (Freeth et al. 2021).', source: ['freeth2021'],
  },
  {
    id: 'jup45', teeth: 45, status: 'reconstructed', confidence: 'modelled', train: 'jupiter', frame: 'b1',
    role: 'Jupiter 56~64+45~40~43⊕65~65 (315 = 3²·5·7, 344 = 2³·43).', evidence: 'Reconstruction (Freeth et al. 2021).', source: ['freeth2021'],
  },
  {
    id: 'jup40', teeth: 40, status: 'reconstructed', confidence: 'modelled', train: 'jupiter', frame: 'b1',
    role: 'Idler.', evidence: 'Reconstruction (Freeth et al. 2021).', source: ['freeth2021'],
  },
  {
    id: 'jup43', teeth: 43, status: 'reconstructed', confidence: 'modelled', train: 'jupiter', frame: 'b1',
    role: 'Jupiter pin gear: 315/344 relative to the plate.', evidence: 'Reconstruction (Freeth et al. 2021).', source: ['freeth2021'],
  },
  {
    id: 'jup65s', teeth: 65, status: 'reconstructed', confidence: 'modelled', train: 'jupiter', frame: 'b1',
    role: 'Jupiter slot gear, 1.58 mm from the pin gear.', evidence: 'Reconstruction (Freeth et al. 2021, Supp. Table S9).', source: ['freeth2021'],
  },
  {
    id: 'jup65', teeth: 65, status: 'reconstructed', confidence: 'modelled', train: 'jupiter', frame: 'main',
    role: 'Jupiter output.', evidence: 'Reconstruction (Freeth et al. 2021).', source: ['freeth2021'],
  },
  {
    id: 'mars38', teeth: 38, status: 'reconstructed', confidence: 'modelled', train: 'mars', frame: 'b1',
    role: 'Mars 56~64+38~40~71⊕80~80 (133 = 7·19, 284 = 2²·71).', evidence: 'Reconstruction (Freeth et al. 2021).', source: ['freeth2021'],
  },
  {
    id: 'mars40', teeth: 40, status: 'reconstructed', confidence: 'modelled', train: 'mars', frame: 'b1',
    role: 'Idler.', evidence: 'Reconstruction (Freeth et al. 2021).', source: ['freeth2021'],
  },
  {
    id: 'mars71', teeth: 71, status: 'reconstructed', confidence: 'modelled', train: 'mars', frame: 'b1',
    role: 'Mars pin gear: 133/284 relative to the plate.', evidence: 'Reconstruction (Freeth et al. 2021).', source: ['freeth2021'],
  },
  {
    id: 'mars80s', teeth: 80, status: 'reconstructed', confidence: 'modelled', train: 'mars', frame: 'b1',
    role: 'Mars slot gear, 6.58 mm from the pin gear.', evidence: 'Reconstruction (Freeth et al. 2021, Supp. Table S9).', source: ['freeth2021'],
  },
  {
    id: 'mars80', teeth: 80, status: 'reconstructed', confidence: 'modelled', train: 'mars', frame: 'main',
    role: 'Mars output.', evidence: 'Reconstruction (Freeth et al. 2021).', source: ['freeth2021'],
  },
];

export const GEAR = new Map(GEARS.map((g) => [g.id, g]));

// ── Kinematic graph ──────────────────────────────────────────────────────
//
// Nodes are gears. Edges are the physical couplings:
// - mesh:    teeth engage. In the frame F where both axes are stationary,
//            Na·(ωa − ωF) + Nb·(ωb − ωF) = 0   (Freeth et al. 2021, Supp. §4.1.3)
// - arbor:   fixed to the same arbor, ωa = ωb
// - fixed:   held by the frame, ω = 0
// - pinSlot: a pin on gear a drives a slot in gear b about an eccentric axis.
//            Equal mean rates in F; the instantaneous angle is nonlinear.
// - follower: a slotted arm pivoting on the central axis follows a pin on an
//            epicyclic gear; it has no teeth, so it is an output, not a node.

export type Edge =
  | { kind: 'mesh'; a: string; b: string; frame: Frame }
  | { kind: 'arbor'; a: string; b: string }
  | { kind: 'fixed'; a: string }
  | { kind: 'pinSlot'; a: string; b: string; frame: Frame; offset: number; pin: number; dir: number };

const mesh = (a: string, b: string, frame: Frame = 'main'): Edge => ({ kind: 'mesh', a, b, frame });
const arbor = (a: string, b: string): Edge => ({ kind: 'arbor', a, b });
const fixed = (a: string): Edge => ({ kind: 'fixed', a });

// Lunar anomaly: axes 1.1 mm apart (Freeth et al. 2006). The maximum equation
// is ±6.53° (Freeth et al. 2006, as quoted by Szigety & Arenas 2025), which
// fixes the pin radius at 1.1 / sin 6.53° = 9.67 mm.
export const LUNAR_OFFSET_MM = 1.1;
export const LUNAR_MAX_EQUATION_DEG = 6.53;
export const LUNAR_PIN_MM = LUNAR_OFFSET_MM / Math.sin((LUNAR_MAX_EQUATION_DEG * Math.PI) / 180);

// Direction of each slot axis from its pin-gear axis, as a drawing angle in the
// carrier's frame (degrees, counter-clockwise seen from the front). The
// kinematics measure angles clockwise, so they use the mirror image. Any
// direction gives the same motion up to a phase, which calibration absorbs;
// fixing it here keeps the drawn slot on the computed pin.
export const LUNAR_SLOT_ANGLE = 90;

// Supplementary Table S9 of Freeth et al. 2021: pin distance d and offset o (mm).
// `angle`: where the slot gear sits around the centre of the plate (drawing
// angle); the pin gear is one offset further in.
export const SUPERIOR_PIN_SLOT = {
  mars: { offset: 6.58, pin: 10.0, au: 1.52, angle: -28 },
  jupiter: { offset: 1.58, pin: 8.22, au: 5.2, angle: -150 },
  saturn: { offset: 1.5, pin: 14.37, au: 9.58, angle: 62 },
} as const;

const superiorEdge = (a: string, b: string, p: (typeof SUPERIOR_PIN_SLOT)[keyof typeof SUPERIOR_PIN_SLOT]): Edge => ({
  kind: 'pinSlot', a, b, frame: 'b1', offset: p.offset, pin: p.pin, dir: -p.angle / 360,
});

// Inferior planets use a slotted follower: g5 at distance i from the centre,
// pin at d = p·i from g5's centre (Table S9).
export const INFERIOR_FOLLOWER = {
  mercury: { centre: 36.0, pin: 14.04, au: 0.39 },
  venus: { centre: 27.8, pin: 20.01, au: 0.72 },
} as const;

// The true Sun follower. Freeth et al. 2021 give no dimensions for it, so it uses
// Hipparchus' eccentricity 1/24 with the apogee at Gemini 5½° (Almagest III.4).
export const SOLAR_ECCENTRICITY = 1 / 24;
export const SOLAR_APOGEE_DEG = 65.5;
export const SUN_FOLLOWER = { centre: 27.0, pin: 27.0 / 24 };

export const EDGES: Edge[] = [
  // Drive
  mesh('a1', 'b1'),
  arbor('b1', 'b2'),
  // Lunar train: b2~c1, c2~d1, d2~e2, e5~k1 ⊕ k2~e6, e1~b3
  mesh('b2', 'c1'),
  arbor('c1', 'c2'),
  mesh('c2', 'd1'),
  arbor('d1', 'd2'),
  mesh('d2', 'e2'),
  arbor('e2', 'e5'),
  mesh('e5', 'k1', 'e3'),
  { kind: 'pinSlot', a: 'k1', b: 'k2', frame: 'e3', offset: LUNAR_OFFSET_MM, pin: LUNAR_PIN_MM, dir: -LUNAR_SLOT_ANGLE / 360 },
  mesh('k2', 'e6', 'e3'),
  arbor('e6', 'e1'),
  mesh('e1', 'b3'),
  // Moon phase: b0 rides with the mean Sun; ma1 is carried by the Moon pointer
  arbor('b1', 'b0'),
  mesh('b0', 'ma1', 'b3'),
  // Metonic, Olympiad, Callippic: b2~l1, l2~m1, m2~n1 ; n2~o1 ; n3~p1, p2~q1
  mesh('b2', 'l1'),
  arbor('l1', 'l2'),
  mesh('l2', 'm1'),
  arbor('m1', 'm2'),
  mesh('m2', 'n1'),
  arbor('n1', 'n2'),
  arbor('n1', 'n3'),
  mesh('n2', 'o1'),
  mesh('n3', 'p1'),
  arbor('p1', 'p2'),
  mesh('p2', 'q1'),
  // Saros and Exeligmos: m3~e3, e4~f1, f2~g1, g2~h1, h2~i1
  arbor('m1', 'm3'),
  mesh('m3', 'e3'),
  arbor('e3', 'e4'),
  mesh('e4', 'f1'),
  arbor('f1', 'f2'),
  mesh('f2', 'g1'),
  arbor('g1', 'g2'),
  mesh('g2', 'h1'),
  arbor('h1', 'h2'),
  mesh('h2', 'i1'),
  // Nodes (Dragon Hand): 49~62+64~48 on b1
  fixed('nodes49'),
  mesh('nodes49', 'nodes62', 'b1'),
  arbor('nodes62', 'nodes64'),
  mesh('nodes64', 'nodes48', 'b1'),
  // Mercury: 51~72+89~40~20 ⊕ follower
  fixed('inf51'),
  mesh('inf51', 'merc72', 'b1'),
  arbor('merc72', 'merc89'),
  mesh('merc89', 'merc40', 'b1'),
  mesh('merc40', 'merc20', 'b1'),
  // Venus: 51~44+34~26~63 ⊕ follower
  mesh('inf51', 'ven44', 'b1'),
  arbor('ven44', 'ven34'),
  mesh('ven34', 'ven26', 'b1'),
  mesh('ven26', 'r1', 'b1'),
  // True Sun: 56~52~56 ⊕ follower
  fixed('cp56'),
  mesh('cp56', 'cp52', 'b1'),
  mesh('cp52', 'sun56', 'b1'),
  // Saturn: 56~52+61~40~68 ⊕ 86~86
  arbor('cp52', 'sat61'),
  mesh('sat61', 'sat40', 'b1'),
  mesh('sat40', 'sat68', 'b1'),
  superiorEdge('sat68', 'sat86s', SUPERIOR_PIN_SLOT.saturn),
  mesh('sat86s', 'sat86', 'b1'),
  // Jupiter: 56~64+45~40~43 ⊕ 65~65
  mesh('cp56', 'mj64', 'b1'),
  arbor('mj64', 'jup45'),
  mesh('jup45', 'jup40', 'b1'),
  mesh('jup40', 'jup43', 'b1'),
  superiorEdge('jup43', 'jup65s', SUPERIOR_PIN_SLOT.jupiter),
  mesh('jup65s', 'jup65', 'b1'),
  // Mars: 56~64+38~40~71 ⊕ 80~80
  arbor('mj64', 'mars38'),
  mesh('mars38', 'mars40', 'b1'),
  mesh('mars40', 'mars71', 'b1'),
  superiorEdge('mars71', 'mars80s', SUPERIOR_PIN_SLOT.mars),
  mesh('mars80s', 'mars80', 'b1'),
];

// The gear whose rotation is the input: b1, one turn per year.
export const DRIVER = 'b1';

// Carriers: the gear whose rotation defines each moving frame.
export const FRAME_GEAR: Record<Exclude<Frame, 'main'>, string> = {
  b1: 'b1',
  e3: 'e3',
  b3: 'b3',
};
