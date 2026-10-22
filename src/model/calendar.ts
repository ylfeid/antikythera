// Dates. Years are astronomical (year 0 = 1 BC, −204 = 205 BC) on the proleptic
// Julian calendar, which is what the historical literature uses for this era.
// JavaScript's Date is proleptic Gregorian, so it is never used for dates here.

export const J2000 = 2451545.0;

export interface JulianDate {
  year: number; // astronomical
  month: number; // 1–12
  day: number; // may carry a fraction
}

// Meeus, Astronomical Algorithms ch. 7, Julian calendar (B = 0).
export const julianToJD = ({ year, month, day }: JulianDate) => {
  let y = year;
  let m = month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day - 1524.5;
};

export const jdToJulian = (jd: number): JulianDate => {
  const z = Math.floor(jd + 0.5);
  const f = jd + 0.5 - z;
  const b = z + 1524;
  const c = Math.floor((b - 122.1) / 365.25);
  const d = Math.floor(365.25 * c);
  const e = Math.floor((b - d) / 30.6001);
  const day = b - d - Math.floor(30.6001 * e) + f;
  const month = e < 14 ? e - 1 : e - 13;
  const year = month > 2 ? c - 4716 : c - 4715;
  return { year, month, day };
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const formatYear = (year: number) => (year <= 0 ? `${1 - year} BC` : `AD ${year}`);

export const formatJD = (jd: number, withTime = false) => {
  const { year, month, day } = jdToJulian(jd);
  const d = Math.floor(day);
  let s = `${d} ${MONTHS[month - 1]} ${formatYear(year)}`;
  if (withTime) {
    const h = (day - d) * 24;
    const hh = Math.floor(h);
    const mm = Math.floor((h - hh) * 60);
    s += ` ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  return s;
};

// Astronomical year to fractional-year axis value for plots: −204.5 is mid 205 BC.
export const jdToYear = (jd: number) => {
  const { year } = jdToJulian(jd);
  const start = julianToJD({ year, month: 1, day: 1 });
  const end = julianToJD({ year: year + 1, month: 1, day: 1 });
  return year + (jd - start) / (end - start);
};

// ── Egyptian civil calendar ───────────────────────────────────────────────
// 12 months of 30 days and 5 epagomenal days, no leap years. Era of Nabonassar:
// Thoth 1 of year 1 = 26 Feb 747 BC (Julian) = JD 1448637.5 at midnight.
export const NABONASSAR_EPOCH = 1448637.5;

export const EGYPTIAN_MONTHS = [
  'Thoth', 'Phaophi', 'Athyr', 'Choiak', 'Tybi', 'Mecheir',
  'Phamenoth', 'Pharmouthi', 'Pachon', 'Payni', 'Epeiph', 'Mesore', 'Epagomenai',
];
// Greek spellings as they appear on the front dial ring.
export const EGYPTIAN_MONTHS_GREEK = [
  'ΘΩΘ', 'ΦΑΩΦΙ', 'ΑΘΥΡ', 'ΧΟΙΑΚ', 'ΤΥΒΙ', 'ΜΕΧΕΙΡ',
  'ΦΑΜΕΝΩΘ', 'ΦΑΡΜΟΥΘΙ', 'ΠΑΧΩΝ', 'ΠΑΥΝΙ', 'ΕΠΙΦΙ', 'ΜΕΣΟΡΗ', 'ΕΠΑΓ',
];

export const egyptianDate = (jd: number) => {
  const n = jd - NABONASSAR_EPOCH;
  const days = Math.floor(n);
  const year = Math.floor(days / 365) + 1;
  const dayOfYear = days - (year - 1) * 365; // 0–364
  const month = Math.min(12, Math.floor(dayOfYear / 30));
  const day = dayOfYear - month * 30 + 1;
  return { year, dayOfYear, month, day, fraction: n - days };
};

export const formatEgyptian = (jd: number) => {
  const e = egyptianDate(jd);
  return `${e.day} ${EGYPTIAN_MONTHS[e.month]}, year ${e.year} of Nabonassar`;
};

// ── Zodiac ────────────────────────────────────────────────────────────────
export const ZODIAC = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpius', 'Sagittarius', 'Capricornus', 'Aquarius', 'Pisces'];
// Names as on the Mechanism's zodiac ring (Libra is ΧΗΛΑΙ, the Claws).
export const ZODIAC_GREEK = ['ΚΡΙΟΣ', 'ΤΑΥΡΟΣ', 'ΔΙΔΥΜΟΙ', 'ΚΑΡΚΙΝΟΣ', 'ΛΕΩΝ', 'ΠΑΡΘΕΝΟΣ', 'ΧΗΛΑΙ', 'ΣΚΟΡΠΙΟΣ', 'ΤΟΞΟΤΗΣ', 'ΑΙΓΟΚΕΡΩΣ', 'ΥΔΡΟΧΟΟΣ', 'ΙΧΘΥΕΣ'];

export const formatLongitude = (deg: number) => {
  const l = ((deg % 360) + 360) % 360;
  const sign = Math.floor(l / 30);
  const within = l - sign * 30;
  const d = Math.floor(within);
  const m = Math.floor((within - d) * 60);
  return `${ZODIAC[sign]} ${d}°${String(m).padStart(2, '0')}′`;
};

// ── Olympiads ─────────────────────────────────────────────────────────────
// Olympiad 1 began with the games of summer 776 BC (astronomical −775).
export const olympiadOf = (year: number) => {
  const k = year + 775;
  return { olympiad: Math.floor(k / 4) + 1, year: (((k % 4) + 4) % 4) + 1 };
};
