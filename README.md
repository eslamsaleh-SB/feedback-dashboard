# v34 — Match Total per Module: server-side filtering

## What this fixes
- **Errors (total) / Match Total filter now covers the entire dataset**, not just
  the rows currently shown in the table. Ranking and filtering happen in the
  database, then the top 250 matches are returned.
- **When a module is selected**, the Errors filter and the ranking are based on
  **that module's totals only** (e.g. pick "Players" + `≥ 50` → matches whose
  Players total across all parts is ≥ 50, ranked by Players).

## How it works
The browser used to load a capped slice of rows and filter them locally, so
anything outside that slice was invisible to the filter. The new SQL function
`match_module_breakdown_v2` computes each match's total over the whole
`module_totals` table, applies the threshold at the match level, ranks, and
returns every part row for the top 250 matches.

## Deploy steps (3 files)

### 1. Run the SQL (Supabase → SQL Editor)
Run `01_match_module_breakdown_v2.sql`. It's `create or replace` and safe to
re-run. It does **not** drop the old function, so the live site keeps working
until you upload the two files below.

### 2. Upload `page.tsx`
Destination (replace existing):
`app/(app)/match-totals/page.tsx`

### 3. Upload `MatchTotals.tsx`
Destination (replace existing):
`components/MatchTotals.tsx`

Order doesn't matter much, but running the SQL first avoids a brief window where
the new page calls a function that doesn't exist yet. After both files are
committed, Vercel auto-deploys.

## Quick test after deploy
1. Open **Match Total per Module** with no filters → matches ranked by total errors.
2. Set **Errors (total) ≥ 200** → only matches whose grand total ≥ 200, drawn
   from the whole dataset (not just the first page).
3. Select **Module = Players**, then **≥ 50** → ranked/filtered by Players only;
   the label reads "Errors (Players) — match total".
4. Set **≤ 5** → low-error matches appear (these were previously impossible to
   reach because they were never in the loaded slice).

## Notes
- Type-checked clean against the project's `tsconfig.json`.
- No other pages reference `match_module_breakdown_v2`, so nothing else changes.
- The error filter is now part of the URL (`?errop=gte&errval=200`), so filtered
  views are shareable/bookmarkable.
