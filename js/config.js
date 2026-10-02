// Everything you may need to change lives here.
export const CONFIG = {
  supabaseUrl: 'https://iadncppgdpdiucrhdbxw.supabase.co',
  // Paste the anon / publishable key. Never the service-role key.
  supabaseAnonKey: 'sb_publishable_Yc5UXSbMl1L_rdY6LWd81A_K36QaZ62',
  table: 'budget_items',
  budgetName: 'Cash for Coffee',
  anchorDate: '2026-09-24', // first day of a pay fortnight
  people: [{ name: 'Mitch' }, { name: 'Beth' }], // replace with real names
  warnBelow: 150, // amount to assign under this (and above zero) shows the warning colour
  balanceTolerance: 1 // dollars either side of zero that still count as "fully assigned"
};
