# v53 - Weekly Upload Rework + Team Assignment + Quiz Analytics Shortcut

Follow-up to v52. Four things:

1. **Weekly Quality Score upload** now takes the same two files as the monthly upload (Module + Freeze Frame) with a `type` selector.
2. **Weekly Quality Score view** gets a multi-module + score-range filter (ALL selected modules must fall in [min, max]).
3. **Quiz Analytics shortcut** added under Administration group.
4. **Quiz + Report assignment picker** unified: All / Teams (multi) / Individuals (multi), combinable.

tsc noEmit clean.

## Deploy order

### 1) Run SQL

```
sql/01_weekly_add_base_squad.sql
```

Adds two columns (`base`, `squad`) to `weekly_quality_scores`. Safe to run
multiple times.

### 2) Push these files

```
app/api/weekly-quality-upload/route.ts             # accepts type=module | freeze_frame
app/(app)/weekly-quality-upload/page.tsx           # type selector like monthly
app/(app)/weekly-quality-score/page.tsx            # new column set in the query
app/(app)/upload/page.tsx                          # loads collectors.team too
components/WeeklyQualityScoreView.tsx              # 8 module columns + multi-module range filter
components/AssignmentPicker.tsx                    # NEW - reusable picker
components/QuizBuilder.tsx                         # uses AssignmentPicker
components/UploadForm.tsx                          # uses AssignmentPicker (new-session mode)
components/Sidebar.tsx                             # Administration -> Quiz Analytics
```

## Feature notes

### 1) Weekly Quality Score upload

`/weekly-quality-upload` mirrors the monthly page: pick **File type** (`Collector Module Score` or `Freeze Frame Score`), pick the week (any date -> snaps to Sunday), pick the file, upload.

- **Module** file: same tall format as monthly - columns `hr_code, module, collector_score`. Modules recognized: `base, players, formation_tactical, location, impact, extras, squad`. Alias `event -> base` and `formation -> formation_tactical` are handled.
- **Freeze Frame** file: same as monthly - `collector_hr_code, Avg. ff_score`.

The API upserts by `(hr_code, week_start_date)` and does NOT wipe columns from prior uploads for the same week. So you can upload Module first and Freeze Frame second (or vice versa) and both column sets survive.

### 2) Weekly Quality Score view

Table columns (in order): HR Code, Name, Team, Week, Base, Players, Formation / Tactical, Location, Impact, Extras, Squad, Freeze Frame.

Filter bar adds:
- **Min score %** + **Max score %** inputs.
- Module chips (multi-select) - pick which modules the score range applies to.
- Filter logic: a row shows only if EVERY selected module has a value in [min, max]. Missing values (nulls) exclude the row.
- Leave modules unset OR leave min+max blank to skip the score filter.

### 3) Quiz Analytics shortcut

`Administration -> Quiz Analytics` in the Admin sidebar (in addition to `Upload Data -> Quizzes` where builder + list live).

### 4) Assignment picker (Quiz + Report)

New reusable `AssignmentPicker` component. UI:
- **All collectors** checkbox at the top.
- **Teams** pills (multi-select) - each team adds its members.
- **Individual collectors** list with search - additive.

The final `assigned` set = union of the three sources. Wired into:
- `QuizBuilder` (used on `/admin-quizzes/new` and `/admin-quizzes/[id]`).
- `UploadForm` new-session mode (`/upload`). Submit iterates over the set and posts one report per collector.

Existing-session mode on `/upload` keeps the single-collector Combobox (a session belongs to one collector).

## Verify

- [ ] Run SQL, confirm `base` + `squad` columns exist on `weekly_quality_scores`.
- [ ] `/weekly-quality-upload`:
  - Upload `Collector Module Score.csv` as type=module for a Sunday.
  - Upload `Freeze Frame Score.csv` as type=freeze_frame for the same Sunday.
  - `/weekly-quality-score` shows one row per collector with all 8 module columns filled.
- [ ] `/weekly-quality-score`: pick Base + Players, enter Min 80 / Max 95 -> only rows with BOTH modules in that range remain.
- [ ] `/admin-quizzes/new`:
  - Toggle **All collectors** -> counter shows total.
  - Untoggle; click two team pills -> members auto-included.
  - Add a single hand-picked collector on top -> included too.
- [ ] `/upload`:
  - New-session mode uses the same picker.
  - Submitting posts once per assigned collector, progress counter visible.
- [ ] Admin sidebar has **Administration -> Quiz Analytics** link that opens `/admin-quizzes`.
