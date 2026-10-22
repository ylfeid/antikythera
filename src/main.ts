// Antikythera: app wiring. The model lives in src/model, the analysis in
// src/analysis, the renderer in src/gpu; this file connects them to the page.

import { Renderer } from './gpu/renderer.ts';
import { OrbitCamera, PRESETS } from './gpu/camera.ts';
import { transformPoint } from './gpu/math.ts';
import { Scene, type ViewSettings, type Visibility } from './scene.ts';
import { Mechanism, EPOCH_JD, type Calibration, type Readout } from './model/mechanism.ts';
import { RATES, turnsOf } from './model/kinematics.ts';
import { GEAR, type Gear } from './model/gears.ts';
import { PLACEMENT, AXES, CASE } from './model/layout.ts';
import { TRAINS } from './model/trains.ts';
import { SOURCES } from './model/sources.ts';
import { Q, formatFactors } from './model/rational.ts';
import { julianToJD, jdToJulian, formatJD, formatEgyptian, formatLongitude, olympiadOf, jdToYear, formatYear } from './model/calendar.ts';
import { BODIES, BODY_NAME, longitude, type Body } from './model/ephemeris.ts';
import { Chart } from './ui/charts.ts';
import calibration from './data/calibration.json';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const DAYS_PER_CRANK = (365.25 * 48) / 223; // a1 has 48 teeth, b1 has 223
const GAMES = ['Isthmia, Olympia', 'Nemea, Naa', 'Isthmia, Pythia', 'Nemea, Halieia'];
const wrap180 = (x: number) => x - 360 * Math.round(x / 360);

const fail = (reason?: string) => {
  $('unsupported').hidden = false;
  if (reason) $('unsupported-reason').textContent = reason;
};

const download = (name: string, blob: Blob) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

interface AccuracyData {
  jd: number[];
  total: Record<Body, number[]>;
  theory: Record<Body, number[]>;
  summary: Record<Body, { total: { rms: number; maxAbs: number }; theory: { rms: number; maxAbs: number }; driftPerCentury: number }>;
  calibrationWindow: [number, number];
  eclipses: {
    summary: {
      lunar: Score;
      solar: Score;
      solarVisibleRhodes: { actual: number; predicted: number };
      lunarVisibleRhodes: { actual: number; predicted: number };
    };
    cycles: { cycle: number; start: number; end: number; lunar: Score; solar: Score }[];
  };
  montecarlo: {
    cases: { id: string; sigma: number; systematic: number }[];
    edmunds: Record<string, { moon: [number, number]; metonic: [number, number]; saros: [number, number] }>;
    results: Record<string, Record<string, { sigma: { median: number; p05: number; p95: number }; maxDev: { median: number } }>>;
    deadBand: Record<string, Record<string, number>>;
  };
}
interface Score {
  predicted: number;
  hits: number;
  penumbralOnly: number;
  falseAlarms: number;
  misses: number;
  actual: number;
}

const init = async () => {
  if (!navigator.gpu) return fail();
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) return fail('No suitable GPU adapter was found.');
  const device = await adapter.requestDevice();
  device.lost.then((info) => {
    if (info.reason !== 'destroyed') fail(`The GPU device was lost: ${info.message}`);
  });
  const renderer = new Renderer(device, $<HTMLCanvasElement>('scene'));
  const app = new App(renderer);
  app.start();
  if (import.meta.env.DEV) Object.assign(window, { antikythera: app });
};

class App {
  private readonly renderer: Renderer;
  private readonly mech = new Mechanism(RATES, Q.of(1461, 4), calibration as Calibration);
  private readonly camera = new OrbitCamera();
  private readonly scene: Scene;
  private readonly canvas = $<HTMLCanvasElement>('scene');
  private readonly accChart = new Chart($<HTMLCanvasElement>('chart-acc'));
  private readonly view: ViewSettings = {
    explode: 0,
    xray: false,
    slice: { enabled: false, axis: 'x', offset: 0 },
    reconstructed: 'show',
    plates: true,
    selected: null,
    train: null,
  };

  private jd = EPOCH_JD;
  private readout: Readout;
  private playing = 0; // −1, 0, +1
  private speed = 29.53;
  private anim: { from: number; to: number; t0: number; dur: number } | null = null;
  private drag: { mode: 'orbit' | 'pan' | 'crank'; x: number; y: number; moved: boolean } | null = null;
  private lastFrame = performance.now();
  private lastPanel = 0;
  private fps = { t: performance.now(), n: 0, value: 0 };
  private accuracy: AccuracyData | null = null;
  private accBody: Body = 'mars';
  private shot = false;

  constructor(renderer: Renderer) {
    this.renderer = renderer;
    this.readout = this.mech.read(EPOCH_JD);
    this.scene = new Scene(renderer, this.readout);
    this.scene.sunMount = this.mech.calibration.mount.sun;
  }

  start() {
    const params = new URLSearchParams(location.search);
    const d = params.get('date');
    if (d) {
      const m = /^(-?\d+)-(\d+)-(\d+)$/.exec(d);
      if (m) this.jd = julianToJD({ year: +m[1], month: +m[2], day: +m[3] + 0.5 });
    }
    const cam = params.get('view');
    if (cam && PRESETS[cam]) this.camera.pose = { ...PRESETS[cam].pose, target: [...PRESETS[cam].pose.target] };
    this.bindInputs();
    this.buildCameraButtons();
    this.buildJumps();
    this.buildTrains();
    this.syncDateInputs();
    this.drawCrankWidget();
    fetch('./accuracy.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((a: AccuracyData | null) => {
        if (!a) return;
        this.accuracy = a;
        this.buildAccuracy();
      })
      .catch(() => {});
    requestAnimationFrame((t) => this.frame(t));
  }

  // ── Time and crank ──────────────────────────────────────────────────────
  private setJD(jd: number) {
    this.jd = jd;
  }

  private turnTo(target: number) {
    const span = Math.abs(target - this.jd);
    if (span < 0.01) return;
    this.playing = 0;
    // Quick for short hops, never more than three seconds.
    const dur = Math.min(3000, 500 + Math.log10(1 + span) * 700);
    this.anim = { from: this.jd, to: target, t0: performance.now(), dur };
  }

  private crankTurns() {
    return (this.jd - EPOCH_JD) / DAYS_PER_CRANK;
  }

  // ── Frame ───────────────────────────────────────────────────────────────
  private frame(now: number) {
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (this.anim) {
      const t = Math.min(1, (now - this.anim.t0) / this.anim.dur);
      const k = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      this.setJD(this.anim.from + (this.anim.to - this.anim.from) * k);
      if (t >= 1) this.anim = null;
    } else if (this.playing) {
      this.setJD(this.jd + this.playing * this.speed * dt);
    }
    this.camera.aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
    this.camera.update(now);
    this.readout = this.mech.read(this.jd);
    this.scene.crankAngle = this.crankTurns() * Math.PI * 2;
    this.scene.update(this.readout, this.view);
    const { viewProj } = this.camera.matrices();
    const eye = this.camera.eye();
    const sliceNormal: [number, number, number] = this.view.slice.axis === 'x' ? [1, 0, 0] : this.view.slice.axis === 'y' ? [0, 1, 0] : [0, 0, 1];
    this.renderer.render(this.scene.objects, {
      viewProj,
      eye,
      // Key light over the viewer's shoulder, so front and back read equally.
      lightDir: this.lightFrom(eye),
      clip: { enabled: this.view.slice.enabled, normal: sliceNormal, offset: this.view.slice.offset },
      xray: this.view.xray,
    });
    if (this.shot) {
      this.shot = false;
      this.canvas.toBlob((b) => b && download(`antikythera-${formatJD(this.jd).replace(/ /g, '-')}.png`, b));
    }
    this.fps.n++;
    if (now - this.fps.t > 500) {
      this.fps.value = (this.fps.n * 1000) / (now - this.fps.t);
      this.fps = { t: now, n: 0, value: this.fps.value };
    }
    if (now - this.lastPanel > 120) {
      this.lastPanel = now;
      this.updatePanels();
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  private lightFrom(eye: [number, number, number]): [number, number, number] {
    const t = this.camera.pose.target;
    const d = [eye[0] - t[0], eye[1] - t[1], eye[2] - t[2]];
    const l = Math.hypot(d[0], d[1], d[2]) || 1;
    // Up and to the left of the view direction.
    return [d[0] / l - 0.35 * (d[2] / l), d[1] / l + 0.7, d[2] / l + 0.35 * (d[0] / l)];
  }

  // ── Panels ──────────────────────────────────────────────────────────────
  private updatePanels() {
    const r = this.readout;
    $('hud-date').textContent = formatJD(this.jd);
    $('hud-egypt').textContent = formatEgyptian(this.jd);
    const g = r.dials.glyph;
    $('hud-glyph').textContent = `Saros month ${Math.floor(r.dials.sarosMonth) + 1}${g ? ` · glyph ${g.lunar ? 'Σ' : ''}${g.solar ? 'Η' : ''}` : ''}`;
    $('hud-selected').textContent = this.view.selected ? `selected: ${this.view.selected}` : '';
    const turns = this.crankTurns();
    $('s-crank').textContent = turns.toFixed(2);
    $('s-b1').textContent = `${(((turns * 48) / 223) % 1 + 1) % 1 * 360 | 0}°`;
    $('s-days').textContent = (this.jd - EPOCH_JD).toFixed(1);
    $('s-phase').textContent = `${r.phase.toFixed(1)}°`;
    $('s-fps').textContent = this.fps.value.toFixed(0);
    $('s-state').textContent = this.anim ? 'turning…' : this.playing ? (this.playing > 0 ? 'running' : 'running backwards') : '';
    this.drawCrankWidget();

    // Pointers against the sky
    const rows = BODIES.map((b) => {
      const sky = longitude(b, this.jd);
      const mech = r.longitude[b];
      const err = wrap180(mech - sky);
      return `<li><span class="k">${BODY_NAME[b]}</span><span class="v">${formatLongitude(mech)}</span><span class="x">sky ${formatLongitude(sky)}</span><span class="r${Math.abs(err) > 5 ? ' err-big' : ''}">${err >= 0 ? '+' : '−'}${Math.abs(err).toFixed(2)}°</span></li>`;
    });
    $('readout').innerHTML = rows.join('');
    const d = r.dials;
    const met = Math.floor(d.metonicMonth);
    // Olympiad years ran from the midsummer games.
    const jul = jdToJulian(this.jd);
    const ol = olympiadOf(jul.year - (jul.month < 7 ? 1 : 0));
    const age = (r.phase / 360) * 29.530589;
    const items: [string, string, string][] = [
      ['Metonic', `month ${met + 1} of 235`, `year ${Math.floor(met / (235 / 19)) + 1} of 19`],
      ['Saros', `month ${Math.floor(d.sarosMonth) + 1} of 223`, g ? `glyph ${g.lunar ? 'Σ' : ''}${g.solar ? 'Η' : ''}` : 'no glyph'],
      ['Exeligmos', `+${d.exeligmosSector * 8} h`, 'on glyph times'],
      ['Games dial', `year ${Math.floor(d.olympiadYear) + 1}`, GAMES[Math.floor(d.olympiadYear)]],
      ['Callippic', `year ${Math.floor(d.callippicYear) + 1} of 76`, `sector ${Math.floor(d.callippicYear / 19) + 1}`],
      ['Olympiad', `${ol.olympiad}, year ${ol.year}`, 'actual'],
      ['Phase ball', `${r.phase.toFixed(0)}°`, `age ${age.toFixed(1)} days`],
      ['Dragon Hand', formatLongitude(r.longitude.nodes), 'ascending node'],
    ];
    $('dials').innerHTML = items.map(([k, v, x]) => `<li><span class="k">${k}</span><span class="v">${v}</span><span class="r x">${x}</span></li>`).join('');
    if (this.accuracy) this.drawAccuracy();
    if (this.view.selected) this.showGear(GEAR.get(this.view.selected)!, false);
  }

  private showGear(g: Gear, scroll = true) {
    const p = PLACEMENT.get(g.id)!;
    const rate = RATES.get(g.id)!;
    const abs = rate.n < 0n ? rate.neg() : rate;
    const period = abs.isZero() ? null : Q.of(1461, 4).div(abs);
    const tag = g.status === 'surviving' ? 'surviving' : g.confidence === 'speculative' ? 'speculative' : 'reconstructed';
    const conf = g.status === 'surviving' ? `surviving, Fragment ${g.fragment}` : `reconstructed: ${g.confidence === 'required' ? 'required by a surviving dial' : g.confidence === 'speculative' ? 'speculative' : 'Cosmos model (Freeth et al. 2021)'}`;
    const turns = turnsOf(this.readout.gears, g.id);
    $('gear-title').textContent = 'Selected gear';
    $('gear-body').innerHTML = `
      <div class="gear-head"><h3>${g.id}</h3><span class="tag ${tag}">${conf}</span></div>
      <p class="gear-role">${g.role}</p>
      <ul class="rows">
        <li><span class="k">Teeth</span><span class="v">${g.teeth}</span><span class="r x">${formatFactors(BigInt(g.teeth))}${g.contrate ? ', contrate' : ''}</span></li>
        <li><span class="k">Rate</span><span class="v">${rate.toString()}</span><span class="r x">${period ? `turns/yr, one turn in ${period.toNumber().toFixed(3)} d` : 'fixed'}</span></li>
        <li><span class="k">Frame</span><span class="v">${g.frame === 'main' ? 'fixed axis' : `carried by ${g.frame}`}</span></li>
        <li><span class="k">Pitch radius</span><span class="v">${p.pitchR.toFixed(2)} mm</span><span class="r x">${g.measured ? `measured: outer ${g.measured.outerR}, inner ${g.measured.innerR}, ${g.measured.thickness} thick` : 'from module'}</span></li>
        <li><span class="k">Angle now</span><span class="v">${((((turns % 1) + 1) % 1) * 360).toFixed(1)}°</span><span class="r x">from its epoch setting</span></li>
        ${g.aliases ? `<li><span class="k">Also called</span><span class="v">${g.aliases.join(', ')}</span></li>` : ''}
      </ul>
      <p class="note">${g.evidence}</p>
      ${g.countNote ? `<p class="note">${g.countNote}</p>` : ''}
      <p class="note">Sources: ${g.source.map((s) => SOURCES[s].short).join('; ')}</p>`;
    if (scroll) $('gear-body').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  private buildTrains() {
    const rows = TRAINS.map((t, i) => {
      const rel = t.relation();
      const y = rel.years;
      const c = rel.cycles;
      const days = Q.of(1461, 4).mul(y).div(c);
      return `<tr class="click" data-i="${i}" title="${t.meaning}"><td>${t.name}</td><td>${c} / ${y}</td><td class="dim">${formatFactors(c.n)} / ${formatFactors(y.n)}</td><td>${days.toNumber().toFixed(4)} d</td><td class="path">${t.path}</td></tr>`;
    });
    $('trains').innerHTML = `<tr><th>Output</th><th>Cycles / years</th><th>Factors</th><th>Period</th><th style="text-align:left">Gear train</th></tr>${rows.join('')}`;
    $('trains').querySelectorAll('tr.click').forEach((tr) =>
      tr.addEventListener('click', () => {
        const t = TRAINS[+(tr as HTMLElement).dataset.i!];
        const same = this.view.train === t.id && $('trains').querySelector('tr.active') === tr;
        $('trains').querySelectorAll('tr').forEach((x) => x.classList.remove('active'));
        this.view.train = same ? null : t.id;
        if (!same) {
          tr.classList.add('active');
          const g = GEAR.get(t.output);
          if (g && g.id !== 'ma1') {
            this.view.selected = g.id;
            this.showGear(g);
          }
        }
      }),
    );
  }

  private buildAccuracy() {
    const a = this.accuracy!;
    $('acc-bodies').innerHTML = BODIES.map((b) => `<button data-b="${b}" class="${b === this.accBody ? 'active' : ''}">${BODY_NAME[b]}</button>`).join('');
    $('acc-bodies').querySelectorAll('button').forEach((btn) =>
      btn.addEventListener('click', () => {
        this.accBody = (btn as HTMLElement).dataset.b as Body;
        $('acc-bodies').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === btn));
        this.drawAccuracy();
      }),
    );
    const e = a.eclipses;
    const cyc = e.cycles.map(
      (c) =>
        `<tr><td>${c.cycle >= 0 ? '+' : '−'}${Math.abs(c.cycle)} <span class="dim">${formatYear(Math.round(jdToYear(c.start)))}</span></td><td>${c.lunar.hits}/${c.lunar.predicted}</td><td>${c.lunar.penumbralOnly}</td><td>${c.lunar.misses}</td><td>${c.solar.hits}/${c.solar.predicted}</td><td>${c.solar.misses}</td></tr>`,
    );
    $('eclipses').innerHTML = `<tr><th>Saros cycle</th><th>Σ hits</th><th>Σ penumbral</th><th>Umbral missed</th><th>Η hits</th><th>Solar unpredicted</th></tr>${cyc.join('')}`;
    const s = e.summary;
    $('ecl-note').textContent = `Every real Full and New Moon, read against the glyph in the Saros cell under the mechanism's pointer. Lunar: ${s.lunar.hits} of ${s.lunar.predicted} Σ glyphs fell on an umbral eclipse and ${s.lunar.penumbralOnly} on a penumbral one; ${s.lunar.misses} of ${s.lunar.actual} umbral eclipses were missed, all four or more Saros cycles from the epoch. Solar: ${s.solar.hits} of ${s.solar.predicted} Η glyphs fell on a solar eclipse somewhere on Earth, and ${s.solarVisibleRhodes.predicted} of the ${s.solarVisibleRhodes.actual} visible from Rhodes were predicted.`;
    const mc = a.montecarlo;
    const db = mc.deadBand['0.4'] ?? Object.values(mc.deadBand)[0];
    const mrows = mc.cases.map((c) => {
      const r = mc.results[c.id];
      const ed = mc.edmunds[c.id];
      return `<tr><td>Case ${c.id} <span class="dim">σ ${c.sigma}, ${c.systematic}°</span></td><td>${r.moon.sigma.median.toFixed(1)}° <span class="dim">${ed.moon[0]}°</span></td><td>${r.metonic.sigma.median.toFixed(2)}° <span class="dim">${ed.metonic[0]}°</span></td><td>${r.saros.sigma.median.toFixed(2)}° <span class="dim">${ed.saros[0]}°</span></td><td>${r.mars.sigma.median.toFixed(2)}°</td></tr>`;
    });
    $('mc').innerHTML = `<tr><th>Tooth errors</th><th>Moon σ <span class="dim">Edmunds</span></th><th>Metonic σ</th><th>Saros σ</th><th>Mars σ</th></tr>${mrows.join('')}`;
    $('mc-note').textContent = `200 manufactured instances per case of Edmunds' (2011) tooth-placement errors, propagated through the exact kinematics; his own results in grey. Reversing the crank leaves a dead band from backlash: Moon ${db.moon.toFixed(0)}°, Metonic ${db.metonic.toFixed(1)}°, Saros ${db.saros.toFixed(1)}° at a clearance of 40% of the tooth height.`;
    this.drawAccuracy();
  }

  private drawAccuracy() {
    const a = this.accuracy!;
    const years = a.jd.map((j) => jdToYear(j) - 1);
    const b = this.accBody;
    const fmt = (y: number) => `${Math.round(-y)} BC`;
    this.accChart.draw({
      series: [
        // Drawn under the mechanism line, which is the one that matters.
        { label: 'theories with exact periods', color: '--series-2', x: years, y: a.theory[b] },
        { label: 'mechanism − sky', color: '--series-1', x: years, y: a.total[b] },
      ],
      xFormat: fmt,
      yUnit: '°',
      marker: jdToYear(this.jd) - 1,
    });
    const s = a.summary[b];
    $('acc-note').textContent = `${BODY_NAME[b]}: rms ${s.total.rms.toFixed(2)}°, worst ${s.total.maxAbs.toFixed(1)}°. With exact modern periods the same theories give rms ${s.theory.rms.toFixed(2)}°; the period relations add a drift of ${s.driftPerCentury.toFixed(2)}° per century. Pointers set from 19 years around the epoch; the rest is prediction.`;
  }

  // ── Inputs ──────────────────────────────────────────────────────────────
  private buildCameraButtons() {
    const keys = Object.keys(PRESETS);
    $('cams').innerHTML = keys.map((k, i) => `<button data-k="${k}" title="${i + 1}">${PRESETS[k].label}</button>`).join('');
    $('cams').querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => this.goCamera((b as HTMLElement).dataset.k!)),
    );
  }

  private goCamera(k: string) {
    const p = PRESETS[k];
    if (!p) return;
    this.camera.animateTo(p.pose);
    $('cams').querySelectorAll('button').forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.k === k));
    if (k === 'lunar' || k === 'cosmos') {
      // The inner gearing is behind the plates: take them off.
      this.setPlates(false);
      this.setRender(false);
    }
  }

  private buildJumps() {
    const jumps: [string, number][] = [
      ['Epoch, 205 BC', EPOCH_JD],
      ['Lunar eclipse, 208 BC', julianToJD({ year: -207, month: 2, day: 16.8 })],
      ['Solar eclipse, 207 BC', julianToJD({ year: -206, month: 7, day: 17.65 })],
      ['Mars retrograde, 101 BC', julianToJD({ year: -100, month: 4, day: 20 })],
      ['The wreck, c. 60 BC', julianToJD({ year: -59, month: 6, day: 1 })],
    ];
    $('jumps').innerHTML = jumps.map(([label], i) => `<button data-i="${i}">${label}</button>`).join('');
    $('jumps').querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => {
        this.turnTo(jumps[+(b as HTMLElement).dataset.i!][1]);
      }),
    );
  }

  private syncDateInputs() {
    const { year, month, day } = jdToJulian(this.jd);
    $<HTMLInputElement>('in-day').value = String(Math.floor(day));
    $<HTMLSelectElement>('in-month').value = String(month);
    $<HTMLInputElement>('in-year').value = String(year <= 0 ? 1 - year : year);
    $<HTMLSelectElement>('in-era').value = year <= 0 ? 'BC' : 'AD';
  }

  private setRender(xray: boolean) {
    this.view.xray = xray;
    $('render-mode').querySelectorAll('button').forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.value === (xray ? 'xray' : 'solid')));
  }

  private setPlates(on: boolean) {
    this.view.plates = on;
    $('plates-mode').querySelectorAll('button').forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.value === (on ? 'on' : 'off')));
  }

  private setRecon(v: Visibility) {
    this.view.reconstructed = v;
    $('recon-mode').querySelectorAll('button').forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.value === v));
  }

  private bindInputs() {
    const play = (dir: number) => {
      this.anim = null;
      this.playing = this.playing === dir ? 0 : dir;
      $('btn-play').textContent = this.playing > 0 ? 'Pause' : 'Play';
    };
    $('btn-play').addEventListener('click', () => play(1));
    $('btn-back').addEventListener('click', () => play(-1));
    $<HTMLSelectElement>('speed').addEventListener('change', (e) => (this.speed = +(e.target as HTMLSelectElement).value));
    $('btn-shot').addEventListener('click', () => (this.shot = true));
    $('date-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const y = +$<HTMLInputElement>('in-year').value;
      const era = $<HTMLSelectElement>('in-era').value;
      const year = era === 'BC' ? 1 - y : y;
      const target = julianToJD({ year, month: +$<HTMLSelectElement>('in-month').value, day: +$<HTMLInputElement>('in-day').value + 0.5 });
      if (Number.isFinite(target)) this.turnTo(target);
    });

    const explode = $<HTMLInputElement>('in-explode');
    explode.addEventListener('input', () => {
      this.view.explode = +explode.value;
      $('out-explode').textContent = (+explode.value).toFixed(2);
    });
    $('render-mode').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => this.setRender((b as HTMLElement).dataset.value === 'xray')));
    $('recon-mode').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => this.setRecon((b as HTMLElement).dataset.value as Visibility)));
    this.setRender(false);
    this.setRecon('show');
    $('plates-mode').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => this.setPlates((b as HTMLElement).dataset.value === 'on')));
    this.setPlates(true);
    const sliceRange = $<HTMLInputElement>('in-slice');
    const setSlice = (axis: string) => {
      this.view.slice.enabled = axis !== 'off';
      if (axis !== 'off') this.view.slice.axis = axis as 'x' | 'y' | 'z';
      const lim = axis === 'z' ? [-45, 45] : axis === 'y' ? [CASE.bottom, CASE.top] : [CASE.left, CASE.right];
      sliceRange.min = String(lim[0]);
      sliceRange.max = String(lim[1]);
      $('slice-axis').querySelectorAll('button').forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.value === axis));
    };
    $('slice-axis').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => setSlice((b as HTMLElement).dataset.value!)));
    setSlice('off');
    sliceRange.addEventListener('input', () => {
      this.view.slice.offset = +sliceRange.value;
      $('out-slice').textContent = `${sliceRange.value} mm`;
    });

    // Model: orbit, pan, zoom, pick, and the crank handle.
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      const mode = this.nearCrank(e.offsetX, e.offsetY) ? 'crank' : e.button === 2 || e.shiftKey ? 'pan' : 'orbit';
      this.drag = { mode, x: e.clientX, y: e.clientY, moved: false };
      c.classList.add('dragging');
      if (mode === 'crank') {
        this.anim = null;
        this.playing = 0;
      }
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.drag) {
        c.style.cursor = this.nearCrank(e.offsetX, e.offsetY) ? 'ns-resize' : '';
        return;
      }
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) this.drag.moved = true;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      if (this.drag.mode === 'orbit') this.camera.orbit(dx, dy);
      else if (this.drag.mode === 'pan') this.camera.pan(dx, dy);
      // A pixel of drag is a degree of crank (0.22 days).
      else this.setJD(this.jd + ((dy - dx) / 360) * DAYS_PER_CRANK);
    });
    const end = (e: PointerEvent) => {
      if (this.drag && !this.drag.moved && this.drag.mode !== 'crank') this.pickAt(e.offsetX, e.offsetY);
      this.drag = null;
      c.classList.remove('dragging');
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', () => (this.drag = null));
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.camera.zoom(Math.exp(e.deltaY * 0.0012));
      },
      { passive: false },
    );

    // The 2D crank widget: drag round its centre.
    const cw = $<HTMLCanvasElement>('crank');
    let last: number | null = null;
    const angleAt = (e: PointerEvent) => {
      const r = cw.getBoundingClientRect();
      return Math.atan2(e.clientY - r.top - r.height / 2, e.clientX - r.left - r.width / 2);
    };
    cw.addEventListener('pointerdown', (e) => {
      cw.setPointerCapture(e.pointerId);
      last = angleAt(e);
      this.anim = null;
      this.playing = 0;
    });
    cw.addEventListener('pointermove', (e) => {
      if (last === null) return;
      const a = angleAt(e);
      let d = a - last;
      d -= Math.PI * 2 * Math.round(d / (Math.PI * 2));
      last = a;
      this.setJD(this.jd + (d / (Math.PI * 2)) * DAYS_PER_CRANK);
    });
    cw.addEventListener('pointerup', () => {
      last = null;
      this.syncDateInputs();
    });

    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).closest('input, select, textarea')) return;
      const k = e.key;
      if (k === ' ') {
        e.preventDefault();
        play(1);
      } else if (k === 'ArrowRight' || k === 'ArrowLeft') {
        e.preventDefault();
        this.turnTo((this.anim?.to ?? this.jd) + (k === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 29.530589 : 1));
      } else if (k === ',') play(-1);
      else if (k === 'x' || k === 'X') this.setRender(!this.view.xray);
      else if (k === 'e' || k === 'E') {
        const v = this.view.explode > 0.5 ? 0 : 1;
        this.view.explode = v;
        $<HTMLInputElement>('in-explode').value = String(v);
        $('out-explode').textContent = v.toFixed(2);
      } else if (k === 'h' || k === 'H') {
        const order: Visibility[] = ['show', 'ghost', 'hide'];
        this.setRecon(order[(order.indexOf(this.view.reconstructed) + 1) % 3]);
      } else if (k === 's' || k === 'S') this.shot = true;
      else if (/^[1-9]$/.test(k)) {
        const keys = Object.keys(PRESETS);
        if (keys[+k - 1]) this.goCamera(keys[+k - 1]);
      } else if (k === 'Escape') {
        this.view.selected = null;
        this.view.train = null;
      }
    });
  }

  // Is the pointer over the crank handle (projected to the screen)?
  private nearCrank(x: number, y: number) {
    const { viewProj } = this.camera.matrices();
    const zs = 1 + 2.4 * this.view.explode;
    const zc = (PLACEMENT.get('b1')!.z - 1.5) * zs;
    const a = this.scene.crankAngle;
    const knob: [number, number, number] = [CASE.right + 18, 22 * Math.cos(a), zc + 22 * Math.sin(a)];
    const hub: [number, number, number] = [CASE.right + 12, AXES.a.y, zc];
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    for (const p of [knob, hub]) {
      const s = transformPoint(viewProj, p);
      const sx = ((s[0] + 1) / 2) * w;
      const sy = ((1 - s[1]) / 2) * h;
      if (Math.hypot(sx - x, sy - y) < 22) return true;
    }
    return false;
  }

  private pickAt(x: number, y: number) {
    const { origin, dir } = this.camera.ray(x, y, this.canvas.clientWidth, this.canvas.clientHeight);
    const id = this.scene.pick(origin, dir, this.view, this.readout);
    this.view.selected = id;
    this.view.train = null;
    $('trains').querySelectorAll('tr').forEach((t) => t.classList.remove('active'));
    if (id) this.showGear(GEAR.get(id)!);
    else {
      $('gear-body').innerHTML = '<p class="note">Click a gear on the model, or a train below. Take the plates off or explode it to reach the inner ones.</p>';
    }
  }

  private drawCrankWidget() {
    const cw = $<HTMLCanvasElement>('crank');
    const ctx = cw.getContext('2d')!;
    const css = getComputedStyle(cw);
    const s = cw.width;
    ctx.clearRect(0, 0, s, s);
    const cx = s / 2;
    const r = s * 0.42;
    ctx.strokeStyle = css.getPropertyValue('--line-strong').trim() || '#888';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cx, r, 0, Math.PI * 2);
    ctx.stroke();
    // Ticks every tenth of a turn.
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 0.86, cx + Math.sin(a) * r * 0.86);
      ctx.lineTo(cx + Math.cos(a) * r, cx + Math.sin(a) * r);
      ctx.stroke();
    }
    const a = this.crankTurns() * Math.PI * 2 - Math.PI / 2;
    ctx.strokeStyle = css.getPropertyValue('--text').trim() || '#000';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx, cx);
    ctx.lineTo(cx + Math.cos(a) * r * 0.78, cx + Math.sin(a) * r * 0.78);
    ctx.stroke();
    ctx.fillStyle = css.getPropertyValue('--reconstructed').trim() || '#c90';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r * 0.78, cx + Math.sin(a) * r * 0.78, 11, 0, Math.PI * 2);
    ctx.fill();
  }
}

init();
