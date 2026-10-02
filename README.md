# Cash for Coffee

Static site (HTML, Tailwind via CDN, ES modules). No build step. Talks straight to Supabase from the browser.

## Setup
1. Open `js/config.js`. Paste the anon key. Replace the two placeholder names.
2. Commit everything to the GitHub Pages repo. Do not commit the budget CSV: Pages sites are public, and the data should only ever come from Supabase after sign-in.
3. To try it locally first: `python3 -m http.server 8000` in this folder, then open http://localhost:8000. Add `http://localhost:8000` to Supabase Auth, URL Configuration, if sign-in complains.

## Supabase checks
- Row Level Security needs policies letting signed-in users select, insert, update and delete on `budget_items`, for example `using (auth.role() = 'authenticated')` for each command.
- The app detects `Date/Item/...` versus `date/item/...` columns and `Yes/No` versus `true/false` for Paid. It expects a column called `id`, with a default value so inserts generate one.

## How the numbers work
- Fortnights are 14 day blocks counted from `anchorDate`. No opening balance.
- Per fortnight: money in minus money out. Within one day, income counts before spending.
- Status: Fully assigned (within `balanceTolerance` of zero), To assign (money left), Short (ends negative), Runs out (dips below zero part way, then recovers).
- Each fortnight is judged on its own. Leftover money is assumed to be assigned by adding an item, as you do now.

## Files
- `js/config.js` settings. `js/calc.js` maths and formatting. `js/data.js` Supabase. `js/app.js` screens. `css/style.css` colour tokens and small components.
