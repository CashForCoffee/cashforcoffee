# Cash for Coffee

Static site (HTML, Tailwind via CDN, ES modules). No build step. Talks straight to Supabase from the browser.

## Setup
1. Open `js/config.js`. The anon key is already in. Replace the two placeholder names.
2. Commit everything to the GitHub Pages repo. Do not commit the budget CSV: Pages sites are public, and the data should only ever come from Supabase after sign-in.
3. To try it locally first: `python3 -m http.server 8000` in this folder, then open http://localhost:8000. Add `http://localhost:8000` to Supabase Auth, URL Configuration, if sign-in complains.

## Supabase checks
- Row Level Security needs policies letting signed-in users select, insert, update and delete on `budget_items`, for example `using (auth.role() = 'authenticated')` for each command.
- The app detects `Date/Item/...` versus `date/item/...` columns and `Yes/No` versus `true/false` for Paid. It expects a column called `id`, with a default value so inserts generate one.

## How the numbers work
- Fortnights are 14 day blocks counted from `anchorDate`. No opening balance.
- Per fortnight: money in minus money out. Within one day, income counts before spending.
- Balance is money in minus money out for the pay. Colours: green when within `balanceTolerance` of zero, saffron for a comfortable balance, orange under `warnBelow`, red when short (ends negative) or runs out part way.
- Each fortnight is judged on its own. Leftover money is assumed to be allocated by adding an item, as you do now.

## Files
- `js/config.js` settings. `js/calc.js` maths and formatting. `js/data.js` Supabase. `js/app.js` screens. `css/style.css` colour tokens and small components.

## Tools menu
- Add a recurring payment: creates one separate row per date (weekly, fortnightly or monthly, until a date). Rows are not linked.
- Update an amount going forward: matches the item name from a date onward and skips paid rows.
- Update a date going forward: matches the item name from a date onward and skips paid rows. Set the new date for the first match and the rest move by the same number of days. Rows a month apart keep a day of the month instead (shorter months use their last day).
- Amounts of 0 are allowed everywhere (add, edit, recurring, update an amount, import), for items like Splurge with nothing allocated.
- Import from Excel: paste tab separated rows. "Add to budget" can skip rows that already exist. "Start fresh" downloads a backup CSV, adds the new rows, then removes the old ones, and asks for the anchor date.
- Export to CSV: downloads every item with the same seven columns.

## Extra Supabase checks for the tools
- Blank notes are saved as empty text, not null, so a notes column set to NOT NULL works.
- `budget_items` needs insert, update and delete policies for signed-in users. Updates and deletes that a policy blocks are reported as errors.
- The anchor date is read from and saved to `budget_settings` (one row with an anchor column, or key/value rows). Signed-in users need select, insert and update policies there. If the table cannot be read, the app falls back to `anchorDate` in `js/config.js`.
