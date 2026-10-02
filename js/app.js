import { CONFIG } from './config.js';
import * as D from './data.js';
import { todayISO, periodIndex, periodRange, groupByPeriod, summarise, status, cmp,
  money, parts, dayLabel, shortDate, addDays, daysBetween } from './calc.js';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TODAY = todayISO(), TOL = CONFIG.balanceTolerance, ANCHOR = CONFIG.anchorDate;
const COLOR = { 'Birthday': '#c2255c', 'Debt / Pay Later': '#e8590c', 'Fixed Essential Bills': '#3b5bdb', 'Income': '#0b7a63',
  'Lifestyle': '#0c8599', 'Savings & Sinking Funds': '#2f9e44', 'Variable Essentials': '#e8a200' };
const col = c => COLOR[c] || '#868e96';
const S = { rows: [], P: new Map(), pp: 0, cur: 0, min: 0, max: 0, view: 'now', filter: 'unpaid', af: 'all', q: '', editing: null, type: 'Expense' };
const desktop = matchMedia('(min-width:1024px)');

/* ---------- helpers ---------- */
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, 3500); }
function rebuild() {
  S.P = groupByPeriod(S.rows, ANCHOR);
  const ks = [...S.P.keys()]; S.min = Math.min(...ks); S.max = Math.max(...ks);
}
const cats = () => [...new Set([...Object.keys(COLOR), ...S.rows.map(r => r.category)])].sort();
function statusText(s, t) {
  return { short: `Short by ${money(-s.net)}${s.shortOn ? ' · runs out ' + shortDate(s.shortOn) : ''}`,
    dip: `Runs out on ${dayLabel(s.shortOn)}, then recovers`, spare: `${money(s.net)} left to assign`, zero: 'Every dollar assigned' }[t];
}
const STYLE = { short: ['var(--out)', 'var(--onout)'], dip: ['var(--out)', 'var(--onout)'], spare: ['var(--sun)', 'var(--sunink)'], zero: ['var(--in)', 'var(--onin)'] };
function pill(s, t) {
  const txt = { short: `Short ${money(-s.net)}`, dip: `Runs out ${shortDate(s.shortOn)}`, spare: `${money(s.net)} to assign`, zero: 'Fully assigned' }[t];
  return `<span class="inline-block rounded-full px-3 py-1 text-sm font-semibold num whitespace-nowrap" style="background:${STYLE[t][0]};color:${STYLE[t][1]}">${txt}</span>`;
}
const rangeLabel = r => { const y = r.start.slice(0, 4) !== TODAY.slice(0, 4); return `${shortDate(r.start)} to ${shortDate(r.end, y)}`; };

/* ---------- Now ---------- */
function periodBar() {
  const r = periodRange(S.pp, ANCHOR), isCur = S.pp === S.cur;
  const sub = isCur ? `This fortnight · day ${daysBetween(r.start, TODAY) + 1} of 14` : S.pp < S.cur ? 'Past fortnight' : `Pay day ${dayLabel(r.start)}`;
  return `<div class="flex items-center gap-2 mb-4">
    <button class="chip !px-0 w-11 text-2xl" data-pp="-1" aria-label="Previous fortnight" ${S.pp <= S.min ? 'disabled' : ''}>‹</button>
    <div class="flex-1 text-center"><div class="d font-bold text-xl">${rangeLabel(r)}</div><div class="mute text-sm">${sub}</div></div>
    <button class="chip !px-0 w-11 text-2xl" data-pp="1" aria-label="Next fortnight" ${S.pp >= S.max ? 'disabled' : ''}>›</button></div>
    ${isCur ? '' : '<div class="text-center mb-4"><button class="chip" data-pp-now>Back to this fortnight</button></div>'}`;
}
function strip(rows, r) {
  const tot = [...Array(14)].map((_, k) => { const d = addDays(r.start, k); return { d, items: rows.filter(x => x.date === d && x.type === 'Expense') }; });
  const sums = tot.map(t => t.items.reduce((s, x) => s + x.amount, 0)), top = [...sums].sort((a, b) => b - a);
  const mx = Math.max(top[1] || top[0] || 1, 1);
  return `<div class="flex items-end gap-1 h-16" role="img" aria-label="Spending by day, solid is paid, outlined is still to pay">${tot.map((t, k) => {
    const v = sums[k], h = v ? Math.max(8, Math.min(v, mx) / mx * 100) : 0, un = t.items.some(x => !x.paid);
    return `<div class="flex-1 flex flex-col justify-end items-center h-full gap-1">${h ? `<div class="w-full rounded-t" style="height:${h}%;${un ? 'border:2px solid var(--out);border-bottom:0' : 'background:var(--ink);opacity:.85'}"></div>` : ''}<div class="h-1.5 w-full rounded-full" style="background:${t.d === TODAY ? 'var(--sun)' : 'var(--line)'}"></div></div>`;
  }).join('')}</div><div class="flex justify-between text-xs mute mt-1"><span>${shortDate(r.start)}</span><span>Next pay ${shortDate(r.next)}</span></div>`;
}
function renderNow() {
  const rows = S.P.get(S.pp) || [], s = summarise(rows), t = status(s.net, TOL, s.shortOn), r = periodRange(S.pp, ANCHOR);
  const isCur = S.pp === S.cur, label = isCur ? 'Still to pay before pay day' : S.pp < S.cur ? 'Left unpaid' : 'Planned to pay';
  const pct = s.exp ? Math.round(s.paidE / s.exp * 100) : 0, p = parts(s.unpE);
  const overdue = S.rows.filter(x => !x.paid && x.date < TODAY).length;
  $('#v-now').innerHTML = `${periodBar()}
  <div class="card rounded-3xl p-5 mb-5">
    <p class="mute">${label}</p>
    <p class="num d text-6xl font-extrabold leading-none mt-1">${p.d}<span class="text-3xl mute">.${p.c}</span></p>
    <div class="h-3 rounded-full mt-4 overflow-hidden" style="background:var(--line)" role="img" aria-label="${pct} percent of spending paid"><div class="h-full" style="width:${pct}%;background:var(--in)"></div></div>
    <div class="flex justify-between text-sm mt-2"><span><b class="num">${money(s.paidE)}</b> <span class="mute">paid</span></span><span class="mute num">${pct}% of ${money(s.exp)}</span></div>
    <div class="grid grid-cols-2 gap-4 my-4 pt-4 border-t line">
      <div><p class="mute text-sm">Money in</p><p class="num d text-2xl font-bold" style="color:var(--in)">${money(s.inc)}</p>${s.unpI > 0.005 ? `<p class="text-sm mute num">${money(s.unpI)} still to arrive</p>` : ''}</div>
      <div><p class="mute text-sm">Money out</p><p class="num d text-2xl font-bold">${money(s.exp)}</p></div></div>
    <div class="rounded-2xl px-4 py-3 font-semibold" style="background:${STYLE[t][0]};color:${STYLE[t][1]}">${statusText(s, t)}</div>
    <div class="mt-5">${strip(rows, r)}</div>
  </div>
  ${overdue ? `<button class="card rounded-2xl w-full text-left p-4 mb-4 flex items-center justify-between gap-3" data-f="catch"><span><b>${overdue} items</b> are past their date and not ticked<span class="block text-sm mute">Tick them off or move them so the numbers stay honest</span></span><span class="text-2xl mute">›</span></button>` : ''}
  <div class="flex gap-2 overflow-x-auto pb-3 -mx-4 px-4" role="group" aria-label="Filter">
    ${[['unpaid', 'To pay'], ['paid', 'Paid'], ['all', 'Everything'], ...(overdue ? [['catch', `Catch up (${overdue})`]] : [])].map(([k, n]) => `<button class="chip" aria-pressed="${S.filter === k && !S.q}" data-f="${k}">${n}</button>`).join('')}</div>
  <label class="sr-only" for="srch">Search</label><input id="srch" type="search" placeholder="Search every fortnight" value="${esc(S.q)}" class="mb-4">
  <div id="list"></div>`;
  renderList();
}
const row = x => `<li class="flex items-center gap-1 border-b line last:border-0 ${x.paid ? 'opacity-60' : ''}">
  <button class="chk" role="checkbox" aria-checked="${x.paid}" aria-label="Mark ${esc(x.item)} ${x.type === 'Income' ? 'received' : 'paid'}" data-tog="${x.id}"><i>${x.paid ? '✓' : ''}</i></button>
  <button class="flex-1 min-w-0 text-left py-3 flex items-center gap-3" data-edit="${x.id}">
    <span class="w-1.5 self-stretch rounded-full" style="background:${col(x.category)}"></span>
    <span class="flex-1 min-w-0"><span class="block font-semibold truncate ${x.paid ? 'line-through' : ''}">${esc(x.item)}</span><span class="block text-sm mute truncate">${esc(x.category)}${x.notes ? ' · ' + esc(x.notes) : ''}</span></span>
    <span class="num d font-bold text-lg" style="color:${x.type === 'Income' ? 'var(--in)' : 'var(--ink)'}">${money(x.amount, { sign: x.type === 'Income' })}</span></button></li>`;
function renderList() {
  const q = S.q.trim().toLowerCase(); let rows, wide = false, note = '';
  if (q) { rows = S.rows.filter(x => `${x.item} ${x.category} ${x.notes}`.toLowerCase().includes(q)); wide = true; note = `${rows.length} matches across every fortnight`; }
  else if (S.filter === 'catch') { rows = S.rows.filter(x => !x.paid && x.date < TODAY); wide = true; note = 'Past their date but not ticked'; }
  else rows = (S.P.get(S.pp) || []).filter(x => S.filter === 'all' || (S.filter === 'unpaid' ? !x.paid : x.paid));
  rows = [...rows].sort(cmp); if (rows.length > 150) { rows = rows.slice(0, 150); note += ' (showing the first 150)'; }
  const g = {}; rows.forEach(x => (g[x.date] = g[x.date] || []).push(x));
  let html = note ? `<p class="mute text-sm mb-3">${note}</p>` : '', line = false;
  const showToday = !wide && S.pp === S.cur && S.filter !== 'paid';
  const todayLine = `<div class="flex items-center gap-3 my-3" role="separator" aria-label="Today"><span class="h-0.5 flex-1" style="background:var(--sun)"></span><span class="d font-bold px-3 py-1 rounded-full text-sm" style="background:var(--sun);color:var(--sunink)">Today</span><span class="h-0.5 flex-1" style="background:var(--sun)"></span></div>`;
  const keys = Object.keys(g);
  if (!keys.length) html += `<p class="card rounded-2xl p-6 text-center mute">${q ? 'Nothing matches that search.' : S.filter === 'unpaid' ? 'Nothing left to pay in this fortnight.' : 'Nothing to show here.'}</p>`;
  for (const d of keys) {
    if (showToday && !line && d >= TODAY) { html += todayLine; line = true; }
    const out = g[d].filter(x => x.type === 'Expense').reduce((s, x) => s + x.amount, 0);
    html += `<div class="card rounded-2xl mb-3 px-3"><div class="flex justify-between pt-3 pb-1 px-1"><h3 class="d font-bold">${dayLabel(d, wide)}</h3><span class="mute text-sm num">${out ? money(out) + ' out' : ''}</span></div><ul>${g[d].map(row).join('')}</ul></div>`;
  }
  if (showToday && !line) html += todayLine;
  $('#list').innerHTML = html;
}

/* ---------- Ahead ---------- */
function renderAhead() {
  const all = []; for (let k = S.cur + 1; k <= S.max; k++) { const s = summarise(S.P.get(k) || []); all.push({ k, s, t: status(s.net, TOL, s.shortOn), r: S.P.get(k) || [] }); }
  const bad = all.filter(x => x.t === 'short' || x.t === 'dip'), spare = all.filter(x => x.t === 'spare');
  const toAssign = spare.reduce((a, x) => a + x.s.net, 0), nxt = bad[0];
  const list = all.filter(x => S.af === 'all' || (S.af === 'short' ? x.t === 'short' || x.t === 'dip' : x.t === 'spare'));
  const vals = all.flatMap(x => [x.s.inc, x.s.exp]).sort((a, b) => b - a), mx = Math.max(vals[0] || 1, 1);
  $('#v-ahead').innerHTML = `<h1 class="d text-3xl font-extrabold mb-1">Ahead</h1><p class="mute mb-5">${all.length} fortnights planned, to ${shortDate(periodRange(S.max, ANCHOR).end, true)}.</p>
  <div class="grid grid-cols-2 gap-3 mb-5">
    <div class="card rounded-3xl p-4"><p class="mute text-sm">Fortnights that run short</p><p class="d text-5xl font-extrabold num" style="color:${bad.length ? 'var(--out)' : 'var(--in)'}">${bad.length}</p><p class="text-sm mt-1">${nxt ? `Next: ${rangeLabel(periodRange(nxt.k, ANCHOR))}, ${nxt.t === 'short' ? 'short ' + money(-nxt.s.net) : 'runs out ' + shortDate(nxt.s.shortOn)}` : 'None planned'}</p></div>
    <div class="card rounded-3xl p-4"><p class="mute text-sm">Still to assign</p><p class="d text-4xl font-extrabold num leading-tight">${money(toAssign).replace(/\.\d\d$/, '')}</p><p class="text-sm mt-1">Across ${spare.length} fortnights</p></div></div>
  <div class="flex gap-2 overflow-x-auto pb-3 -mx-4 px-4" role="group" aria-label="Filter">${[['all', 'All'], ['short', 'Short'], ['spare', 'To assign']].map(([k, n]) => `<button class="chip" aria-pressed="${S.af === k}" data-af="${k}">${n}</button>`).join('')}</div>
  <ol class="space-y-3 mt-2">${list.map(({ k, s, t, r }) => {
    const tags = r.filter(x => x.category === 'Birthday' || x.category === 'Debt / Pay Later'), rg = periodRange(k, ANCHOR);
    return `<li><button class="card rounded-2xl p-4 w-full text-left" data-goto="${k}" ${t === 'short' || t === 'dip' ? 'style="border-color:var(--out)"' : ''}>
      <div class="flex justify-between items-start gap-3"><div><span class="d font-bold text-lg">${rangeLabel(rg)}</span><span class="block text-sm mute num">In ${money(s.inc)} · Out ${money(s.exp)}</span></div>${pill(s, t)}</div>
      <div class="mt-3 space-y-1.5" aria-hidden="true"><div class="h-2.5 rounded-full" style="width:${s.inc / mx * 100}%;background:var(--in)"></div><div class="h-2.5 rounded-full" style="width:${s.exp / mx * 100}%;background:${t === 'short' ? 'var(--out)' : 'var(--ink)'}"></div></div>
      ${tags.length ? `<p class="text-sm mt-3 flex flex-wrap gap-1.5">${tags.slice(0, 3).map(x => `<span class="rounded-full px-2.5 py-1" style="background:var(--bg)">${esc(x.item)} ${money(x.amount)}</span>`).join('')}${tags.length > 3 ? `<span class="mute py-1">+${tags.length - 3} more</span>` : ''}</p>` : ''}</button></li>`;
  }).join('') || '<li class="card rounded-2xl p-6 text-center mute">No fortnights match.</li>'}</ol>`;
}

/* ---------- Where ---------- */
function catTotals(rows) {
  const m = {}; rows.filter(x => x.type === 'Expense').forEach(x => { const c = m[x.category] ||= { t: 0, p: 0, items: [] }; c.t += x.amount; if (x.paid) c.p += x.amount; c.items.push(x); });
  return m;
}
function renderWhere() {
  const rows = S.P.get(S.pp) || [], by = catTotals(rows), prev = catTotals(S.P.get(S.pp - 1) || []);
  const ents = Object.entries(by).sort((a, b) => b[1].t - a[1].t), tot = ents.reduce((s, [, v]) => s + v.t, 0) || 1;
  $('#v-where').innerHTML = `${periodBar()}<h1 class="d text-3xl font-extrabold mb-1">Where it goes</h1><p class="mute mb-5">${money(tot)} planned out.</p>
  <div class="flex h-16 rounded-2xl overflow-hidden mb-5 gap-0.5" role="img" aria-label="Spending split by category">${ents.map(([c, v]) => `<div style="flex:${v.t};background:${col(c)}" title="${esc(c)}"></div>`).join('')}</div>
  <ul class="card rounded-2xl px-4">${ents.map(([c, v]) => {
    const dl = prev[c] ? v.t - prev[c].t : null;
    return `<li class="border-b line last:border-0"><details><summary class="py-4 block"><div class="flex justify-between items-baseline gap-3"><span class="font-semibold flex items-center gap-2 min-w-0"><span class="caret mute transition-transform">›</span><span class="w-3 h-3 rounded-full flex-none" style="background:${col(c)}"></span><span class="truncate">${esc(c)}</span></span><span class="num d text-lg font-bold">${money(v.t)}</span></div>
      <div class="h-2 rounded-full mt-2 overflow-hidden" style="background:var(--line)"><div class="h-full" style="width:${v.p / v.t * 100}%;background:${col(c)}"></div></div>
      <div class="flex justify-between text-sm mute mt-1 num"><span>${money(v.p)} paid · ${money(v.t - v.p)} to go</span><span>${Math.round(v.t / tot * 100)}%${dl !== null && Math.abs(dl) >= 0.01 ? ` · ${money(dl, { sign: true })} vs last` : ''}</span></div></summary>
      <ul class="pb-3">${v.items.sort((a, b) => b.amount - a.amount).map(x => `<li class="flex justify-between py-2 pl-6 ${x.paid ? 'mute' : ''}"><button class="text-left min-h-[44px] flex-1 truncate" data-edit="${x.id}">${x.paid ? '✓ ' : ''}${esc(x.item)} <span class="text-sm mute">${shortDate(x.date)}</span></button><span class="num">${money(x.amount)}</span></li>`).join('')}</ul></details></li>`;
  }).join('') || '<li class="py-6 text-center mute">No spending planned in this fortnight.</li>'}</ul>`;
}

/* ---------- view control ---------- */
function render() { ({ now: renderNow, ahead: renderAhead, where: renderWhere })[S.view](); }
function setView(v) {
  S.view = v; ['now', 'ahead', 'where'].forEach(k => $('#v-' + k).hidden = k !== v);
  $$('.tab').forEach(t => t.setAttribute('aria-selected', t.dataset.v === v)); window.scrollTo(0, 0); render();
}

/* ---------- add / edit ---------- */
function setType(t) {
  S.type = t; $$('#typeSw button').forEach(b => b.setAttribute('aria-pressed', b.dataset.t === t));
  if (t === 'Income') $('#fCat').value = 'Income'; else if ($('#fCat').value === 'Income') $('#fCat').value = 'Variable Essentials';
}
function openSheet(id) {
  const x = id ? S.rows.find(r => String(r.id) === String(id)) : null; S.editing = x || null;
  const pr = periodRange(S.pp, ANCHOR), d0 = S.pp === S.cur || (TODAY >= pr.start && TODAY <= pr.end) ? TODAY : pr.start;
  $('#sheetTitle').textContent = x ? 'Edit item' : 'Add item'; $('#saveBtn').textContent = x ? 'Save changes' : 'Save item';
  $('#delBtn').hidden = !x; $('#fErr').textContent = '';
  $('#fCat').innerHTML = cats().map(c => `<option>${esc(c)}</option>`).join('');
  $('#names').innerHTML = [...new Set(S.rows.map(r => r.item))].sort().map(n => `<option value="${esc(n)}">`).join('');
  $('#fAmt').value = x ? x.amount : ''; $('#fName').value = x ? x.item : ''; $('#fDate').value = x ? x.date : d0;
  $('#fCat').value = x ? x.category : 'Variable Essentials'; $('#fNote').value = x ? x.notes : '';
  const paid = x ? x.paid : false; $('#fPaid').setAttribute('aria-checked', paid); $('#fPaid i').textContent = paid ? '✓' : '';
  S.type = x ? x.type : 'Expense'; $$('#typeSw button').forEach(b => b.setAttribute('aria-pressed', b.dataset.t === S.type));
  $('#sheet').classList.remove('closed'); $('#scrim').hidden = desktop.matches;
  if (!desktop.matches) setTimeout(() => $('#fAmt').focus(), 280);
}
function closeSheet() { $('#scrim').hidden = true; if (desktop.matches) openSheet(); else $('#sheet').classList.add('closed'); }
async function save() {
  const a = parseFloat($('#fAmt').value), name = $('#fName').value.trim(), err = $('#fErr');
  if (!(a > 0)) { err.textContent = 'Enter an amount above zero.'; $('#fAmt').focus(); return; }
  if (!name) { err.textContent = 'Give the item a name.'; $('#fName').focus(); return; }
  if (!$('#fDate').value) { err.textContent = 'Pick a date.'; return; }
  const o = { date: $('#fDate').value, item: name, amount: Math.round(a * 100) / 100, type: S.type, category: $('#fCat').value, notes: $('#fNote').value.trim(), paid: $('#fPaid').getAttribute('aria-checked') === 'true' };
  $('#saveBtn').disabled = true;
  try {
    if (S.editing) { const n = await D.updateItem(S.editing.id, o); S.rows = S.rows.map(r => r.id === n.id ? n : r); }
    else S.rows.push(await D.insertItem(o));
    rebuild(); closeSheet(); render(); toast('Saved');
  } catch (e) { err.textContent = 'Could not save: ' + (e.message || e); }
  $('#saveBtn').disabled = false;
}
async function togglePaid(id) {
  const x = S.rows.find(r => String(r.id) === String(id)); if (!x) return;
  x.paid = !x.paid; render();
  try { await D.setPaid(x.id, x.paid); } catch (e) { x.paid = !x.paid; render(); toast('Could not update: ' + (e.message || e)); }
}
async function remove() {
  if (!S.editing || !confirm(`Delete "${S.editing.item}"?`)) return;
  try { await D.removeItem(S.editing.id); S.rows = S.rows.filter(r => r !== S.editing); rebuild(); closeSheet(); render(); toast('Deleted'); }
  catch (e) { $('#fErr').textContent = 'Could not delete: ' + (e.message || e); }
}

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.v) setView(b.dataset.v);
  else if (b.dataset.tog) togglePaid(b.dataset.tog);
  else if (b.dataset.edit) openSheet(b.dataset.edit);
  else if (b.dataset.f) { S.filter = b.dataset.f; S.q = ''; render(); }
  else if (b.dataset.af) { S.af = b.dataset.af; render(); }
  else if (b.dataset.pp) { S.pp = Math.min(S.max, Math.max(S.min, S.pp + +b.dataset.pp)); render(); }
  else if ('ppNow' in b.dataset) { S.pp = S.cur; render(); }
  else if (b.dataset.goto) { S.pp = +b.dataset.goto; S.filter = 'unpaid'; setView('now'); }
  else if (b.dataset.t) setType(b.dataset.t);
  else if (b.id === 'addBtn') openSheet();
  else if (b.id === 'closeBtn') closeSheet();
  else if (b.id === 'fPaid') { const on = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', on); b.querySelector('i').textContent = on ? '✓' : ''; }
  else if (b.id === 'saveBtn') save();
  else if (b.id === 'delBtn') remove();
  else if (b.id === 'outBtn' || b.id === 'outBtn2') D.signOut();
});
$('#scrim').addEventListener('click', closeSheet);
document.addEventListener('input', e => { if (e.target.id === 'srch') { S.q = e.target.value; renderList(); } });
$('#fName').addEventListener('change', () => {   // reuse category and amount from the last entry with this name
  if (S.editing || $('#fAmt').value) return;
  const m = [...S.rows].reverse().find(r => r.item.toLowerCase() === $('#fName').value.trim().toLowerCase());
  if (m) { $('#fAmt').value = m.amount; $('#fCat').value = m.category; setType(m.type); }
});
desktop.addEventListener('change', () => { if (desktop.matches) openSheet(); else closeSheet(); });

/* ---------- auth and boot ---------- */
function showAuth(msg = '') { $('#app').hidden = true; $('#auth').hidden = false; $('#aErr').textContent = msg; }
async function start() {
  try {
    S.rows = await D.loadItems(); if (!S.rows.length) throw new Error('No budget items found. Check Row Level Security allows signed-in users to read.');
    rebuild(); S.cur = periodIndex(TODAY, ANCHOR); S.pp = Math.min(S.max, Math.max(S.min, S.cur));
    $('#people').textContent = CONFIG.people.map(p => p.name).join(' and ');
    $('#auth').hidden = true; $('#app').hidden = false; setView('now'); if (desktop.matches) openSheet();
  } catch (e) { showAuth('Could not load the budget: ' + (e.message || e)); }
}
$('#aGo').addEventListener('click', async () => {
  $('#aErr').textContent = ''; const { error } = await D.signIn($('#aEmail').value.trim(), $('#aPass').value);
  if (error) $('#aErr').textContent = error.message;
});
$('#aPass').addEventListener('keydown', e => { if (e.key === 'Enter') $('#aGo').click(); });
if (!D.configured) showAuth('Add your Supabase anon key in js/config.js first.');
else {
  let started = null;
  D.sb.auth.onAuthStateChange((_ev, session) => {
    if (!session) { started = null; showAuth(); }
    else if (started !== session.user.id) { started = session.user.id; setTimeout(start, 0); }
  });
}
