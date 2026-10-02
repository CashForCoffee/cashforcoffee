// Pure budget maths and formatting. No DOM, no network.
const DAY = 86400000;
const utc = s => Date.parse(s + 'T00:00:00Z');
const iso = ms => new Date(ms).toISOString().slice(0, 10);

export const todayISO = () => new Date().toLocaleDateString('en-CA');
export const round = n => Math.round(n * 100) / 100;
export const addDays = (s, n) => iso(utc(s) + n * DAY);
export const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / DAY);
export const periodIndex = (date, anchor) => Math.floor((utc(date) - utc(anchor)) / (14 * DAY));
export function periodRange(pp, anchor) {
  const s = utc(anchor) + pp * 14 * DAY;
  return { start: iso(s), end: iso(s + 13 * DAY), next: iso(s + 14 * DAY) };
}

// Same day: income first, so pay day money is available before bills.
export const cmp = (a, b) =>
  a.date.localeCompare(b.date) ||
  (a.type === 'Income' ? 0 : 1) - (b.type === 'Income' ? 0 : 1) ||
  a.item.localeCompare(b.item);

export function groupByPeriod(rows, anchor) {
  const m = new Map();
  for (const r of rows) {
    const k = periodIndex(r.date, anchor);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  for (const a of m.values()) a.sort(cmp);
  return m;
}

// Each fortnight stands alone: zero-based, so no opening balance.
export function summarise(rows) {
  let inc = 0, exp = 0, paidI = 0, paidE = 0, run = 0, shortOn = null, low = 0;
  for (const r of [...rows].sort(cmp)) {
    if (r.type === 'Income') { inc += r.amount; run += r.amount; if (r.paid) paidI += r.amount; }
    else { exp += r.amount; run -= r.amount; if (r.paid) paidE += r.amount; }
    if (run < -0.005) { if (!shortOn) shortOn = r.date; low = Math.min(low, run); }
  }
  return {
    inc: round(inc), exp: round(exp), paidI: round(paidI), paidE: round(paidE),
    unpI: round(inc - paidI), unpE: round(exp - paidE),
    net: round(inc - exp), shortOn, low: round(low)
  };
}

// short: ends negative. dip: ends fine but runs out part way through.
// zero: fully assigned. low: money left but under the warning amount. spare: comfortable amount left.
export const status = (net, tol = 1, shortOn = null, warn = 0) =>
  net < -tol ? 'short' : shortOn ? 'dip' : Math.abs(net) <= tol ? 'zero' : net < warn ? 'low' : 'spare';

export const money = (n, { sign = false } = {}) =>
  (n < 0 ? '-' : sign && n > 0 ? '+' : '') + '$' +
  Math.abs(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const parts = n => {
  const [d, c] = Math.abs(n).toFixed(2).split('.');
  return { d: (n < 0 ? '-' : '') + '$' + Number(d).toLocaleString('en-AU'), c };
};
const fmt = (s, o) => new Date(utc(s)).toLocaleDateString('en-AU', { timeZone: 'UTC', ...o });
export const dayLabel = (s, year) => fmt(s, { weekday: 'short', day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) });
export const shortDate = (s, year) => fmt(s, { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) });
