// Runs the full quantitative comparison and writes:
//   src/data/calibration.json   pointer settings used by the app
//   public/accuracy.json        downsampled series and scores for the app's charts
//   docs/*.svg                  README figures
//   docs/results.md             the README tables
// Usage: npm run accuracy

import { mkdirSync, writeFileSync } from 'node:fs';
import { BODIES, BODY_NAME, type Body } from '../src/model/ephemeris.ts';
import { Mechanism, EPOCH_JD } from '../src/model/mechanism.ts';
import { julianToJD, jdToYear, formatYear } from '../src/model/calendar.ts';
import { calibrate, prepareSamples, sampleJDs, CALIBRATION_WINDOW } from '../src/analysis/calibrate.ts';
import { errorSeries, stats, driftPerCentury } from '../src/analysis/compare.ts';
import { checkEclipses, score, sarosCycle } from '../src/analysis/eclipseCheck.ts';
import { simulate, summarize, EDMUNDS_CASES, EDMUNDS_RESULTS, OUTPUTS, CLEARANCE_FRACTION } from '../src/analysis/montecarlo.ts';
import { smallMultiples, groupedBars, PALETTE } from '../src/analysis/svgplot.ts';

const t0 = Date.now();
const log = (s: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`);
const root = new URL('..', import.meta.url).pathname;
mkdirSync(`${root}docs`, { recursive: true });
mkdirSync(`${root}public`, { recursive: true });
mkdirSync(`${root}src/data`, { recursive: true });

const FROM = julianToJD({ year: -250, month: 1, day: 1 });
const TO = julianToJD({ year: -50, month: 1, day: 1 });

// ── Calibration ───────────────────────────────────────────────────────────
const mech = new Mechanism();
mech.calibration = calibrate(mech, prepareSamples(mech, sampleJDs(CALIBRATION_WINDOW[0], CALIBRATION_WINDOW[1], 3)));
writeFileSync(`${root}src/data/calibration.json`, JSON.stringify(mech.calibration, null, 2) + '\n');
log(`calibrated; mean Sun at epoch ${mech.calibration.mount.sun.toFixed(3)}°`);

// ── Longitude errors ──────────────────────────────────────────────────────
const jds = sampleJDs(FROM, TO, 4);
const series = errorSeries(mech, jds);
log(`error series: ${jds.length} samples`);

// Plot axis in years BC (astronomical year y is 1 − y BC), so ticks fall on round BC years.
const years = jds.map((jd) => jdToYear(jd) - 1);
const rows: string[] = [];
const summary: Record<string, unknown> = {};
for (const b of BODIES) {
  const tot = stats(series.total[b]);
  const th = stats(series.theory[b]);
  const per = stats(series.periods[b]);
  const drift = driftPerCentury(jds, series.periods[b]);
  summary[b] = { total: tot, theory: th, periods: per, driftPerCentury: drift };
  rows.push(
    `| ${BODY_NAME[b]} | ${tot.rms.toFixed(2)}° | ${tot.maxAbs.toFixed(1)}° | ${th.rms.toFixed(2)}° | ${th.maxAbs.toFixed(1)}° | ${drift >= 0 ? '+' : '−'}${Math.abs(drift).toFixed(2)}°/century |`,
  );
}

const yearFmt = (y: number) => String(Math.round(-y));
const panelsFor = (bodies: Body[]) =>
  bodies.map((b) => ({
    title: BODY_NAME[b],
    yLabel: 'degrees',
    lines: [
      { label: 'Mechanism − ephemeris', x: years, y: series.total[b], color: PALETTE.series[0], width: 1 },
      { label: 'Same theories, exact modern periods', x: years, y: series.theory[b], color: PALETTE.series[1], width: 0.8 },
      { label: 'Period-relation drift (difference)', x: years, y: series.periods[b], color: PALETTE.text, dashed: true, width: 1.5 },
    ],
  }));

writeFileSync(
  `${root}docs/errors-sun-moon.svg`,
  smallMultiples(panelsFor(['sun', 'moon', 'nodes']), {
    columns: 3, width: 960, panelHeight: 200, xLabel: 'year BC', xFormat: yearFmt,
    title: 'Sun, Moon and Dragon Hand: pointer error against Astronomy Engine, 250–50 BC',
  }),
);
writeFileSync(
  `${root}docs/errors-planets.svg`,
  smallMultiples(panelsFor(['mercury', 'venus', 'mars', 'jupiter', 'saturn']), {
    columns: 3, width: 960, panelHeight: 200, xLabel: 'year BC', xFormat: yearFmt,
    title: 'Planets (Freeth et al. 2021 model): pointer error against Astronomy Engine, 250–50 BC',
  }),
);
log('error figures written');

// ── Eclipses ──────────────────────────────────────────────────────────────
const syz = checkEclipses(mech, FROM, TO);
const cycles = [...new Set(syz.map(sarosCycle))].sort((a, b) => a - b);
const eclRows: string[] = [];
const eclCycles: unknown[] = [];
for (const c of cycles) {
  const inCycle = (x: (typeof syz)[number]) => sarosCycle(x) === c;
  const L = score(syz, 'full', inCycle);
  const S = score(syz, 'new', inCycle);
  const start = syz.find(inCycle)!.jd;
  const end = [...syz].reverse().find(inCycle)!.jd;
  const partial = end - start < 6000;
  eclCycles.push({ cycle: c, start, end, lunar: L, solar: S });
  eclRows.push(
    `| ${c >= 0 ? '+' : '−'}${Math.abs(c)}${partial ? ' (part)' : ''} | ${formatYear(Math.round(jdToYear(start)))} | ${L.hits}/${L.predicted} | ${L.penumbralOnly} | ${L.falseAlarms} | ${L.misses} | ${S.hits}/${S.predicted} | ${S.falseAlarms} | ${S.misses} |`,
  );
}
const Lall = score(syz, 'full');
const Sall = score(syz, 'new');
const visSolar = syz.filter((x) => x.type === 'new' && x.visibleRhodes);
const visLunar = syz.filter((x) => x.type === 'full' && x.visibleRhodes);
const eclSummary = {
  lunar: Lall,
  solar: Sall,
  solarVisibleRhodes: { actual: visSolar.length, predicted: visSolar.filter((x) => x.predicted).length },
  lunarVisibleRhodes: { actual: visLunar.length, predicted: visLunar.filter((x) => x.predicted).length },
  solarNotVisible: (() => {
    const xs = syz.filter((x) => x.type === 'new' && x.actual && !x.visibleRhodes);
    return { actual: xs.length, predicted: xs.filter((x) => x.predicted).length };
  })(),
};
log('eclipses checked');

// ── Monte Carlo ───────────────────────────────────────────────────────────
const TRIALS = 200;
const mc: Record<string, Record<string, unknown>> = {};
const mcRows: string[] = [];
for (const c of EDMUNDS_CASES) {
  const res = simulate(mech, c, TRIALS, { samples: 800, seed: 7 });
  mc[c.id] = {};
  for (const o of OUTPUTS) {
    mc[c.id][o.id] = {
      sigma: summarize(res, 'sigma', o.id),
      maxDev: summarize(res, 'maxDev', o.id),
      deadBand: summarize(res, 'deadBand', o.id),
    };
  }
  const s = (id: string) => summarize(res, 'sigma', id).median;
  const d = (id: string) => summarize(res, 'maxDev', id).median;
  const e = EDMUNDS_RESULTS[c.id];
  const days = (id: string, v: number) => {
    const o = OUTPUTS.find((x) => x.id === id)!;
    return o.daysPerDegree ? ` (${(v * o.daysPerDegree).toFixed(1)} d)` : '';
  };
  mcRows.push(
    `| ${c.id} | ${c.sigma} | ${c.systematic}° | ${s('moon').toFixed(1)}° / ${d('moon').toFixed(0)}° | ${e.moon[0]}° / ${e.moon[1]}° | ${s('metonic').toFixed(2)}°${days('metonic', s('metonic'))} | ${e.metonic[0]}° | ${s('saros').toFixed(2)}°${days('saros', s('saros'))} | ${e.saros[0]}° | ${s('venus').toFixed(2)}° | ${s('mars').toFixed(2)}° |`,
  );
  log(`Monte Carlo case ${c.id}`);
}
// Dead band does not depend on the tooth-error case; report it at two clearances.
const db = (clearance: number) => {
  const res = simulate(mech, EDMUNDS_CASES[0], 100, { samples: 50, seed: 11, clearance });
  return Object.fromEntries(OUTPUTS.map((o) => [o.id, summarize(res, 'deadBand', o.id).median]));
};
const deadBand = { [CLEARANCE_FRACTION]: db(CLEARANCE_FRACTION), 0.15: db(0.15) };
log('dead band');

writeFileSync(
  `${root}docs/montecarlo.svg`,
  groupedBars(
    ['moon', 'metonic', 'saros'].flatMap((id) =>
      EDMUNDS_CASES.map((c) => ({
        label: `${OUTPUTS.find((o) => o.id === id)!.name}, case ${c.id}`,
        values: [
          { name: 'This simulation (median σ)', value: (mc[c.id][id] as { sigma: { median: number } }).sigma.median, color: PALETTE.series[0] },
          { name: 'Edmunds 2011 (σ)', value: EDMUNDS_RESULTS[c.id][id as 'moon'][0], color: PALETTE.series[1] },
        ],
      })),
    ),
    {
      width: 760,
      unit: '°',
      title: 'Pointer scatter from tooth-placement errors: this simulation vs Edmunds 2011',
      legend: [
        { name: 'This simulation (median σ of 200 instances)', color: PALETTE.series[0] },
        { name: 'Edmunds 2011', color: PALETTE.series[1] },
      ],
    },
  ),
);

// ── App data ──────────────────────────────────────────────────────────────
const stride = 8; // every 32 days
const down = (a: ArrayLike<number>) => Array.from({ length: Math.ceil(a.length / stride) }, (_, i) => +a[i * stride].toFixed(3));
writeFileSync(
  `${root}public/accuracy.json`,
  JSON.stringify({
    generated: new Date().toISOString().slice(0, 10),
    epochJD: EPOCH_JD,
    calibrationWindow: CALIBRATION_WINDOW,
    jd: down(jds.map((j) => +j.toFixed(2))),
    total: Object.fromEntries(BODIES.map((b) => [b, down(series.total[b])])),
    theory: Object.fromEntries(BODIES.map((b) => [b, down(series.theory[b])])),
    summary,
    eclipses: { summary: eclSummary, cycles: eclCycles },
    montecarlo: { cases: EDMUNDS_CASES, edmunds: EDMUNDS_RESULTS, results: mc, deadBand },
  }),
);

// ── README tables ─────────────────────────────────────────────────────────
const md = [
  '### Longitude errors, 250–50 BC',
  '',
  '| Body | Mechanism rms | Mechanism max | Theory only rms | Theory only max | Period drift |',
  '| --- | --- | --- | --- | --- | --- |',
  ...rows,
  '',
  '### Saros dial against real eclipses',
  '',
  '| Saros cycle | From | Σ hits / glyphs | Σ penumbral only | Σ no eclipse | Umbral missed | Η hits / glyphs | Η no eclipse | Solar missed |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ...eclRows,
  '',
  `Totals: lunar ${Lall.hits}/${Lall.predicted} glyphs followed by an umbral eclipse, ${Lall.penumbralOnly} by a penumbral one only, ${Lall.falseAlarms} by none; ${Lall.misses} of ${Lall.actual} umbral eclipses missed. Solar ${Sall.hits}/${Sall.predicted} glyphs followed by an eclipse somewhere on Earth; ${Sall.misses} of ${Sall.actual} solar eclipses unpredicted.`,
  `Seen from Rhodes: ${eclSummary.solarVisibleRhodes.predicted} of ${eclSummary.solarVisibleRhodes.actual} visible solar eclipses predicted (against ${eclSummary.solarNotVisible.predicted} of ${eclSummary.solarNotVisible.actual} invisible ones); ${eclSummary.lunarVisibleRhodes.predicted} of ${eclSummary.lunarVisibleRhodes.actual} visible umbral lunar eclipses predicted.`,
  '',
  '### Monte Carlo',
  '',
  '| Case | Tooth σ | Systematic | Moon σ / max (sim) | Moon (Edmunds) | Metonic σ (sim) | Metonic (Edmunds) | Saros σ (sim) | Saros (Edmunds) | Venus σ | Mars σ |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ...mcRows,
  '',
  `Dead band on reversing the crank (median): ${Object.entries(deadBand)
    .map(([g, v]) => `clearance ${Math.round(+g * 100)}% of tooth height: ${OUTPUTS.map((o) => `${o.name} ${(v as Record<string, number>)[o.id].toFixed(1)}°`).join(', ')}`)
    .join('; ')}.`,
  '',
];
writeFileSync(`${root}docs/results.md`, md.join('\n'));
console.log(md.join('\n'));
log('done');
