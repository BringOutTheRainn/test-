// Number and time formatting for the UI. Numbers are plain doubles.

const SHORT = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'UDc', 'DDc', 'TDc', 'QaDc', 'QiDc', 'SxDc', 'SpDc', 'OcDc', 'NoDc', 'Vg'];

const LONG = ['', 'thousand', 'million', 'billion', 'trillion', 'quadrillion', 'quintillion', 'sextillion', 'septillion', 'octillion', 'nonillion', 'decillion', 'undecillion', 'duodecillion', 'tredecillion', 'quattuordecillion', 'quindecillion', 'sexdecillion', 'septendecillion', 'octodecillion', 'novemdecillion', 'vigintillion'];

export type NumberStyle = 'short' | 'scientific';

let style: NumberStyle = 'short';

export function setNumberStyle(s: NumberStyle): void {
  style = s;
}

function trimFixed(n: number, digits: number): string {
  return n.toFixed(digits).replace(/\.?0+$/, '');
}

/** Short form for counters and prices: 999, 1.23K, 45.6M, 1.00e+66. */
export function fmt(n: number, decimalsUnder1000 = 0): string {
  if (!isFinite(n)) return n > 0 ? '∞' : '-∞';
  if (n < 0) return '-' + fmt(-n, decimalsUnder1000);
  if (n < 1000) {
    if (decimalsUnder1000 > 0 && n < 100 && n !== Math.floor(n)) return trimFixed(n, decimalsUnder1000);
    return Math.floor(n).toString();
  }
  const tier = Math.floor(Math.log10(n) / 3);
  if (style === 'scientific' || tier >= SHORT.length) {
    const exp = Math.floor(Math.log10(n));
    const mant = n / Math.pow(10, exp);
    return mant.toFixed(2) + 'e' + exp;
  }
  const scaled = n / Math.pow(1000, tier);
  // Guard against 999.995 rounding up to "1000.00K".
  const digits = scaled >= 100 ? 1 : 2;
  let text = scaled.toFixed(digits);
  if (parseFloat(text) >= 1000) return fmt(Math.pow(1000, tier + 1), decimalsUnder1000);
  text = trimFixed(scaled, digits);
  return text + SHORT[tier];
}

/** Long form for descriptions: "1.23 million". */
export function fmtLong(n: number): string {
  if (n < 1e6 || style === 'scientific') return n < 1e6 ? Math.floor(n).toLocaleString('en-US') : fmt(n);
  const tier = Math.floor(Math.log10(n) / 3);
  if (tier >= LONG.length) return fmt(n);
  return trimFixed(n / Math.pow(1000, tier), 3) + ' ' + LONG[tier];
}

/** Rates like "0.1" or "4.5K". */
export function fmtRate(n: number): string {
  return fmt(n, 1);
}

/** 3h 12m, 4m 05s, 12s. */
export function fmtTime(seconds: number): string {
  seconds = Math.max(0, Math.floor(seconds));
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}

export function fmtPercent(fraction: number): string {
  const pct = fraction * 100;
  if (pct > 0 && pct < 0.1) return '<0.1%';
  return (pct >= 100 ? fmt(pct) : trimFixed(pct, 1)) + '%';
}
