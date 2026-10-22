// Orbit camera with eased transitions between presets.

import { lookAt, perspective, multiply, invert, transformPoint, norm, sub, cross, type Vec3 } from './math.ts';

export interface Pose {
  target: Vec3;
  yaw: number; // radians, 0 = looking at the front (from +z)
  pitch: number;
  distance: number;
}

export const PRESETS: Record<string, { label: string; pose: Pose }> = {
  front: { label: 'Front', pose: { target: [0, -18, 30], yaw: 0, pitch: 0, distance: 430 } },
  back: { label: 'Back', pose: { target: [0, -20, -30], yaw: Math.PI, pitch: 0, distance: 430 } },
  three: { label: '¾ view', pose: { target: [0, -15, 0], yaw: 0.75, pitch: 0.38, distance: 460 } },
  side: { label: 'Side', pose: { target: [0, -15, 0], yaw: Math.PI / 2, pitch: 0.08, distance: 420 } },
  lunar: { label: 'Lunar anomaly', pose: { target: [0, 6, -24], yaw: Math.PI + 0.3, pitch: 0.2, distance: 120 } },
  cosmos: { label: 'Cosmos gearing', pose: { target: [0, 0, 18], yaw: 0.35, pitch: 0.3, distance: 190 } },
  dials: { label: 'Back dials', pose: { target: [0, -20, -40], yaw: Math.PI, pitch: 0.0, distance: 380 } },
};

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export class OrbitCamera {
  pose: Pose = { ...PRESETS.three.pose, target: [...PRESETS.three.pose.target] as Vec3 };
  private from: Pose | null = null;
  private to: Pose | null = null;
  private t0 = 0;
  private dur = 0;
  fov = (34 * Math.PI) / 180;
  aspect = 16 / 9;

  eye(): Vec3 {
    const { target, yaw, pitch, distance } = this.pose;
    return [target[0] + distance * Math.cos(pitch) * Math.sin(yaw), target[1] + distance * Math.sin(pitch), target[2] + distance * Math.cos(pitch) * Math.cos(yaw)];
  }

  update(now: number) {
    if (!this.from || !this.to) return;
    const t = Math.min(1, (now - this.t0) / this.dur);
    const k = ease(t);
    const lerp = (a: number, b: number) => a + (b - a) * k;
    // Shortest way round in yaw.
    let dy = this.to.yaw - this.from.yaw;
    dy -= Math.PI * 2 * Math.round(dy / (Math.PI * 2));
    this.pose = {
      target: [lerp(this.from.target[0], this.to.target[0]), lerp(this.from.target[1], this.to.target[1]), lerp(this.from.target[2], this.to.target[2])],
      yaw: this.from.yaw + dy * k,
      pitch: lerp(this.from.pitch, this.to.pitch),
      distance: Math.exp(lerp(Math.log(this.from.distance), Math.log(this.to.distance))),
    };
    if (t >= 1) this.from = this.to = null;
  }

  animateTo(p: Pose, ms = 900) {
    this.from = { ...this.pose, target: [...this.pose.target] as Vec3 };
    this.to = { ...p, target: [...p.target] as Vec3 };
    this.t0 = performance.now();
    this.dur = ms;
  }

  stop() {
    this.from = this.to = null;
  }

  orbit(dx: number, dy: number) {
    this.stop();
    this.pose.yaw -= dx * 0.006;
    this.pose.pitch = Math.max(-1.45, Math.min(1.45, this.pose.pitch + dy * 0.006));
  }

  pan(dx: number, dy: number) {
    this.stop();
    const e = this.eye();
    const f = norm(sub(this.pose.target, e));
    const right = norm(cross(f, [0, 1, 0]));
    const up = cross(right, f);
    const s = this.pose.distance * 0.0012;
    for (let i = 0; i < 3; i++) this.pose.target[i] += (-right[i] * dx + up[i] * dy) * s;
  }

  zoom(factor: number) {
    this.stop();
    this.pose.distance = Math.max(40, Math.min(1400, this.pose.distance * factor));
  }

  matrices() {
    const view = lookAt(this.eye(), this.pose.target, [0, 1, 0]);
    const proj = perspective(this.fov, this.aspect, 2, 5000);
    return { view, proj, viewProj: multiply(proj, view) };
  }

  // World-space ray through a canvas point (CSS pixels).
  ray(x: number, y: number, w: number, h: number): { origin: Vec3; dir: Vec3 } {
    const inv = invert(this.matrices().viewProj);
    const nx = (x / w) * 2 - 1;
    const ny = 1 - (y / h) * 2;
    const a = transformPoint(inv, [nx, ny, 0]);
    const b = transformPoint(inv, [nx, ny, 1]);
    return { origin: a, dir: norm(sub(b, a)) };
  }
}
