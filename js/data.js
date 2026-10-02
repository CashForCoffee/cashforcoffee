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
