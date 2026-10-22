// Minimal Canvas 2D line charts (shared with Aeolus) with a hover crosshair,
// a value readout and an optional marker line. Colours come from CSS custom
// properties on the canvas so they follow the theme.

export interface Series {
  label: string;
  color: string; // CSS variable name, e.g. '--series-1'
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  dashed?: boolean;
  dots?: boolean;
}

export interface ChartSpec {
  series: Series[];
  xLabel?: string;
  xRange?: [number, number];
  yRange?: [number, number];
  emptyText?: string;
  xFormat?: (x: number) => string;
  yUnit?: string;
  marker?: number; // vertical line at this x
}

const niceStep = (span: number, target: number) => {
  const raw = span / Math.max(target, 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
};

const format = (v: number, step: number) => {
  const digits = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  return v.toFixed(Math.min(digits, 4));
};

export const extent = (values: ArrayLike<number>[]): [number, number] => {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    for (let k = 0; k < v.length; k++) {
      if (!Number.isFinite(v[k])) continue;
      lo = Math.min(lo, v[k]);
      hi = Math.max(hi, v[k]);
    }
  }
  if (lo > hi) return [0, 1];
  if (hi - lo < 1e-9) return [lo - 0.5, hi + 0.5];
  const pad = (hi - lo) * 0.08;
  return [lo - pad, hi + pad];
};

export class Chart {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private spec: ChartSpec | null = null;
  private hoverPx: number | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    // Hit area is the whole canvas, not just the line.
    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.hoverPx = e.clientX - r.left;
      if (this.spec) this.draw(this.spec);
    });
    canvas.addEventListener('pointerleave', () => {
      this.hoverPx = null;
      if (this.spec) this.draw(this.spec);
    });
  }

  draw(spec: ChartSpec) {
    this.spec = spec;
    const { canvas, ctx } = this;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const css = getComputedStyle(canvas);
    const color = (name: string) => css.getPropertyValue(name).trim() || '#888';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.font = `10px ${css.getPropertyValue('--mono').trim() || 'monospace'}`;

    const left = 38;
    const right = 14;
    const top = 16;
    const bottom = spec.xLabel ? 26 : 18;
    const pw = w - left - right;
    const ph = h - top - bottom;

    const xr = spec.xRange ?? extent(spec.series.map((s) => s.x));
    const yr = spec.yRange ?? extent(spec.series.map((s) => s.y));
    const sx = (x: number) => left + ((x - xr[0]) / (xr[1] - xr[0])) * pw;
    const sy = (y: number) => top + ph - ((y - yr[0]) / (yr[1] - yr[0])) * ph;

    // Grid and ticks
    ctx.strokeStyle = color('--chart-grid');
    ctx.fillStyle = color('--chart-text');
    ctx.lineWidth = 1;
    const ys = niceStep(yr[1] - yr[0], ph / 28);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let v = Math.ceil(yr[0] / ys) * ys; v <= yr[1] + 1e-12; v += ys) {
      const y = Math.round(sy(v)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + pw, y);
      ctx.stroke();
      ctx.fillText(format(Math.abs(v) < ys * 1e-6 ? 0 : v, ys), left - 5, y);
    }
    const xs = niceStep(xr[1] - xr[0], pw / 56);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let v = Math.ceil(xr[0] / xs) * xs; v <= xr[1] + 1e-12; v += xs) {
      const x = Math.round(sx(v)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, top + ph);
      ctx.lineTo(x, top + ph + 3);
      ctx.stroke();
      ctx.fillText(spec.xFormat ? spec.xFormat(v) : format(Math.abs(v) < xs * 1e-6 ? 0 : v, xs), x, top + ph + 5);
    }
    if (spec.xLabel) {
      ctx.textAlign = 'right';
      ctx.fillText(spec.xLabel, left + pw, top + ph + 15);
    }
    ctx.strokeStyle = color('--chart-axis');
    ctx.strokeRect(left + 0.5, top + 0.5, pw, ph);

    const empty = spec.series.every((s) => s.x.length === 0);
    if (empty && spec.emptyText) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(spec.emptyText, left + pw / 2, top + ph / 2);
    }

    // Series
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, pw, ph);
    ctx.clip();
    for (const s of spec.series) {
      const c = color(s.color);
      ctx.strokeStyle = c;
      ctx.fillStyle = c;
      ctx.lineWidth = 1.5;
      ctx.setLineDash(s.dashed ? [4, 3] : []);
      ctx.beginPath();
      let started = false;
      for (let k = 0; k < s.x.length; k++) {
        if (!Number.isFinite(s.y[k])) {
          started = false;
          continue;
        }
        const x = sx(s.x[k]);
        const y = sy(s.y[k]);
        if (started) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
        started = true;
      }
      ctx.stroke();
      if (s.dots) {
        for (let k = 0; k < s.x.length; k++) {
          if (!Number.isFinite(s.y[k])) continue;
          ctx.beginPath();
          ctx.arc(sx(s.x[k]), sy(s.y[k]), 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();

    if (spec.marker !== undefined && spec.marker >= xr[0] && spec.marker <= xr[1]) {
      const x = Math.round(sx(spec.marker)) + 0.5;
      ctx.strokeStyle = color('--text');
      ctx.globalAlpha = 0.5;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + ph);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // Hover: crosshair at the nearest sample and a readout of every series.
    if (this.hoverPx !== null && this.hoverPx >= left && this.hoverPx <= left + pw && spec.series.length && spec.series[0].x.length) {
      const xv = xr[0] + ((this.hoverPx - left) / pw) * (xr[1] - xr[0]);
      const xs0 = spec.series[0].x;
      let lo = 0;
      let hi = xs0.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (xs0[mid] < xv) lo = mid;
        else hi = mid;
      }
      const k = Math.abs(xs0[lo] - xv) < Math.abs(xs0[hi] - xv) ? lo : hi;
      const x = Math.round(sx(xs0[k])) + 0.5;
      ctx.strokeStyle = color('--chart-axis');
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + ph);
      ctx.stroke();
      const lines = [spec.xFormat ? spec.xFormat(xs0[k]) : format(xs0[k], xs)];
      for (const s of spec.series) {
        const y = s.y[k];
        if (!Number.isFinite(y)) continue;
        ctx.fillStyle = color('--surface');
        ctx.strokeStyle = color(s.color);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, sy(y), 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        lines.push(`${s.label}: ${y.toFixed(2)}${spec.yUnit ?? ''}`);
      }
      ctx.lineWidth = 1;
      const tw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 12;
      const th = lines.length * 13 + 8;
      const bx = x + 8 + tw > left + pw ? x - 8 - tw : x + 8;
      ctx.fillStyle = color('--surface');
      ctx.strokeStyle = color('--line-strong');
      ctx.fillRect(bx, top + 4, tw, th);
      ctx.strokeRect(bx + 0.5, top + 4.5, tw, th);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      lines.forEach((l, i) => {
        ctx.fillStyle = color(i === 0 ? '--muted' : '--text');
        ctx.fillText(l, bx + 6, top + 9 + i * 13);
      });
    }

    // Legend
    ctx.setLineDash([]);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    let lx = left;
    for (const s of spec.series) {
      ctx.strokeStyle = color(s.color);
      ctx.setLineDash(s.dashed ? [4, 3] : []);
      ctx.beginPath();
      ctx.moveTo(lx, 7);
      ctx.lineTo(lx + 12, 7);
      ctx.stroke();
      ctx.fillStyle = color('--chart-text');
      ctx.fillText(s.label, lx + 16, 7);
      lx += 24 + ctx.measureText(s.label).width;
    }
    ctx.setLineDash([]);
  }
}
