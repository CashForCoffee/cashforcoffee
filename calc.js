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
// zero: balance of about nothing. low: balance under the warning amount. spare: comfortable balance.
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

// ---------- recurring dates ----------
// Weekly and fortnightly step by days. Monthly keeps the day of the month,
// using the last day of shorter months (31 Jan, 28 Feb, 31 Mar).
export function repeatDates(first, freq, until, cap = 400) {
  const out = [];
  if (!first || !until || until < first) return out;
  const [y, m, d] = first.split('-').map(Number);
  for (let i = 0; out.length < cap; i++) {
    let date;
    if (freq === 'monthly') {
      const t = m - 1 + i, yy = y + Math.floor(t / 12), mm = t % 12;
      const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
      date = `${yy}-${String(mm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
    } else date = addDays(first, i * (freq === 'weekly' ? 7 : 14));
    if (date > until) break;
    out.push(date);
  }
  return out;
}

// ---------- pasted Excel rows ----------
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const ymd = (y, m, d) => {
  const t = Date.UTC(y, m - 1, d), x = new Date(t);
  return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d ? iso(t) : null;
};
const yr = s => (+s < 100 ? 2000 + +s : +s);
// Accepts 2026-08-13, 13/8/2026 (day first), 13 Aug 2026, Thu 13-Aug-26 and Excel serial numbers.
export function parseDate(v) {
  const s = String(v ?? '').trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return ymd(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/))) return ymd(yr(m[3]), +m[2], +m[1]);
  if ((m = s.match(/^(?:[A-Za-z]{3,9},?\s+)?(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s,-]+(\d{2}|\d{4})$/)) && MON[m[2].toLowerCase()])
    return ymd(yr(m[3]), MON[m[2].toLowerCase()], +m[1]);
  if (/^\d{5}$/.test(s)) return iso(Date.UTC(1899, 11, 30) + +s * DAY);
  return null;
}
// Tab separated text copied from Excel. Columns Date, Item, Amount, Type, Category, Paid, Notes,
// either in that order with no header, or in any order with a header row.
export function parsePaste(text) {
  const lines = text.replace(/\r/g, '').split('\n'), rows = [], errors = [];
  const cell = x => x.trim().replace(/^"(.*)"$/s, '$1').trim();
  const at = lines.findIndex(l => l.trim()); if (at < 0) return { rows, errors };
  let cols = ['date', 'item', 'amount', 'type', 'category', 'paid', 'notes'], from = at;
  const first = lines[at].split('\t').map(cell);
  if (!parseDate(first[0])) {
    cols = first.map(h => h.toLowerCase());
    if (!cols.includes('date') || !cols.includes('amount'))
      return { rows, errors: [{ line: at + 1, msg: 'The first row should be headers that include Date and Amount, or leave the headers out.' }] };
    from = at + 1;
  }
  for (let i = from; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const c = lines[i].split('\t').map(cell), g = k => c[cols.indexOf(k)] ?? '';
    const date = parseDate(g('date')), amount = Math.abs(parseFloat(g('amount').replace(/[$,\s()]/g, '')));
    const t = g('type'), type = /^i/i.test(t) ? 'Income' : /^e/i.test(t) ? 'Expense' : null, item = g('item');
    const bad = !date ? `Date "${g('date')}" not recognised` : !(amount > 0) ? `Amount "${g('amount')}" not recognised`
      : !type ? `Type "${t}" should be Income or Expense` : !item ? 'Item is blank' : null;
    if (bad) { errors.push({ line: i + 1, msg: bad }); continue; }
    rows.push({ date, item, amount: round(amount), type, category: g('category') || 'Uncategorised',
      paid: /^(y|yes|true|1|x|✓|paid)$/i.test(g('paid')), notes: g('notes') });
  }
  return { rows, errors };
}
