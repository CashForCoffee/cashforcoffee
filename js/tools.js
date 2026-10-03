// Tools menu: recurring payments, bulk amount update, Excel import, CSV export.
import * as D from './data.js';
import { money, shortDate, dayLabel, repeatDates, parsePaste, todayISO, periodRange } from './calc.js';

let ctx, rtype = 'Expense', imode = 'add', iskip = true;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => parseFloat(String(v).replace(/[$,\s]/g, ''));
const field = (id, label, inner) => `<div><label class="mute text-sm" for="${id}">${label}</label>${inner}</div>`;
const GO = 'class="w-full min-h-[56px] rounded-2xl font-bold text-lg disabled:opacity-40" style="background:var(--sun);color:var(--sunink)"';
const BACK = '<button class="chip mb-4" data-tool="menu">‹ Tools</button>';
const BOX = 'card rounded-2xl p-4 text-sm';
const names = () => [...new Set(ctx.S.rows.map(r => r.item))].sort().map(n => `<option value="${esc(n)}">`).join('');
const catOptions = () => ctx.cats().map(c => `<option>${esc(c)}</option>`).join('');
const pressed = (sel, attr, val) => document.querySelectorAll(sel).forEach(b => b.setAttribute('aria-pressed', b.dataset[attr] === val));

function open(title, html) { $('#modalTitle').textContent = title; $('#modalBody').innerHTML = html; $('#modal').hidden = false; $('#modal > div:last-child').scrollTop = 0; }
function close() { $('#modal').hidden = true; $('#modalBody').innerHTML = ''; }
function finish(msg) { ctx.refresh(); close(); ctx.toast(msg); }

function menu() {
  const items = [['recur', 'Add a recurring payment', 'Creates one row for each date'], ['bulk', 'Update an amount going forward', 'Skips paid rows'],
    ['import', 'Import from Excel', 'Paste rows to add, or start fresh'], ['export', 'Export to CSV', 'Download every item']];
  open('Tools', `<div class="space-y-3">${items.map(([k, t, s]) => `<button class="card rounded-2xl w-full text-left p-4 flex justify-between items-center gap-3" data-tool="${k}"><span><b>${t}</b><span class="block text-sm mute">${s}</span></span><span class="text-2xl mute">›</span></button>`).join('')}<button class="chip w-full" data-tool="out">Sign out</button></div>`);
}

/* ---------- export ---------- */
const csvCell = v => { v = String(v ?? ''); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
function exportCsv() {
  const lines = [...ctx.S.rows].sort((a, b) => a.date.localeCompare(b.date) || a.item.localeCompare(b.item))
    .map(r => [r.date, r.item, r.amount.toFixed(2), r.type, r.category, r.paid ? 'Yes' : 'No', r.notes].map(csvCell).join(','));
  const text = '\ufeff' + ['Date,Item,Amount,Type,Category,Paid,Notes', ...lines].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); a.download = `cash-for-coffee-${todayISO()}.csv`;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return lines.length;
}
function exp() { const n = exportCsv(); close(); ctx.toast(`Exported ${n} items`); }

/* ---------- recurring ---------- */
function recur() {
  rtype = 'Expense';
  open('Recurring payment', `${BACK}<p class="mute mb-4">Creates one row for each date. The rows are not linked, so you can edit them one at a time later, or use Update an amount.</p>
  <div class="space-y-4">
    <div class="grid grid-cols-2 gap-2"><button class="chip" data-rt="Expense" aria-pressed="true">Money out</button><button class="chip" data-rt="Income" aria-pressed="false">Money in</button></div>
    ${field('rAmt', 'Amount', '<input id="rAmt" inputmode="decimal" placeholder="0.00">')}
    ${field('rItem', 'What is it', `<input id="rItem" list="rNames" autocomplete="off" placeholder="e.g. Gym"><datalist id="rNames">${names()}</datalist>`)}
    ${field('rCat', 'Category', `<select id="rCat">${catOptions()}</select>`)}
    ${field('rDate', 'First date', `<input id="rDate" type="date" value="${todayISO()}">`)}
    ${field('rFreq', 'Repeats', '<select id="rFreq"><option value="fortnightly">Every fortnight</option><option value="weekly">Every week</option><option value="monthly">Every month</option></select>')}
    ${field('rUntil', 'Until', `<input id="rUntil" type="date" value="${periodRange(ctx.S.max, ctx.getAnchor()).end}">`)}
    ${field('rNote', 'Notes', '<input id="rNote" placeholder="Optional">')}
    <div id="rPrev" class="${BOX} mute"></div>
    <button id="rGo" ${GO} disabled>Add payments</button></div>`);
  $('#rCat').value = 'Variable Essentials'; recurPreview();
}
function setRType(t) {
  rtype = t; pressed('[data-rt]', 'rt', t);
  if (t === 'Income') $('#rCat').value = 'Income'; else if ($('#rCat').value === 'Income') $('#rCat').value = 'Variable Essentials';
}
const recurIn = () => ({ amount: num($('#rAmt').value), item: $('#rItem').value.trim(), cat: $('#rCat').value, first: $('#rDate').value, freq: $('#rFreq').value, until: $('#rUntil').value, note: $('#rNote').value.trim() });
function recurAutofill() {
  const m = [...ctx.S.rows].reverse().find(r => r.item.toLowerCase() === $('#rItem').value.trim().toLowerCase());
  if (!m) return;
  if (!$('#rAmt').value) $('#rAmt').value = m.amount;
  $('#rCat').value = m.category; setRType(m.type); recurPreview();
}
function recurPreview() {
  const i = recurIn(), dates = repeatDates(i.first, i.freq, i.until), past = dates.filter(d => d < todayISO()).length;
  let t = !dates.length ? 'Pick a first date, and an until date on or after it.'
    : `<b>${dates.length} rows</b>, ${shortDate(dates[0], true)} to ${shortDate(dates.at(-1), true)}${i.amount > 0 ? `, ${money(i.amount * dates.length)} in total` : ''}.<br>${dates.slice(0, 4).map(d => dayLabel(d)).join(', ')}${dates.length > 4 ? ' ...' : ''}`;
  if (dates.length >= 400) t += '<br>Limited to 400 rows.';
  if (past) t += `<br>${past} dates are in the past and will show as not ticked.`;
  if (i.freq === 'monthly' && i.first.slice(8) > '28') t += '<br>Shorter months use their last day.';
  $('#rPrev').innerHTML = t; $('#rGo').disabled = !(i.amount > 0 && i.item && dates.length);
}
async function runRecur() {
  const i = recurIn(), track = [], btn = $('#rGo'); btn.disabled = true;
  const objs = repeatDates(i.first, i.freq, i.until).map(date => ({ date, item: i.item, amount: Math.round(i.amount * 100) / 100, type: rtype, category: i.cat, notes: i.note, paid: false }));
  try { await D.insertMany(objs, track); ctx.S.rows.push(...track); finish(`Added ${track.length} payments`); }
  catch (e) { ctx.S.rows.push(...track); ctx.refresh(); $('#rPrev').innerHTML = `<span style="color:var(--out)">Saved ${track.length} of ${objs.length} rows, then it failed: ${esc(e.message || e)}</span>`; btn.disabled = false; }
}

/* ---------- bulk update ---------- */
function bulk() {
  open('Update an amount', `${BACK}<p class="mute mb-4">Changes every unpaid row with this item name, from the date you pick onward. Paid rows are left alone.</p>
  <div class="space-y-4">
    ${field('bItem', 'Item', `<input id="bItem" list="bNames" autocomplete="off" placeholder="e.g. Rent"><datalist id="bNames">${names()}</datalist>`)}
    ${field('bAmt', 'New amount', '<input id="bAmt" inputmode="decimal" placeholder="0.00">')}
    ${field('bFrom', 'From date', `<input id="bFrom" type="date" value="${todayISO()}">`)}
    <div id="bPrev" class="${BOX} mute">Choose an item.</div>
    <button id="bGo" ${GO} disabled>Update amounts</button></div>`);
}
function bulkHits() {
  const item = $('#bItem').value.trim().toLowerCase(), from = $('#bFrom').value;
  const m = ctx.S.rows.filter(r => item && from && r.item.toLowerCase() === item && r.date >= from);
  return { hit: m.filter(r => !r.paid), skipped: m.filter(r => r.paid).length };
}
function bulkPreview() {
  const { hit, skipped } = bulkHits(), amt = num($('#bAmt').value), skip = skipped ? `<br>${skipped} paid rows skipped.` : ''; let t;
  if (!$('#bItem').value.trim()) t = 'Choose an item.';
  else if (!hit.length) t = 'No unpaid rows match that item from that date.' + skip;
  else {
    const a = hit.map(r => r.amount), lo = Math.min(...a), hi = Math.max(...a), ds = hit.map(r => r.date).sort();
    t = `<b>${hit.length} rows</b>, ${shortDate(ds[0], true)} to ${shortDate(ds.at(-1), true)}.<br>Now ${lo === hi ? money(lo) : money(lo) + ' to ' + money(hi)}${amt > 0 ? `, becoming ${money(amt)}` : ''}.` + skip;
  }
  $('#bPrev').innerHTML = t; $('#bGo').disabled = !(hit.length && amt > 0);
}
async function runBulk() {
  const { hit } = bulkHits(), amt = Math.round(num($('#bAmt').value) * 100) / 100; $('#bGo').disabled = true;
  try {
    const out = await D.updateAmount(hit.map(r => r.id), amt), m = new Map(out.map(r => [r.id, r]));
    ctx.S.rows = ctx.S.rows.map(r => m.get(r.id) || r); finish(`Updated ${out.length} rows`);
  } catch (e) { $('#bPrev').innerHTML = `<span style="color:var(--out)">Could not update: ${esc(e.message || e)}</span>`; $('#bGo').disabled = false; }
}

/* ---------- import ---------- */
function imp() {
  imode = 'add'; iskip = true;
  open('Import from Excel', `${BACK}<p class="mute mb-4">In Excel, select the rows with these columns: Date, Item, Amount, Type, Category, Paid, Notes. A header row is fine. Copy, then paste below. Dates are read as day, month, year.</p>
  <div class="space-y-4">
    <textarea id="iText" rows="7" placeholder="Paste here" style="white-space:pre"></textarea>
    <div class="grid grid-cols-2 gap-2"><button class="chip" data-im="add" aria-pressed="true">Add to budget</button><button class="chip" data-im="fresh" aria-pressed="false">Start fresh</button></div>
    <button class="chip w-full" id="iSkip" data-skip aria-pressed="true">Skip rows that already exist</button>
    <div id="iFresh" class="space-y-4" hidden>
      <p class="${BOX}" style="border-color:var(--out)">Start fresh deletes all <b>${ctx.S.rows.length}</b> existing items and replaces them with the pasted rows. A backup CSV downloads first.</p>
      ${field('iAnchor', 'Anchor date (a pay day, the first day of a fortnight)', `<input id="iAnchor" type="date" value="${ctx.getAnchor()}">`)}
      ${field('iConfirm', 'Type START FRESH to confirm', '<input id="iConfirm" autocomplete="off" autocapitalize="characters">')}
    </div>
    <div id="iPrev" class="${BOX} mute">Paste rows above.</div>
    <button id="iGo" ${GO} disabled>Add rows</button></div>`);
}
function setIMode(m) { imode = m; pressed('[data-im]', 'im', m); $('#iSkip').hidden = m === 'fresh'; $('#iFresh').hidden = m !== 'fresh'; importPreview(); }
function importState() {
  const { rows, errors } = parsePaste($('#iText').value), key = r => `${r.date}|${r.item.toLowerCase()}|${r.amount}|${r.type}`;
  const have = new Set(ctx.S.rows.map(key)), skipping = imode === 'add' && iskip;
  const toAdd = skipping ? rows.filter(r => !have.has(key(r))) : rows;
  return { rows, errors, toAdd, dup: rows.length - toAdd.length };
}
function importPreview() {
  const { rows, errors, toAdd, dup } = importState(); let t;
  if (!$('#iText').value.trim()) t = 'Paste rows above.';
  else {
    const ds = rows.map(r => r.date).sort(), sum = ty => rows.filter(r => r.type === ty).reduce((s, r) => s + r.amount, 0);
    t = rows.length ? `<b>${toAdd.length} rows</b> will be ${imode === 'fresh' ? 'imported' : 'added'}, ${shortDate(ds[0], true)} to ${shortDate(ds.at(-1), true)}.<br>In ${money(sum('Income'))} · Out ${money(sum('Expense'))}` : 'No valid rows found.';
    if (dup) t += `<br>${dup} rows already exist and will be skipped.`;
    if (errors.length) t += `<div class="mt-2" style="color:var(--out)"><b>${errors.length} problems. Fix them in Excel and paste again.</b><br>${errors.slice(0, 6).map(e => `Line ${e.line}: ${esc(e.msg)}`).join('<br>')}${errors.length > 6 ? '<br>...' : ''}</div>`;
  }
  $('#iPrev').innerHTML = t;
  const sure = imode === 'add' || ($('#iAnchor').value && $('#iConfirm').value.trim().toUpperCase() === 'START FRESH');
  $('#iGo').textContent = imode === 'fresh' ? 'Delete everything and import' : 'Add rows';
  $('#iGo').disabled = !(rows.length && !errors.length && toAdd.length && sure);
}
async function runImport() {
  const { toAdd } = importState(), btn = $('#iGo'), track = []; let stage = 'insert'; btn.disabled = true;
  try {
    if (imode === 'add') { await D.insertMany(toAdd, track); ctx.S.rows.push(...track); return finish(`Added ${track.length} rows`); }
    const anchor = $('#iAnchor').value, oldIds = ctx.S.rows.map(r => r.id);
    exportCsv();                                   // backup before anything is deleted
    await D.insertMany(toAdd, track);              // new rows first, so a failure here loses nothing
    stage = 'remove'; await D.removeMany(oldIds);
    let warn = ''; try { await D.saveAnchor(anchor); } catch (e) { warn = `Imported, but the anchor date could not be saved to budget_settings: ${e.message || e}. It is set on this device only until that is fixed.`; }
    ctx.setAnchor(anchor); close(); await ctx.reload({ keepAnchor: true }); ctx.toast(`Imported ${track.length} rows`);
    if (warn) alert(warn);
  } catch (e) {
    let msg = `Import failed: ${esc(e.message || e)}. `;
    if (imode === 'add') { ctx.S.rows.push(...track); ctx.refresh(); msg += `${track.length} rows were added before the error.`; }
    else if (stage === 'insert') { await D.removeMany(track.map(r => r.id)).catch(() => {}); msg += 'Nothing was deleted.'; }
    else { msg += 'The new rows were added but the old ones were not all removed. Your backup CSV was downloaded. Reload and check Everything.'; }
    $('#iPrev').innerHTML = `<span style="color:var(--out)">${msg}</span>`; btn.disabled = false;
  }
}

/* ---------- wiring ---------- */
export function initTools(c) {
  ctx = c;
  document.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'toolsBtn' || b.id === 'toolsBtn2') menu();
    else if (b.id === 'modalClose') close();
    else if (b.dataset.tool) ({ menu, recur, bulk, import: imp, export: exp, out: () => { close(); D.signOut(); } })[b.dataset.tool]();
    else if (b.dataset.rt) { setRType(b.dataset.rt); recurPreview(); }
    else if (b.dataset.im) setIMode(b.dataset.im);
    else if ('skip' in b.dataset) { iskip = !iskip; b.setAttribute('aria-pressed', iskip); importPreview(); }
    else if (b.id === 'rGo') runRecur(); else if (b.id === 'bGo') runBulk(); else if (b.id === 'iGo') runImport();
  });
  $('#modalScrim').addEventListener('click', close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) close(); });
  $('#modal').addEventListener('input', e => { const k = e.target.id[0]; if (k === 'r') recurPreview(); else if (k === 'b') bulkPreview(); else if (k === 'i') importPreview(); });
  $('#modal').addEventListener('change', e => { if (e.target.id === 'rItem') recurAutofill(); });
}
