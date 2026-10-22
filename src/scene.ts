// The 3D scene: builds render objects from the layout and updates their
// transforms from the kinematic state each frame.

import { GEAR, GEARS, EDGES, INFERIOR_FOLLOWER, SUPERIOR_PIN_SLOT, SUN_FOLLOWER, LUNAR_PIN_MM, SOLAR_APOGEE_DEG, type Gear, type TrainId } from './model/gears.ts';
import { GEAR_INDEX, SCHEDULE, turnsOf } from './model/kinematics.ts';
import { PLACEMENT, PLACEMENTS, AXES, FRONT_AXES, DIAL_CENTRES, PLATES, CASE, FRONT_RADII, BACK_RADII, SPOKE_ANGLE, angleOf, type GearPlacement } from './model/layout.ts';
import type { Readout } from './model/mechanism.ts';
import { egyptianDate } from './model/calendar.ts';
import type { Body } from './model/ephemeris.ts';
import { Renderer, type RenderObject, type GPUMesh } from './gpu/renderer.ts';
import { gearMesh, annulus, cylinder, tube, sphere, plate, pointerMesh, dragonMesh, boxMesh, merge, translateMesh } from './gpu/meshes.ts';
import { chain, translation, rotationZ, rotationY, rotationX, scaling, type Mat4, type Vec3 } from './gpu/math.ts';
import { frontPlate, backPlate, calendarRing, phaseBall } from './gpu/dials.ts';

export type Visibility = 'show' | 'ghost' | 'hide';

export interface ViewSettings {
  explode: number; // 0–1
  xray: boolean;
  slice: { enabled: boolean; axis: 'x' | 'y' | 'z'; offset: number };
  reconstructed: Visibility;
  plates: boolean;
  selected: string | null;
  train: TrainId | null;
}

type Color = [number, number, number, number];

// Materials. Surviving gears are patinated bronze; reconstructed ones are
// bright brass, so evidence and conjecture never look alike.
const SURVIVING: Color = [0.42, 0.44, 0.3, 1];
const RECONSTRUCTED: Color = [0.86, 0.66, 0.34, 1];
const SPECULATIVE: Color = [0.78, 0.5, 0.42, 1];
const STEEL: Color = [0.55, 0.53, 0.5, 1];
const PLATE: Color = [0.5, 0.42, 0.28, 1];
const WOOD: Color = [0.2, 0.13, 0.08, 1];
const GOLD: Color = [1.0, 0.78, 0.3, 1];

export const STONE: Record<string, Color> = {
  mercury: [0.25, 0.72, 0.68, 1], // turquoise (Freeth et al. 2021)
  venus: [0.16, 0.25, 0.7, 1], // lapis lazuli (Freeth et al. 2021)
  mars: [0.75, 0.18, 0.12, 1],
  jupiter: [0.92, 0.9, 0.84, 1],
  saturn: [0.12, 0.12, 0.13, 1],
};

const TAU = Math.PI * 2;

interface Item {
  obj: RenderObject;
  baseColor: Color;
  kind: 'gear' | 'plate' | 'front-plate' | 'back-plate' | 'case' | 'part' | 'display';
  gear?: Gear;
  reconstructed?: boolean;
  trains?: TrainId[];
  // Updates the model matrix: (state, view, z scale) → matrix.
  place: (r: Readout, v: ViewSettings, zs: (z: number) => number) => Mat4;
}

export class Scene {
  readonly objects: RenderObject[] = [];
  private readonly items: Item[] = [];
  private readonly renderer: Renderer;
  private readonly delta = new Map<string, number>(); // tooth-interleave offsets (rad)
  private readonly gearItems = new Map<string, Item>();
  crankAngle = 0;

  constructor(renderer: Renderer, epochReadout: Readout) {
    this.renderer = renderer;
    this.computeInterleave(epochReadout);
    this.build();
  }

  // ── Helpers ─────────────────────────────────────────────────────────────
  private mesh(m: Parameters<Renderer['createMesh']>[0]): GPUMesh {
    return this.renderer.createMesh(m);
  }

  private add(item: Omit<Item, 'obj'> & { mesh: GPUMesh; material?: [number, number, number, number]; texture?: GPUBindGroup }) {
    const obj: RenderObject = {
      mesh: item.mesh,
      model: new Float32Array(16),
      color: [...item.baseColor] as Color,
      material: item.material ?? [0.85, 0.42, 0, 0],
      highlight: [0, 0, 0, 0],
      texture: item.texture,
      visible: true,
    };
    const full: Item = { ...item, obj };
    this.items.push(full);
    this.objects.push(obj);
    return full;
  }

  // Render angle of a gear: kinematic turns are clockwise-positive seen from
  // the front, the drawing convention is counter-clockwise.
  private angle(r: Readout, id: string) {
    return -turnsOf(r.gears, id) * TAU;
  }

  // Carrier transform for a gear's frame.
  private carrier(r: Readout, frame: string, zs: (z: number) => number, z: number): Mat4 {
    if (frame === 'b1') return chain(rotationZ(this.angle(r, 'b1')), translation(0, 0, zs(z)));
    if (frame === 'e3') return chain(translation(AXES.e.x, AXES.e.y, zs(z)), rotationZ(this.angle(r, 'e3')));
    return translation(0, 0, zs(z));
  }

  // Angle of a gear relative to its carrier (the carrier transform already
  // applies the carrier's own rotation).
  private local(r: Readout, frame: string, absolute: number) {
    return frame === 'b1' ? absolute - this.angle(r, 'b1') : frame === 'e3' ? absolute - this.angle(r, 'e3') : absolute;
  }

  private gearMatrix(r: Readout, p: GearPlacement, zs: (z: number) => number) {
    const spin = this.angle(r, p.id) + (this.delta.get(p.id) ?? 0);
    return chain(this.carrier(r, p.frame, zs, p.z), translation(p.pos.x, p.pos.y, 0), rotationZ(this.local(r, p.frame, spin)));
  }

  // Interleave meshing teeth: for each mesh, rotate the driven gear's drawing
  // so a tooth of one faces a gap of the other along the line of centres. This
  // is a constant per gear and never touches the kinematics.
  private computeInterleave(r: Readout) {
    for (const s of SCHEDULE) {
      if (!s.edge || s.edge.kind !== 'mesh') continue;
      const a = GEAR.get(s.from!)!;
      const b = GEAR.get(s.gear)!;
      if (a.contrate || b.contrate) continue;
      const pa = PLACEMENT.get(a.id)!;
      const pb = PLACEMENT.get(b.id)!;
      // Both in the mesh frame (carrier angle removed).
      const frameGear = s.edge.frame === 'main' ? null : s.edge.frame;
      const rel = (id: string) => this.angle(r, id) - (frameGear ? this.angle(r, frameGear) : 0);
      const posA = pa.frame === pb.frame ? pa.pos : pa.frame === 'main' ? { x: pa.pos.x - (frameGear === 'e3' ? AXES.e.x : 0), y: pa.pos.y - (frameGear === 'e3' ? AXES.e.y : 0) } : pa.pos;
      const posB = pb.frame === pa.frame ? pb.pos : pb.frame === 'main' ? { x: pb.pos.x - (frameGear === 'e3' ? AXES.e.x : 0), y: pb.pos.y - (frameGear === 'e3' ? AXES.e.y : 0) } : pb.pos;
      const psi = Math.atan2(posB.y - posA.y, posB.x - posA.x);
      const thA = rel(a.id) + (this.delta.get(a.id) ?? 0);
      const fa = ((((psi - thA) * a.teeth) / TAU) % 1 + 1) % 1;
      const thB = rel(b.id);
      const want = 0.5 - fa; // fraction of b's pitch at the contact line
      const fb = ((((psi + Math.PI - thB) * b.teeth) / TAU) % 1 + 1) % 1;
      this.delta.set(b.id, ((fb - want) * TAU) / b.teeth);
    }
  }

  // ── Build ───────────────────────────────────────────────────────────────
  private build() {
    const meshCache = new Map<string, GPUMesh>();
    // Gears
    for (const p of PLACEMENTS) {
      const g = GEAR.get(p.id)!;
      const key = `${g.teeth}|${p.outerR}|${p.innerR}|${p.thickness}|${p.spokes}`;
      let mesh = meshCache.get(key);
      if (!mesh) {
        mesh = this.mesh(gearMesh({ teeth: g.teeth, outerR: p.outerR, innerR: p.innerR, thickness: p.thickness, spokes: p.spokes, hub: p.hub }));
        meshCache.set(key, mesh);
      }
      const baseColor = g.status === 'surviving' ? SURVIVING : g.confidence === 'speculative' ? SPECULATIVE : RECONSTRUCTED;
      const material: [number, number, number, number] = g.status === 'surviving' ? [0.55, 0.75, 0, 0] : [0.95, 0.3, 0, 0];
      let place: Item['place'];
      if (g.id === 'a1') {
        // Crown gear on the crank axle, which runs along x.
        place = (_r, _v, zs) => chain(translation(AXES.a.x, AXES.a.y, zs(PLACEMENT.get('b1')!.z) - 1.5), rotationY(Math.PI / 2), rotationZ(this.crankAngle));
      } else if (g.id === 'ma1') {
        // Contrate gear in the phase-ball housing on the Moon pointer.
        place = (r, _v, zs) => chain(rotationZ(Math.PI / 2 - (r.longitude.moon * Math.PI) / 180), translation(8, 0, zs(p.z) - 1), rotationY(Math.PI / 2), rotationZ((r.phase * Math.PI) / 180));
      } else {
        place = (r, _v, zs) => this.gearMatrix(r, p, zs);
      }
      const it = this.add({ kind: 'gear', gear: g, mesh, baseColor, material, reconstructed: g.status === 'reconstructed', trains: [g.train], place });
      this.gearItems.set(g.id, it);
    }
    this.buildArbors();
    this.buildPinsAndFollowers();
    this.buildPlates();
    this.buildDisplay();
  }

  private buildArbors() {
    // Union of gears fixed to the same arbor.
    const parent = new Map<string, string>(GEARS.map((g) => [g.id, g.id]));
    const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!));
    for (const e of EDGES) if (e.kind === 'arbor') parent.set(find(e.a), find(e.b));
    const groups = new Map<string, string[]>();
    for (const g of GEARS) {
      if (g.contrate) continue;
      const root = find(g.id);
      groups.set(root, [...(groups.get(root) ?? []), g.id]);
    }
    const shaft = this.mesh(cylinder(1, 0, 1, 16));
    for (const ids of groups.values()) {
      const ps = ids.map((id) => PLACEMENT.get(id)!);
      // The central arbors are drawn separately as nested tubes.
      if (ps[0].frame === 'main' && Math.hypot(ps[0].pos.x, ps[0].pos.y) < 0.01) continue;
      let z0 = Math.min(...ps.map((p) => p.z - p.thickness)) - 1;
      let z1 = Math.max(...ps.map((p) => p.z)) + 1;
      // Dial arbors reach the back plate.
      const dial = ['n1', 'g1', 'o1', 'q1', 'i1'].some((id) => ids.includes(id));
      if (dial) z0 = PLATES.back.z - PLATES.back.thickness - 1.5;
      if (ids.includes('b1') || ids.includes('e3')) {
        z0 = Math.min(z0, -2);
        z1 = Math.max(z1, 0);
      }
      const p = ps[0];
      const r = p.frame === 'main' ? 1.1 : 0.8;
      this.add({
        kind: 'part',
        mesh: shaft,
        baseColor: STEEL,
        material: [0.9, 0.35, 0, 0],
        reconstructed: ps.every((q) => GEAR.get(q.id)!.status === 'reconstructed'),
        trains: ps.map((q) => GEAR.get(q.id)!.train),
        place: (rd, _v, zs) => chain(this.carrier(rd, p.frame, (z) => z, 0), translation(p.pos.x, p.pos.y, zs(z0)), scaling(r, r, zs(z1) - zs(z0))),
      });
    }
    // Nested output tubes on the central axis, from the gearing to the dials.
    const tubes = [
      { r0: 0, r1: 0.9, z0: -7, z1: 44 }, // Moon
      { r0: 1.0, r1: 1.6, z0: 13, z1: 41 }, // mean Sun / phase input
      { r0: 1.7, r1: 2.2, z0: 13, z1: 42.5 }, // nodes
      { r0: 2.3, r1: 2.8, z0: 7, z1: 38.8 }, // Mercury
      { r0: 2.9, r1: 3.4, z0: 9, z1: 38.8 }, // Venus
      { r0: 3.5, r1: 4.0, z0: 24, z1: 40 }, // true Sun
      { r0: 4.1, r1: 4.6, z0: 20, z1: 38.8 }, // Mars
      { r0: 4.7, r1: 5.2, z0: 23, z1: 38.8 }, // Jupiter
      { r0: 5.3, r1: 5.8, z0: 23, z1: 38.8 }, // Saturn
    ];
    for (const t of tubes) {
      const mesh = this.mesh(t.r0 > 0 ? tube(t.r0, t.r1, 0, 1, 40) : cylinder(t.r1, 0, 1, 16));
      this.add({ kind: 'part', mesh, baseColor: STEEL, material: [0.9, 0.35, 0, 0], place: (_r, _v, zs) => chain(translation(0, 0, zs(t.z0)), scaling(1, 1, zs(t.z1) - zs(t.z0))) });
    }
    // Back output arbors on the central e/b axes behind the main plate.
    const back = this.mesh(cylinder(1.1, 0, 1, 16));
    this.add({ kind: 'part', mesh: back, baseColor: STEEL, material: [0.9, 0.35, 0, 0], place: (_r, _v, zs) => chain(translation(AXES.e.x, AXES.e.y, zs(-27)), scaling(1, 1, zs(-4) - zs(-27))) });
  }

  private buildPinsAndFollowers() {
    const pin = this.mesh(cylinder(0.45, 0, 1, 12));
    const slotMesh = (len: number) =>
      this.mesh(merge(boxMesh(1.5, 0.55, len, 1.0, -0.4, 0), boxMesh(1.5, -1.0, len, -0.55, -0.4, 0), boxMesh(len - 0.4, -1.0, len, 1.0, -0.4, 0)));
    const recon = (id: string) => GEAR.get(id)!.status === 'reconstructed';

    // Pin at radius r on gear `g`, drawn at the gear's kinematic angle.
    const addPin = (g: string, r: number, zFrom: number, zTo: number, train: TrainId) => {
      const p = PLACEMENT.get(g)!;
      this.add({
        kind: 'part', mesh: pin, baseColor: STEEL, material: [0.9, 0.3, 0, 0], reconstructed: recon(g), trains: [train],
        place: (rd, _v, zs) => chain(this.carrier(rd, p.frame, zs, 0), translation(p.pos.x, p.pos.y, 0), rotationZ(this.local(rd, p.frame, this.angle(rd, g))), translation(r, 0, zs(zFrom)), scaling(1, 1, zs(zTo) - zs(zFrom))),
      });
    };
    // Slot on gear `g`, along its local +x.
    const addSlot = (g: string, len: number, train: TrainId) => {
      const p = PLACEMENT.get(g)!;
      this.add({
        kind: 'part', mesh: slotMesh(len), baseColor: GEAR.get(g)!.status === 'surviving' ? SURVIVING : RECONSTRUCTED, material: [0.8, 0.4, 0, 0], reconstructed: recon(g), trains: [train],
        place: (rd, _v, zs) => chain(this.carrier(rd, p.frame, zs, p.z), translation(p.pos.x, p.pos.y, 0.4), rotationZ(this.local(rd, p.frame, this.angle(rd, g)))),
      });
    };

    // Lunar anomaly: pin on k1 into the slot of k2.
    addPin('k1', LUNAR_PIN_MM, PLACEMENT.get('k2')!.z - 0.8, PLACEMENT.get('k1')!.z - 0.2, 'moon');
    addSlot('k2', LUNAR_PIN_MM + 2.5, 'moon');
    // Superior planets: pin on g5, slot on g6.
    for (const [g5, g6, body] of [
      ['sat68', 'sat86s', 'saturn'],
      ['jup43', 'jup65s', 'jupiter'],
      ['mars71', 'mars80s', 'mars'],
    ] as const) {
      const d = SUPERIOR_PIN_SLOT[body].pin;
      addPin(g5, d, PLACEMENT.get(g6)!.z - 0.8, PLACEMENT.get(g5)!.z - 0.2, body);
      addSlot(g6, d + 3, body);
    }
    // Inferior planets and the true Sun: pin on the epicycle (on a riveted disk
    // for Venus, as with the Fragment D gear), followed by a slotted arm that
    // pivots on the centre.
    const followers: { g: string; d: number; body: TrainId; disk: boolean }[] = [
      { g: 'merc20', d: INFERIOR_FOLLOWER.mercury.pin, body: 'mercury', disk: true },
      { g: 'r1', d: INFERIOR_FOLLOWER.venus.pin, body: 'venus', disk: true },
      { g: 'sun56', d: SUN_FOLLOWER.pin, body: 'sun', disk: false },
    ];
    for (const f of followers) {
      const p = PLACEMENT.get(f.g)!;
      const zPin = p.z + 1.6;
      if (f.disk) {
        const disk = this.mesh(annulus(0.8, f.d + 1.8, -0.6, 0, 64));
        this.add({
          kind: 'part', mesh: disk, baseColor: f.g === 'r1' ? SURVIVING : RECONSTRUCTED, material: [0.8, 0.4, 0, 0], reconstructed: recon(f.g), trains: [f.body],
          place: (rd, _v, zs) => chain(this.carrier(rd, 'b1', zs, p.z + 1), translation(p.pos.x, p.pos.y, 0)),
        });
      }
      // Absolute drawing angle of the pin about its gear's axis.
      const pinAngle = (rd: Readout) => (f.g === 'sun56' ? this.sunPinAngle() : this.angle(rd, f.g));
      this.add({
        kind: 'part', mesh: pin, baseColor: STEEL, material: [0.9, 0.3, 0, 0], reconstructed: true, trains: [f.body],
        place: (rd, _v, zs) => chain(this.carrier(rd, 'b1', zs, 0), translation(p.pos.x, p.pos.y, 0), rotationZ(this.local(rd, 'b1', pinAngle(rd))), translation(f.d, 0, zs(p.z)), scaling(1, 1, zs(zPin + 0.6) - zs(p.z))),
      });
      const len = Math.hypot(p.pos.x, p.pos.y) + f.d + 5;
      const arm = this.mesh(merge(boxMesh(-3, -0.9, len, -0.5, 0, 0.5), boxMesh(-3, 0.5, len, 0.9, 0, 0.5), annulus(0, 2.2, 0, 0.5, 24)));
      this.add({
        kind: 'part', mesh: arm, baseColor: RECONSTRUCTED, material: [0.9, 0.3, 0, 0], reconstructed: true, trains: [f.body],
        place: (rd, _v, zs) => {
          // The slotted arm pivots on the centre and points straight at the pin.
          const c = this.angle(rd, 'b1');
          const ax = p.pos.x * Math.cos(c) - p.pos.y * Math.sin(c);
          const ay = p.pos.x * Math.sin(c) + p.pos.y * Math.cos(c);
          const pa = pinAngle(rd);
          return chain(translation(0, 0, zs(zPin)), rotationZ(Math.atan2(ay + f.d * Math.sin(pa), ax + f.d * Math.cos(pa))));
        },
      });
    }
  }

  // The true-Sun gear stands still in space, so its pin has a constant
  // absolute direction. For the follower to reproduce Mechanism.longitudes
  // (eccentric with the apogee at 65.5° and mean Sun = b1 + mount) that
  // direction is s + mount − 65.5°, with s the drawing angle of the gear's axis.
  sunMount = 0;
  private sunPinAngle() {
    return ((angleOf(FRONT_AXES.sun56) + this.sunMount - SOLAR_APOGEE_DEG) * Math.PI) / 180;
  }

  private buildPlates() {
    const bounds = [CASE.left + 1, CASE.bottom + 1, CASE.right - 1, CASE.top - 1] as const;
    const front = this.renderer.createTexture(frontPlate());
    const back = this.renderer.createTexture(backPlate());
    const fp = PLATES.front;
    this.add({
      kind: 'front-plate', mesh: this.mesh(plate(...bounds, 0, fp.thickness)), baseColor: PLATE, material: [0.6, 0.6, 1, 0], texture: front,
      place: (_r, _v, zs) => translation(0, 0, zs(fp.z)),
    });
    const bp = PLATES.back;
    this.add({
      kind: 'back-plate', mesh: this.mesh(plate(...bounds, -bp.thickness, 0, true)), baseColor: PLATE, material: [0.6, 0.6, 1, 0], texture: back,
      place: (_r, _v, zs) => translation(0, 0, zs(bp.z)),
    });
    const mp = PLATES.main;
    this.add({
      kind: 'plate', mesh: this.mesh(merge(plate(CASE.left + 1, -150, CASE.right - 1, 78, -mp.thickness, 0))), baseColor: [0.45, 0.38, 0.26, 1], material: [0.6, 0.65, 0, 0],
      place: (_r, _v, zs) => translation(0, 0, zs(mp.z)),
    });
    // The Strap (on the short pillars) and the Circular Plate (on the long
    // pillars) ride on b1.
    const strap = this.mesh(merge(boxMesh(-46, -8, 46, 8, -PLATES.strap.thickness, 0, ((SPOKE_ANGLE.B + 11) * Math.PI) / 180)));
    this.add({
      kind: 'plate', mesh: strap, baseColor: [0.75, 0.58, 0.32, 1], material: [0.85, 0.4, 0, 0], reconstructed: true,
      place: (r, _v, zs) => chain(rotationZ(this.angle(r, 'b1')), translation(0, 0, zs(PLATES.strap.z))),
    });
    const cp = PLATES.circular;
    this.add({
      kind: 'plate', mesh: this.mesh(annulus(6.2, cp.radius, -cp.thickness, 0, 96)), baseColor: [0.75, 0.58, 0.32, 1], material: [0.85, 0.4, 0, 0], reconstructed: true,
      place: (r, _v, zs) => chain(rotationZ(this.angle(r, 'b1')), translation(0, 0, zs(cp.z))),
    });
    // Pillars on the rim of b1: four short (Strap) and four long (CP). Their
    // stubs survive on b1; the plates they carried are reconstructed.
    const pillarMesh = this.mesh(cylinder(1.4, 0, 1, 12));
    for (let k = 0; k < 8; k++) {
      const long = k % 2 === 1;
      const a = ((45 * k + (long ? 0 : 22)) * Math.PI) / 180;
      const r = long ? 52 : 44;
      const z1 = long ? PLATES.circular.z - PLATES.circular.thickness : PLATES.strap.z - PLATES.strap.thickness;
      this.add({
        kind: 'part', mesh: pillarMesh, baseColor: SURVIVING, material: [0.55, 0.75, 0, 0],
        place: (rd, _v, zs) => chain(rotationZ(this.angle(rd, 'b1') + a), translation(r, 0, zs(3.4)), scaling(1, 1, zs(z1) - zs(3.4))),
      });
    }
    // Wooden case: four boards.
    const depth0 = CASE.back;
    const depth1 = CASE.front;
    for (const [x0, y0, x1, y1] of [
      [CASE.left - 6, CASE.bottom - 6, CASE.left, CASE.top + 6],
      [CASE.right, CASE.bottom - 6, CASE.right + 6, CASE.top + 6],
      [CASE.left, CASE.top, CASE.right, CASE.top + 6],
      [CASE.left, CASE.bottom - 6, CASE.right, CASE.bottom],
    ]) {
      this.add({
        kind: 'case', mesh: this.mesh(boxMesh(x0, y0, x1, y1, depth0, depth1)), baseColor: WOOD, material: [0.05, 0.85, 0, 0],
        place: (_r, _v, zs) => chain(translation(0, 0, zs(0)), scaling(1, 1, (zs(depth1) - zs(depth0)) / (depth1 - depth0))),
      });
    }
    // The crank: axle out of the right side, arm and knob.
    const axle = this.mesh(merge(translateMesh(rotateMeshY(cylinder(1.3, 0, 30, 16)), 0, 0, 0)));
    const armMesh = this.mesh(merge(boxMesh(-1.5, -1.5, 1.5, 22, -1, 1), translateMesh(rotateMeshY(cylinder(2.6, 0, 12, 20)), 0, 22, 0)));
    const zc = PLACEMENT.get('b1')!.z - 1.5;
    this.add({ kind: 'part', mesh: axle, baseColor: STEEL, material: [0.9, 0.35, 0, 0], place: (_r, _v, zs) => chain(translation(AXES.a.x, 0, zs(zc)), rotationX(this.crankAngle)) });
    this.add({ kind: 'part', mesh: armMesh, baseColor: [0.45, 0.33, 0.2, 1], material: [0.3, 0.6, 0, 0], place: (_r, _v, zs) => chain(translation(CASE.right + 12, 0, zs(zc)), rotationX(this.crankAngle)) });
  }

  private buildDisplay() {
    const zBase = PLATES.front.z + PLATES.front.thickness;
    // Egyptian calendar ring (movable)
    const cal = this.renderer.createTexture(calendarRing());
    this.add({
      kind: 'display', mesh: this.mesh(annulus(FRONT_RADII.calendarInner, FRONT_RADII.calendarOuter, 0, 0.8, 256, true)), baseColor: PLATE, material: [0.6, 0.6, 1, 0], texture: cal,
      place: (r, _v, zs) => chain(translation(0, 0, zs(zBase)), rotationZ(this.calendarRingAngle(r))),
    });
    // Planet and Sun rings with their markers, after Freeth et al. 2021.
    const rings: { body: Body; color: Color; marker: number }[] = [
      { body: 'mercury', color: STONE.mercury, marker: 1.5 },
      { body: 'venus', color: STONE.venus, marker: 1.7 },
      { body: 'sun', color: GOLD, marker: 2.3 },
      { body: 'mars', color: STONE.mars, marker: 1.6 },
      { body: 'jupiter', color: STONE.jupiter, marker: 1.8 },
      { body: 'saturn', color: STONE.saturn, marker: 1.7 },
    ];
    const markerMesh = this.mesh(sphere(1, 16, 24));
    rings.forEach((ring, i) => {
      const R = FRONT_RADII.rings[ring.body];
      const z = zBase + 1.0 + i * 0.05;
      const ringMesh = this.mesh(merge(annulus(R - 0.9, R + 0.9, 0, 0.5, 160), boxMesh(5.5, -0.4, R - 0.8, 0.4, 0, 0.5)));
      const angle = (r: Readout) => Math.PI / 2 - (r.longitude[ring.body] * Math.PI) / 180;
      this.add({ kind: 'display', mesh: ringMesh, baseColor: [0.62, 0.48, 0.27, 1], material: [0.95, 0.28, 0, 0], reconstructed: true, trains: [ring.body as TrainId], place: (r, _v, zs) => chain(translation(0, 0, zs(z)), rotationZ(angle(r))) });
      this.add({
        kind: 'display', mesh: markerMesh, baseColor: ring.color, material: ring.body === 'sun' ? [1, 0.2, 0, 0.15] : [0.2, 0.25, 0, 0.05], reconstructed: true, trains: [ring.body as TrainId],
        place: (r, _v, zs) => chain(translation(0, 0, zs(z + 0.8)), rotationZ(angle(r)), translation(R, 0, 0), scaling(ring.marker, ring.marker, ring.marker)),
      });
    });
    // Sun pointer from the golden sphere out to the zodiac.
    const sunPtr = this.mesh(translateMesh(pointerMesh(FRONT_RADII.zodiacOuter - 2, 1.6, 0.5), 0, 0, 0));
    this.add({ kind: 'display', mesh: sunPtr, baseColor: GOLD, material: [1, 0.25, 0, 0.1], reconstructed: true, trains: ['sun'], place: (r, _v, zs) => chain(translation(0, 0, zs(zBase + 2.4)), rotationZ(Math.PI / 2 - (r.longitude.sun * Math.PI) / 180)) });
    // Date pointer on the outermost ring, reaching the calendar.
    const dateMesh = this.mesh(merge(annulus(FRONT_RADII.rings.date - 1.2, FRONT_RADII.rings.date + 1.2, 0, 0.6, 160), pointerMesh(FRONT_RADII.calendarOuter - 1, 1.4, 0.6)));
    this.add({ kind: 'display', mesh: dateMesh, baseColor: RECONSTRUCTED, material: [0.95, 0.28, 0, 0], reconstructed: true, place: (r, _v, zs) => chain(translation(0, 0, zs(zBase + 1.6)), rotationZ(Math.PI / 2 - (r.meanSun * Math.PI) / 180)) });
    // Moon pointer with the phase ball.
    const moonPtr = this.mesh(pointerMesh(FRONT_RADII.zodiacOuter - 1, 1.8, 0.7, 6));
    this.add({ kind: 'display', mesh: moonPtr, baseColor: [0.72, 0.72, 0.7, 1], material: [0.95, 0.25, 0, 0], trains: ['moon'], place: (r, _v, zs) => chain(translation(0, 0, zs(zBase + 3.6)), rotationZ(Math.PI / 2 - (r.longitude.moon * Math.PI) / 180)) });
    const ballTex = this.renderer.createTexture(phaseBall());
    this.add({
      kind: 'display', mesh: this.mesh(sphere(3, 32, 48)), baseColor: [1, 1, 1, 1], material: [0.4, 0.4, 1, 0.05], texture: ballTex, trains: ['phase'],
      // Pole along the pointer; turned by the elongation so the dark half faces
      // the viewer at new Moon and the silver half at full Moon. After the
      // rotations the viewer looks at ball azimuth 270° + elongation, and the
      // texture is silver for azimuth 0–180°.
      place: (r, _v, zs) => chain(translation(0, 0, zs(zBase + 7)), rotationZ(Math.PI / 2 - (r.longitude.moon * Math.PI) / 180), translation(12, 0, 0), rotationY(Math.PI / 2), rotationZ(-Math.PI / 2 - (r.phase * Math.PI) / 180)),
    });
    // Dragon Hand (speculative).
    const dragon = this.mesh(dragonMesh(40, 1.4, 0.5));
    this.add({ kind: 'display', mesh: dragon, baseColor: SPECULATIVE, material: [0.9, 0.3, 0, 0], reconstructed: true, trains: ['nodes'], place: (r, _v, zs) => chain(translation(0, 0, zs(zBase + 4.6)), rotationZ(Math.PI / 2 - (r.longitude.nodes * Math.PI) / 180)) });
    // Earth dome at the centre.
    this.add({ kind: 'display', mesh: this.mesh(sphere(4, 16, 24)), baseColor: [0.35, 0.5, 0.55, 1], material: [0.3, 0.5, 0, 0], place: (_r, _v, zs) => chain(translation(0, 0, zs(zBase + 4.5)), scaling(1, 1, 0.6)) });

    // Back dials: spiral pointers whose length follows the groove.
    const zBack = PLATES.back.z - PLATES.back.thickness;
    const backPtr = (centre: { x: number; y: number }, length: (r: Readout) => number, angle: (r: Readout) => number, train: TrainId) => {
      const m = this.mesh(pointerMesh(1, 0.12, 0.6, 0));
      const hub = this.mesh(annulus(0, 2.2, 0, 0.8, 24));
      this.add({ kind: 'display', mesh: hub, baseColor: [0.6, 0.5, 0.32, 1], material: [0.8, 0.4, 0, 0], trains: [train], place: (_r, _v, zs) => translation(centre.x, centre.y, zs(zBack) - 1.2) });
      this.add({
        kind: 'display', mesh: m, baseColor: [0.62, 0.52, 0.33, 1], material: [0.85, 0.4, 0, 0], trains: [train],
        // Seen from the back, clockwise from 12 o'clock by β is drawing angle 90° + β.
        place: (r, _v, zs) => chain(translation(centre.x, centre.y, zs(zBack) - 1.0), rotationZ(Math.PI / 2 + angle(r)), scaling(length(r), 12, 1)),
      });
    };
    const met = BACK_RADII.metonic;
    const sar = BACK_RADII.saros;
    const spiralR = (cells: number, turns: number, r0: number, r1: number, cell: number) => r0 + (cell / (cells / turns)) * ((r1 - r0) / turns);
    backPtr(DIAL_CENTRES.metonic, (r) => spiralR(235, met.turns, met.inner, met.outer, r.dials.metonicMonth) + 2, (r) => (r.dials.metonicMonth / 47) * TAU, 'metonic');
    backPtr(DIAL_CENTRES.saros, (r) => spiralR(223, sar.turns, sar.inner, sar.outer, r.dials.sarosMonth) + 2, (r) => (r.dials.sarosMonth / (223 / 4)) * TAU, 'saros');
    const sub = BACK_RADII.subsidiary - 1;
    backPtr(DIAL_CENTRES.olympiad, () => sub, (r) => (r.dials.olympiadYear / 4) * TAU, 'olympiad');
    backPtr(DIAL_CENTRES.callippic, () => sub, (r) => (r.dials.callippicYear / 76) * TAU, 'callippic');
    backPtr(DIAL_CENTRES.exeligmos, () => sub, (r) => (r.dials.exeligmos / 3) * TAU, 'exeligmos');
  }

  // The calendar ring is turned so the date pointer reads the Egyptian date;
  // it moves in whole-day steps (one of 365 holes), which is how the maker
  // absorbed the quarter day per year (Freeth et al. 2021, Supp. §6.4.2).
  private calendarRingAngle(r: Readout) {
    // Day d of the ring is drawn d·360/365 clockwise from 12 o'clock; the date
    // pointer stands at drawing angle 90° − mean Sun. Turning the ring by
    // −meanSun + day·360/365 puts today under the pointer. That quantity only
    // drifts by a day every four years, so rounding it to whole holes gives
    // the leap-day step.
    const e = egyptianDate(r.jd);
    const dayDeg = 360 / 365;
    const ideal = -r.meanSun + (e.dayOfYear + e.fraction) * dayDeg;
    return (Math.round(ideal / dayDeg) * dayDeg * Math.PI) / 180;
  }

  // ── Per frame ───────────────────────────────────────────────────────────
  update(r: Readout, v: ViewSettings) {
    const zs = (z: number) => z * (1 + 2.4 * v.explode);
    const selectedTrain = v.train ?? (v.selected ? GEAR.get(v.selected)?.train ?? null : null);
    for (const it of this.items) {
      const o = it.obj;
      o.model = it.place(r, v, zs);
      const c = it.baseColor;
      let alpha = c[3];
      let visible = true;
      if (it.reconstructed && v.reconstructed === 'hide') visible = false;
      if (it.reconstructed && v.reconstructed === 'ghost') alpha = 0.12;
      if ((it.kind === 'front-plate' || it.kind === 'back-plate' || it.kind === 'case' || it.kind === 'plate') && !v.plates) visible = false;
      if (v.xray) alpha *= it.kind === 'front-plate' || it.kind === 'back-plate' ? 0.35 : it.kind === 'case' ? 0.15 : it.kind === 'gear' ? 0.75 : 0.6;
      o.visible = visible;
      o.color = [c[0], c[1], c[2], alpha];
      const sel = it.gear && v.selected === it.gear.id;
      const inTrain = selectedTrain && it.trains?.includes(selectedTrain);
      o.highlight = sel ? [0.32, 0.22, 0.05, Math.sin(performance.now() / 260) * 0.5 + 0.5] : inTrain ? [0.12, 0.09, 0.03, 0] : [0, 0, 0, 0];
    }
  }

  // Ray pick against gear discs (front faces); plates block when shown solid.
  pick(origin: Vec3, dir: Vec3, v: ViewSettings, r: Readout): string | null {
    const zs = (z: number) => z * (1 + 2.4 * v.explode);
    let best: { t: number; id: string | null } = { t: Infinity, id: null };
    const blockers = v.plates && !v.xray && !v.slice.enabled ? [zs(PLATES.front.z + PLATES.front.thickness), zs(PLATES.back.z - PLATES.back.thickness)] : [];
    for (const z of blockers) {
      if (Math.abs(dir[2]) < 1e-6) continue;
      const t = (z - origin[2]) / dir[2];
      const x = origin[0] + t * dir[0];
      const y = origin[1] + t * dir[1];
      if (t > 0 && t < best.t && x > CASE.left && x < CASE.right && y > CASE.bottom && y < CASE.top) best = { t, id: null };
    }
    for (const p of PLACEMENTS) {
      const it = this.gearItems.get(p.id)!;
      if (!it.obj.visible || it.obj.color[3] < 0.2) continue;
      if (p.id === 'a1' || p.id === 'ma1') continue;
      const m = this.gearMatrix(r, p, zs);
      const cx = m[12];
      const cy = m[13];
      for (const z of [m[14], m[14] - p.thickness]) {
        if (Math.abs(dir[2]) < 1e-6) continue;
        const t = (z - origin[2]) / dir[2];
        if (t <= 0 || t >= best.t) continue;
        const x = origin[0] + t * dir[0];
        const y = origin[1] + t * dir[1];
        const d = Math.hypot(x - cx, y - cy);
        if (d <= p.outerR && d >= Math.min(1.2, p.hub)) best = { t, id: p.id };
      }
    }
    return best.id;
  }

  gearWorldPosition(id: string, r: Readout, v: ViewSettings): Vec3 {
    const p = PLACEMENT.get(id)!;
    const m = this.gearMatrix(r, p, (z) => z * (1 + 2.4 * v.explode));
    return [m[12], m[13], m[14]];
  }
}

// Rotate a mesh lying along +z so it lies along +x (for the crank axle).
function rotateMeshY(m: ReturnType<typeof cylinder>) {
  const p = m.positions.slice();
  const n = m.normals.slice();
  for (let i = 0; i < p.length; i += 3) {
    [p[i], p[i + 2]] = [p[i + 2], -p[i]];
    [n[i], n[i + 2]] = [n[i + 2], -n[i]];
  }
  return { ...m, positions: p, normals: n };
}

export { GEAR_INDEX };
