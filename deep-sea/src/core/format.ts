// Number formatting for big idle numbers.

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

function fmt(n: number, sci = false): string {
  if (!isFinite(n)) return '∞';
  if (n < 0) return '-' + fmt(-n, sci);
  if (n < 1000) {
    if (n < 10 && n % 1 !== 0) return n.toFixed(1).replace(/\.0$/, '');
    return Math.floor(n).toString();
  }
  const exp = Math.floor(Math.log10(n));
  const tier = Math.floor(exp / 3);
  if (sci || tier >= SUFFIXES.length) {
    const m = n / Math.pow(10, exp);
    return m.toFixed(2) + 'e' + exp;
  }
  const scaled = n / Math.pow(1000, tier);
  const digits = scaled >= 100 ? 1 : 2;
  return scaled.toFixed(digits).replace(/\.?0+$/, '') + SUFFIXES[tier];
}

function fmtTime(seconds: number): string {
  seconds = Math.max(0, Math.floor(seconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
