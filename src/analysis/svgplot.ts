// Static SVG charts for the README. Small multiples on a light surface with
// recessive grids, 2px lines, and a legend whenever there are two or more
// series. Colours are the validated reference palette (blue, orange) plus a
// neutral grey for reference lines.

export const PALETTE = {
  surface: '#fcfcfb',
  text: '#0b0b0b',
  muted: '#52514e',
  grid: '#e8e7e3',
  axis: '#c9c8c2',
  series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'],
  neutral: '#8a8983',
};

export interface Line {
  label: string;
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  color: string;
  dashed?: boolean;
  width?: number;
}

export interface Panel {
  title: string;
  lines: Line[];
  yRange?: [number, number];
  yLabel?: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const niceStep = (span: number, target: number) => {
  const raw = span / Math.max(target, 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
};

const fmt = (v: number, step: number) => {
  const d = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  return (Math.abs(v) < step * 1e-6 ? 0 : v).toFixed(Math.min(d, 3)).replace('-', '−');
};

const extent = (lines: Line[]): [number, number] => {
  let lo = Infinity;
  let hi = -Infinity;
  for (const l of lines) for (let i = 0; i < l.y.length; i++) if (Number.isFinite(l.y[i])) [lo, hi] = [Math.min(lo, l.y[i]), Math.max(hi, l.y[i])];
  if (lo > hi) return [0, 1];
  const pad = (hi - lo) * 0.08 || 1;
  return [lo - pad, hi + pad];
};

// Thin polylines: decimate to at most ~2 points per pixel column keeping min/max.
const path = (l: Line, sx: (x: number) => number, sy: (y: number) => number, px: number) => {
  const pts: string[] = [];
  let col = -1;
  let lo = 0;
  let hi = 0;
  let loX = 0;
  let hiX = 0;
  const flush = () => {
    if (col < 0) return;
    const [a, b] = loX < hiX ? [[loX, lo], [hiX, hi]] : [[hiX, hi], [loX, lo]];
    pts.push(`${sx(a[0]).toFixed(1)},${sy(a[1]).toFixed(1)}`);
    if (lo !== hi) pts.push(`${sx(b[0]).toFixed(1)},${sy(b[1]).toFixed(1)}`);
  };
  for (let i = 0; i < l.x.length; i++) {
    const c = Math.floor(sx(l.x[i]) / (px / 2));
    const y = l.y[i];
    if (c !== col) {
      flush();
      col = c;
      lo = hi = y;
      loX = hiX = l.x[i];
    } else {
      if (y < lo) [lo, loX] = [y, l.x[i]];
      if (y > hi) [hi, hiX] = [y, l.x[i]];
    }
  }
  flush();
  return `<polyline fill="none" stroke="${l.color}" stroke-width="${l.width ?? 1.5}" stroke-linejoin="round"${l.dashed ? ' stroke-dasharray="5 4"' : ''} points="${pts.join(' ')}"/>`;
};

export const smallMultiples = (
  panels: Panel[],
  opts: { columns: number; width: number; panelHeight: number; xLabel: string; xFormat?: (x: number) => string; title?: string },
) => {
  const { columns, width, panelHeight } = opts;
  const legendLines = panels[0]?.lines ?? [];
  const head = (opts.title ? 30 : 8) + (legendLines.length > 1 ? 22 : 0);
  const rows = Math.ceil(panels.length / columns);
  const gap = 18;
  const pw = (width - 16 - gap * (columns - 1)) / columns;
  const height = head + rows * (panelHeight + gap) + 18;
  const xf = opts.xFormat ?? ((x: number) => String(x));
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="11">`);
  out.push(`<rect width="${width}" height="${height}" fill="${PALETTE.surface}"/>`);
  if (opts.title) out.push(`<text x="8" y="20" font-size="14" font-weight="600" fill="${PALETTE.text}">${esc(opts.title)}</text>`);
  if (legendLines.length > 1) {
    let lx = 8;
    const ly = (opts.title ? 30 : 8) + 12;
    for (const l of legendLines) {
      out.push(`<line x1="${lx}" y1="${ly}" x2="${lx + 18}" y2="${ly}" stroke="${l.color}" stroke-width="2"${l.dashed ? ' stroke-dasharray="5 4"' : ''}/>`);
      out.push(`<text x="${lx + 24}" y="${ly + 4}" fill="${PALETTE.muted}">${esc(l.label)}</text>`);
      lx += 34 + l.label.length * 6.2;
    }
  }
  panels.forEach((p, i) => {
    const ox = 8 + (i % columns) * (pw + gap);
    const oy = head + Math.floor(i / columns) * (panelHeight + gap);
    const left = 40;
    const top = 18;
    const bottom = 20;
    const w = pw - left - 4;
    const h = panelHeight - top - bottom;
    const xs = p.lines[0].x;
    const xr: [number, number] = [xs[0], xs[xs.length - 1]];
    const yr = p.yRange ?? extent(p.lines);
    const sx = (x: number) => ox + left + ((x - xr[0]) / (xr[1] - xr[0])) * w;
    const sy = (y: number) => oy + top + h - ((y - yr[0]) / (yr[1] - yr[0])) * h;
    out.push(`<text x="${ox + left}" y="${oy + 12}" font-weight="600" fill="${PALETTE.text}">${esc(p.title)}</text>`);
    const ys = niceStep(yr[1] - yr[0], h / 26);
    for (let v = Math.ceil(yr[0] / ys) * ys; v <= yr[1] + 1e-9; v += ys) {
      const y = sy(v).toFixed(1);
      out.push(`<line x1="${ox + left}" x2="${ox + left + w}" y1="${y}" y2="${y}" stroke="${Math.abs(v) < ys * 1e-6 ? PALETTE.axis : PALETTE.grid}"/>`);
      out.push(`<text x="${ox + left - 5}" y="${(+y + 3.5).toFixed(1)}" text-anchor="end" fill="${PALETTE.muted}">${fmt(v, ys)}</text>`);
    }
    const xstep = niceStep(xr[1] - xr[0], w / 60);
    for (let v = Math.ceil(xr[0] / xstep) * xstep; v <= xr[1] + 1e-9; v += xstep) {
      const x = sx(v).toFixed(1);
      out.push(`<line x1="${x}" x2="${x}" y1="${oy + top + h}" y2="${oy + top + h + 3}" stroke="${PALETTE.axis}"/>`);
      out.push(`<text x="${x}" y="${oy + top + h + 14}" text-anchor="middle" fill="${PALETTE.muted}">${esc(xf(v))}</text>`);
    }
    out.push(`<clipPath id="c${i}"><rect x="${ox + left}" y="${oy + top}" width="${w}" height="${h}"/></clipPath>`);
    out.push(`<g clip-path="url(#c${i})">`);
    for (const l of p.lines) out.push(path(l, sx, sy, 1));
    out.push('</g>');
    if (p.yLabel) out.push(`<text x="${ox + left + w}" y="${oy + 12}" text-anchor="end" fill="${PALETTE.muted}">${esc(p.yLabel)}</text>`);
  });
  out.push(`<text x="${width - 8}" y="${height - 4}" text-anchor="end" fill="${PALETTE.muted}">${esc(opts.xLabel)}</text>`);
  out.push('</svg>');
  return out.join('\n');
};

export interface Bar {
  label: string;
  values: { value: number; color: string; name: string }[];
}

// Grouped horizontal bars, for comparing the Monte Carlo spreads with Edmunds.
export const groupedBars = (groups: Bar[], opts: { width: number; title: string; unit: string; legend: { name: string; color: string }[] }) => {
  const rowH = 14;
  const groupGap = 10;
  const left = 150;
  const head = 54;
  const n = groups[0].values.length;
  const height = head + groups.length * (n * (rowH + 2) + groupGap) + 24;
  const max = Math.max(...groups.flatMap((g) => g.values.map((v) => v.value))) * 1.12;
  const w = opts.width - left - 60;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${opts.width} ${height}" width="${opts.width}" height="${height}" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="11">`);
  out.push(`<rect width="${opts.width}" height="${height}" fill="${PALETTE.surface}"/>`);
  out.push(`<text x="8" y="20" font-size="14" font-weight="600" fill="${PALETTE.text}">${esc(opts.title)}</text>`);
  let lx = 8;
  for (const l of opts.legend) {
    out.push(`<rect x="${lx}" y="32" width="12" height="10" rx="2" fill="${l.color}"/>`);
    out.push(`<text x="${lx + 17}" y="41" fill="${PALETTE.muted}">${esc(l.name)}</text>`);
    lx += 30 + l.name.length * 6.2;
  }
  let y = head;
  for (const g of groups) {
    out.push(`<text x="${left - 8}" y="${y + (n * (rowH + 2)) / 2 + 3}" text-anchor="end" fill="${PALETTE.text}">${esc(g.label)}</text>`);
    for (const v of g.values) {
      const bw = Math.max(1, (v.value / max) * w);
      out.push(`<rect x="${left}" y="${y}" width="${bw.toFixed(1)}" height="${rowH}" rx="2" fill="${v.color}"/>`);
      out.push(`<text x="${left + bw + 5}" y="${y + rowH - 3}" fill="${PALETTE.muted}">${v.value.toFixed(v.value < 10 ? 2 : 1)}${opts.unit}</text>`);
      y += rowH + 2;
    }
    y += groupGap;
  }
  out.push('</svg>');
  return out.join('\n');
};
