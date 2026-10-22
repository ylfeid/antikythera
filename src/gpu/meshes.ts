// Procedural geometry. Everything is generated here from the layout numbers;
// no scans, photographs or traced drawings are used.
//
// Gears have the triangular teeth of the original: the outline alternates
// between tips on the outer radius and roots on the inner radius, with no
// involute or rounding. Larger wheels get a rim, four spokes and a hub, like
// the surviving ones.

export interface MeshData {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

const empty = (): MeshData => ({ positions: [], normals: [], uvs: [], indices: [] });

const vert = (m: MeshData, x: number, y: number, z: number, nx: number, ny: number, nz: number, u = 0, v = 0) => {
  m.positions.push(x, y, z);
  m.normals.push(nx, ny, nz);
  m.uvs.push(u, v);
  return m.positions.length / 3 - 1;
};

// A closed 2D outline extruded between z0 (back) and z1 (front), with caps
// built as a fan/strip against an inner outline (or a centre point).
// `outer` and `inner` must have the same number of points.
const ring = (m: MeshData, outer: [number, number][], inner: [number, number][] | null, z0: number, z1: number, capUV?: (x: number, y: number) => [number, number]) => {
  const n = outer.length;
  const uv = capUV ?? ((x: number, y: number) => [x, y] as [number, number]);
  // Fan centre for solid shapes: the vertex centroid (shapes are star-shaped about it).
  const cx = outer.reduce((s, p) => s + p[0], 0) / n;
  const cy = outer.reduce((s, p) => s + p[1], 0) / n;
  // Caps
  for (const [z, nz] of [
    [z1, 1],
    [z0, -1],
  ] as const) {
    const base = m.positions.length / 3;
    for (const [x, y] of outer) vert(m, x, y, z, 0, 0, nz, ...uv(x, y));
    if (inner) for (const [x, y] of inner) vert(m, x, y, z, 0, 0, nz, ...uv(x, y));
    else vert(m, cx, cy, z, 0, 0, nz, ...uv(cx, cy));
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (inner) {
        const a = base + i;
        const b = base + j;
        const c = base + n + j;
        const d = base + n + i;
        if (nz > 0) m.indices.push(a, b, c, a, c, d);
        else m.indices.push(a, c, b, a, d, c);
      } else {
        const c = base + n;
        if (nz > 0) m.indices.push(base + i, base + j, c);
        else m.indices.push(base + i, c, base + j);
      }
    }
  }
  // Side walls, flat-shaded per segment.
  const wall = (pts: [number, number][], outward: boolean) => {
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      let nx = y1 - y0;
      let ny = -(x1 - x0);
      const l = Math.hypot(nx, ny) || 1;
      nx /= l;
      ny /= l;
      if (!outward) {
        nx = -nx;
        ny = -ny;
      }
      const a = vert(m, x0, y0, z0, nx, ny, 0);
      const b = vert(m, x1, y1, z0, nx, ny, 0);
      const c = vert(m, x1, y1, z1, nx, ny, 0);
      const d = vert(m, x0, y0, z1, nx, ny, 0);
      if (outward) m.indices.push(a, b, c, a, c, d);
      else m.indices.push(a, c, b, a, d, c);
    }
  };
  wall(outer, true);
  if (inner) wall(inner, false);
};

const circle = (r: number, n: number, phase = 0): [number, number][] =>
  Array.from({ length: n }, (_, i) => {
    const a = phase + (i / n) * Math.PI * 2;
    return [r * Math.cos(a), r * Math.sin(a)];
  });

// Axis-aligned box from (x0,y0,z0) to (x1,y1,z1), optionally rotated about z.
export const box = (m: MeshData, x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, angle = 0) => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const rot = (x: number, y: number): [number, number] => [x * c - y * s, x * s + y * c];
  const outline: [number, number][] = [rot(x0, y0), rot(x1, y0), rot(x1, y1), rot(x0, y1)];
  ring(m, outline, null, z0, z1);
};

export interface GearShape {
  teeth: number;
  outerR: number;
  innerR: number;
  thickness: number;
  spokes: number;
  hub: number;
}

export const gearMesh = (g: GearShape): MeshData => {
  const m = empty();
  const n = g.teeth;
  const z0 = -g.thickness;
  const z1 = 0;
  // Triangular teeth: tip, root, tip, root …
  const outline: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const b = ((k + 0.5) / n) * Math.PI * 2;
    outline.push([g.outerR * Math.cos(a), g.outerR * Math.sin(a)]);
    outline.push([g.innerR * Math.cos(b), g.innerR * Math.sin(b)]);
  }
  if (g.spokes > 0 && g.innerR > 8) {
    const rimW = Math.max(1.4, g.innerR * 0.12);
    const rimInner = g.innerR - rimW;
    // Rim: toothed outline against a circle with matching vertex count.
    const inner = outline.map((_, i) => {
      const a = ((i / 2) / n) * Math.PI * 2;
      return [rimInner * Math.cos(a), rimInner * Math.sin(a)] as [number, number];
    });
    ring(m, outline, inner, z0, z1);
    // Hub
    const hubR = Math.max(2.2, g.innerR * 0.14);
    ring(m, circle(hubR, 32), circle(Math.min(1.2, hubR * 0.5), 32), z0, z1);
    // Spokes
    const w = Math.max(1.2, g.innerR * 0.09);
    for (let s = 0; s < g.spokes; s++) {
      const a = (s / g.spokes) * Math.PI * 2 + Math.PI / 4;
      box(m, hubR * 0.8, -w / 2, rimInner + 0.3, w / 2, z0 + 0.05, z1 - 0.05, a);
    }
  } else {
    const hole = Math.max(0.6, Math.min(g.hub, g.innerR * 0.25));
    const inner = outline.map((_, i) => {
      const a = ((i / 2) / n) * Math.PI * 2;
      return [hole * Math.cos(a), hole * Math.sin(a)] as [number, number];
    });
    ring(m, outline, inner, z0, z1);
  }
  return m;
};

// Annulus (or disk with r0 = 0) between z0 and z1, with polar UVs:
// u = angle / 2π, v = radial fraction (0 inner → 1 outer).
export const annulus = (r0: number, r1: number, z0: number, z1: number, segments = 128, planarUV = false): MeshData => {
  const m = empty();
  const outer = circle(r1, segments);
  const inner = r0 > 0 ? circle(r0, segments) : null;
  // Planar UVs map the square [−r1, r1]² to [0, 1]².
  const uv = (x: number, y: number): [number, number] => (planarUV ? [0.5 + x / (2 * r1), 0.5 - y / (2 * r1)] : [0, 0]);
  ring(m, outer, inner, z0, z1, uv);
  return m;
};

export const cylinder = (r: number, z0: number, z1: number, segments = 20) => annulus(0, r, z0, z1, segments);

export const tube = (r0: number, r1: number, z0: number, z1: number, segments = 48) => annulus(r0, r1, z0, z1, segments);

export const sphere = (r: number, rings = 24, segs = 36): MeshData => {
  const m = empty();
  for (let i = 0; i <= rings; i++) {
    const t = (i / rings) * Math.PI;
    for (let j = 0; j <= segs; j++) {
      const p = (j / segs) * Math.PI * 2;
      const x = Math.sin(t) * Math.cos(p);
      const y = Math.sin(t) * Math.sin(p);
      const z = Math.cos(t);
      vert(m, r * x, r * y, r * z, x, y, z, j / segs, i / rings);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * (segs + 1) + j;
      const b = a + segs + 1;
      m.indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return m;
};

// Rectangular plate with planar UVs over [x0,x1]×[y0,y1] (front face) and an
// optional mirrored mapping for a plate seen from the back.
export const plate = (x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, mirrorU = false): MeshData => {
  const m = empty();
  const uv = (x: number, y: number): [number, number] => {
    const u = (x - x0) / (x1 - x0);
    return [mirrorU ? 1 - u : u, 1 - (y - y0) / (y1 - y0)];
  };
  ring(m, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], null, z0, z1, uv);
  return m;
};

// A tapered pointer from the centre to radius `len`, lying along +x.
export const pointerMesh = (len: number, width: number, thickness: number, tail = 0): MeshData => {
  const m = empty();
  const w = width / 2;
  const outline: [number, number][] = [
    [-tail, -w * 0.8],
    [len - width * 1.5, -w],
    [len, 0],
    [len - width * 1.5, w],
    [-tail, w * 0.8],
  ];
  ring(m, outline, null, 0, thickness);
  return m;
};

// Double-ended Dragon Hand: a pointer with a triangular head at +x and a
// forked tail at −x.
export const dragonMesh = (len: number, width: number, thickness: number): MeshData => {
  const m = empty();
  const w = width / 2;
  ring(m, [[-len + width * 2, -w], [len - width * 2.5, -w], [len - width * 2.5, w], [-len + width * 2, w]], null, 0, thickness);
  ring(m, [[len - width * 2.5, -w * 3], [len, 0], [len - width * 2.5, w * 3]], null, 0, thickness);
  ring(m, [[-len, -w * 2.6], [-len + width * 2.2, 0], [-len, w * 2.6], [-len + width * 0.6, 0]], null, 0, thickness);
  return m;
};

export const merge = (...ms: MeshData[]): MeshData => {
  const out = empty();
  for (const m of ms) {
    const base = out.positions.length / 3;
    out.positions.push(...m.positions);
    out.normals.push(...m.normals);
    out.uvs.push(...m.uvs);
    for (const i of m.indices) out.indices.push(i + base);
  }
  return out;
};

export const translateMesh = (m: MeshData, dx: number, dy: number, dz: number): MeshData => {
  const p = m.positions.slice();
  for (let i = 0; i < p.length; i += 3) {
    p[i] += dx;
    p[i + 1] += dy;
    p[i + 2] += dz;
  }
  return { ...m, positions: p };
};

export const boxMesh = (x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, angle = 0) => {
  const m = empty();
  box(m, x0, y0, x1, y1, z0, z1, angle);
  return m;
};
