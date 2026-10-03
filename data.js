// Supabase access. Detects Date/Item/... versus date/item/... column naming
// and Yes/No text versus true/false for Paid, so it works with either table style.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { CONFIG } from './config.js';

export const configured = !CONFIG.supabaseAnonKey.startsWith('PASTE');
export const sb = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);

const LOWER = { id: 'id', date: 'date', item: 'item', amount: 'amount', type: 'type', category: 'category', paid: 'paid', notes: 'notes' };
const UPPER = { id: 'id', date: 'Date', item: 'Item', amount: 'Amount', type: 'Type', category: 'Category', paid: 'Paid', notes: 'Notes' };
let cols = LOWER, paidBool = false;
const T = CONFIG.table;

const isPaid = v => v === true || ['yes', 'true'].includes(String(v).toLowerCase());
const norm = r => ({
  id: r[cols.id], date: String(r[cols.date]).slice(0, 10), item: r[cols.item] || '',
  amount: Number(r[cols.amount]), type: r[cols.type], category: r[cols.category] || '',
  paid: isPaid(r[cols.paid]), notes: r[cols.notes] || ''
});
const paidValue = p => (paidBool ? p : p ? 'Yes' : 'No');
const payload = o => ({
  [cols.date]: o.date, [cols.item]: o.item, [cols.amount]: o.amount, [cols.type]: o.type,
  [cols.category]: o.category, [cols.paid]: paidValue(o.paid), [cols.notes]: o.notes || null
});

export const signIn = (email, password) => sb.auth.signInWithPassword({ email, password });
export const signOut = () => sb.auth.signOut();

export async function loadItems() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(T).select('*').range(from, from + 999);
    if (error) throw error;
    if (from === 0 && data.length) {
      cols = Object.keys(data[0]).includes('Date') ? UPPER : LOWER;
      paidBool = typeof data[0][cols.paid] === 'boolean';
    }
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out.map(norm);
}
export async function insertItem(o) {
  const { data, error } = await sb.from(T).insert(payload(o)).select().single();
  if (error) throw error; return norm(data);
}
export async function updateItem(id, o) {
  const { data, error } = await sb.from(T).update(payload(o)).eq(cols.id, id).select().single();
  if (error) throw error; return norm(data);
}
export async function setPaid(id, paid) {
  const { data, error } = await sb.from(T).update({ [cols.paid]: paidValue(paid) }).eq(cols.id, id).select().single();
  if (error) throw error; return norm(data);
}
export async function removeItem(id) {
  const { error } = await sb.from(T).delete().eq(cols.id, id);
  if (error) throw error;
}

// ---------- bulk operations ----------
const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

// Rows that were saved are pushed into `track` as each batch lands, so callers can undo a partial import.
export async function insertMany(objs, track = []) {
  for (const part of chunks(objs, 200)) {
    const { data, error } = await sb.from(T).insert(part.map(payload)).select();
    if (error) throw error;
    track.push(...data.map(norm));
  }
  return track;
}
export async function updateAmount(ids, amount) {
  const out = [];
  for (const part of chunks(ids, 100)) {
    const { data, error } = await sb.from(T).update({ [cols.amount]: amount }).in(cols.id, part).select();
    if (error) throw error;
    out.push(...data.map(norm));
  }
  if (out.length !== ids.length) throw new Error(`Only ${out.length} of ${ids.length} rows changed. Check the update policy in Row Level Security.`);
  return out;
}
export async function removeMany(ids) {
  for (const part of chunks(ids, 100)) {
    const { data, error } = await sb.from(T).delete().in(cols.id, part).select();
    if (error) throw error;
    if (data.length !== part.length) throw new Error('Some rows were not deleted. Check the delete policy in Row Level Security.');
  }
}

// ---------- budget_settings (anchor date) ----------
// Works with one row that has an anchor column, or key/value rows. Falls back to config.js if nothing is found.
const ST = 'budget_settings';
let st = null;
export async function loadSettings() {
  const { data, error } = await sb.from(ST).select('*').limit(50);
  st = { rows: error ? [] : data || [] };
  const first = st.rows[0]; if (!first) return {};
  const keys = Object.keys(first);
  const kcol = keys.find(k => /^(key|name|setting)$/i.test(k)), vcol = keys.find(k => /^value$/i.test(k));
  if (kcol && vcol) {
    st.kv = { kcol, vcol }; st.row = st.rows.find(x => /anchor/i.test(x[kcol]));
    return st.row ? { anchor: String(st.row[vcol]).slice(0, 10) } : {};
  }
  st.acol = keys.find(k => /anchor/i.test(k)); st.row = first; st.pk = keys[0];
  return st.acol && first[st.acol] ? { anchor: String(first[st.acol]).slice(0, 10) } : {};
}
export async function saveAnchor(date) {
  let q;
  if (st?.kv) {
    const { kcol, vcol } = st.kv;
    q = st.row ? sb.from(ST).update({ [vcol]: date }).eq(kcol, st.row[kcol]) : sb.from(ST).insert({ [kcol]: 'anchor_date', [vcol]: date });
  } else if (st?.acol && st.row) q = sb.from(ST).update({ [st.acol]: date }).not(st.pk, 'is', null);
  else q = sb.from(ST).insert({ anchor_date: date });
  const { data, error } = await q.select();
  if (error) throw error;
  if (!data.length) throw new Error('no row was saved, check the Row Level Security policy on budget_settings');
}
