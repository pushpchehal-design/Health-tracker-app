# SQL Files Analysis – Project vs Supabase

## Why “doesn’t exist” appears

**`supabase-blood-markers-aliases-report-formats.sql`** only inserts/updates into the table **`blood_marker_reference`**. It does **not** create that table.

- If you run **only** the aliases file in Supabase, you get: **relation "blood_marker_reference" does not exist**.
- **Fix:** Run **`supabase-blood-markers-reference.sql`** first (it creates the table and seed data), **then** run the aliases file.  
  **Or** run the single combined file **`supabase-blood-markers-full-setup.sql`** once – it does both.

---

## SQL files in this project (11 total)

| # | File | Purpose | Run order |
|---|------|--------|-----------|
| 1 | **supabase-blood-markers-reference.sql** | Creates `blood_marker_reference` table + seed rows | Run **first** (or use full-setup) |
| 2 | **supabase-blood-markers-aliases-report-formats.sql** | Adds extra markers + PDF-style aliases | Run **after** reference (or use full-setup) |
| 3 | **supabase-blood-markers-full-setup.sql** | Reference + aliases in one file | **One-shot** – use this to avoid “table doesn’t exist” |
| 4 | **supabase-health-reports-setup.sql** | Creates `health_reports` + `health_analysis` + RLS | Core app – run once |
| 5 | **fix-health-reports-table.sql** | DROP + recreate `health_reports` / `health_analysis` | **Only if** tables are broken; **wipes data** |
| 6 | **add-file-path-column.sql** | Adds `file_path` to `health_reports` | Run once after reports setup |
| 7 | **add-missing-column-only.sql** | Adds `analysis_status` / `analyzed_at` if missing | Run once if you kept existing data |
| 8 | **supabase-report-date-and-manual.sql** | Adds `report_date`, manual entry, policies | Run once after reports + parameter readings |
| 9 | **supabase-health-parameter-readings.sql** | Creates `health_parameter_readings` | After health-reports-setup |
| 10 | **supabase-profile-family-history-allergies.sql** | Adds `family_history` / `allergies` to profiles | After `user_profiles` / `family_members` exist |
| 11 | **supabase-storage-policies.sql** | Storage bucket policies for report uploads | After creating `health-reports` bucket |

---

## Why Supabase shows 15 and feels “duplicate”

- **In Cursor** you see the **project’s** SQL files (e.g. 7–10 depending on what’s open).
- **In Supabase** you see **every query you’ve ever saved** in the SQL Editor (e.g. 15). Those can be:
  - The same script saved under different names (e.g. “blood markers”, “blood markers v2”).
  - Old versions of the same setup.
  - One-off fixes you ran and saved.

So the “15 in Supabase” are **saved queries in the dashboard**, not the 10 files in the repo. Some of the 15 will be duplicates or old versions.

---

## Recommended: one-time setup order (Supabase SQL Editor)

Use **one** of these two options for blood markers:

**Option A – Two files (clear separation)**  
1. Run **`supabase-blood-markers-reference.sql`** (creates table + seed).  
2. Run **`supabase-blood-markers-aliases-report-formats.sql`** (adds CBC/aliases).

**Option B – One file (no “doesn’t exist”)**  
1. Run **`supabase-blood-markers-full-setup.sql`** once (reference + aliases combined).

Then for the rest of the app (only what you haven’t run yet):

- **supabase-health-reports-setup.sql** → **supabase-health-parameter-readings.sql** → **add-file-path-column.sql** → **supabase-report-date-and-manual.sql**
- **supabase-profile-family-history-allergies.sql** (if you have profiles/family members)
- **supabase-storage-policies.sql** (after creating the storage bucket)

---

## Cleaning up duplicates in Supabase

- In **Supabase → SQL Editor**, review your saved queries.
- Delete or rename duplicates (e.g. keep one “Blood markers full setup”, remove “blood markers old”).
- You only need **one** saved query per logical script; the 10 project files are the source of truth.
