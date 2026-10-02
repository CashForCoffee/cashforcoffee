// Everything you may need to change lives here.
export const CONFIG = {
  supabaseUrl: 'https://iadncppgdpdiucrhdbxw.supabase.co',
  // Paste the anon / publishable key. Never the service-role key.
  supabaseAnonKey: 'PASTE_ANON_KEY_HERE',
  table: 'budget_items',
  budgetName: 'Cash for Coffee',
  anchorDate: '2026-09-24', // first day of a pay fortnight
  people: [{ name: 'Person one' }, { name: 'Person two' }], // replace with real names
  warnBelow: 150, // balance under this (and above zero) shows the warning colour
  balanceTolerance: 1 // dollars either side of zero that still count as a nil balance
};
