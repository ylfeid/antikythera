// Exact rational arithmetic on BigInt. Every gear ratio and mean rotation in the
// model is a Q; floats only appear when an angle is finally handed to geometry.

const babs = (a: bigint) => (a < 0n ? -a : a);
const SCALE = 10n ** 18n;

const gcd = (a: bigint, b: bigint): bigint => {
  a = babs(a);
  b = babs(b);
  while (b) [a, b] = [b, a % b];
  return a;
};

// Floor division for BigInt (BigInt `/` truncates towards zero).
export const floorDiv = (a: bigint, b: bigint) => {
  const q = a / b;
  return (a % b !== 0n && (a < 0n) !== (b < 0n)) ? q - 1n : q;
};

export class Q {
  readonly n: bigint;
  readonly d: bigint;

  constructor(n: bigint | number, d: bigint | number = 1n) {
    let nn = BigInt(n);
    let dd = BigInt(d);
    if (dd === 0n) throw new RangeError('Q: zero denominator');
    if (dd < 0n) {
      nn = -nn;
      dd = -dd;
    }
    const g = gcd(nn, dd) || 1n;
    this.n = nn / g;
    this.d = dd / g;
  }

  static readonly ZERO = new Q(0n);
  static readonly ONE = new Q(1n);

  static of(n: bigint | number, d: bigint | number = 1n) {
    return new Q(n, d);
  }

  // Exact value of a finite double (every double is a dyadic rational).
  static fromNumber(x: number): Q {
    if (!Number.isFinite(x)) throw new RangeError('Q.fromNumber: not finite');
    if (Number.isInteger(x)) return new Q(BigInt(x));
    let d = 1n;
    let v = x;
    while (!Number.isInteger(v)) {
      v *= 2;
      d *= 2n;
    }
    return new Q(BigInt(v), d);
  }

  add(o: Q) {
    return new Q(this.n * o.d + o.n * this.d, this.d * o.d);
  }
  sub(o: Q) {
    return new Q(this.n * o.d - o.n * this.d, this.d * o.d);
  }
  mul(o: Q) {
    return new Q(this.n * o.n, this.d * o.d);
  }
  div(o: Q) {
    if (o.n === 0n) throw new RangeError('Q: division by zero');
    return new Q(this.n * o.d, this.d * o.n);
  }
  neg() {
    return new Q(-this.n, this.d);
  }
  inv() {
    return new Q(this.d, this.n);
  }
  isZero() {
    return this.n === 0n;
  }
  eq(o: Q) {
    return this.n === o.n && this.d === o.d;
  }
  cmp(o: Q) {
    const l = this.n * o.d;
    const r = o.n * this.d;
    return l < r ? -1 : l > r ? 1 : 0;
  }
  floor() {
    return floorDiv(this.n, this.d);
  }
  // Fractional part in [0, 1), exact. Used to reduce a huge revolution count to
  // an angle without losing the digits that matter.
  frac() {
    return this.sub(new Q(this.floor()));
  }
  toNumber() {
    // Split to keep precision when n and d are both huge.
    const i = this.floor();
    const r = this.n - i * this.d;
    return Number(i) + Number((r * SCALE) / this.d) / 1e18;
  }
  toString() {
    return this.d === 1n ? `${this.n}` : `${this.n}/${this.d}`;
  }
}

export const q = Q.of;

// Prime factorisation of a (small) positive integer, for showing why tooth
// counts were chosen: 289/462 = 17² / (2·3·7·11).
export const factorize = (x: bigint): bigint[] => {
  const out: bigint[] = [];
  let v = babs(x);
  for (let p = 2n; p * p <= v; p++) {
    while (v % p === 0n) {
      out.push(p);
      v /= p;
    }
  }
  if (v > 1n) out.push(v);
  return out;
};

const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';
export const formatFactors = (x: bigint) => {
  const f = factorize(x);
  if (f.length === 0) return '1';
  const counts = new Map<bigint, number>();
  for (const p of f) counts.set(p, (counts.get(p) ?? 0) + 1);
  return [...counts]
    .map(([p, k]) => (k === 1 ? `${p}` : `${p}${[...String(k)].map((c) => SUPERSCRIPT[+c]).join('')}`))
    .join('·');
};
