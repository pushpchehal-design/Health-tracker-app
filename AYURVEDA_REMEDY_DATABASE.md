# Ayurvedic remedy database (no AI)

Store Ayurvedic remedies for **blood report parameters** (e.g. low hemoglobin, low WBC, high creatinine) so the app can **show them to the user without invoking AI**. Lookup is deterministic and accurate.

---

## Where it is stored

- **Supabase table:** `public.ayurveda_remedy_lookup`
- **Columns:** `marker_name`, `condition` (low | high), `remedy_text`, optional `dosage_notes`, `precautions`, `source`
- **One row per (marker, condition):** e.g. Hemoglobin + low, Hemoglobin + high, WBC + low, WBC + high, etc.

Run **`supabase-ayurveda-remedy-lookup.sql`** in the Supabase SQL Editor once to create the table. Then load your data (see format below).

---

## Format to give us (so we can store it)

Use **one** of these. Both are easy to parse and load into the table.

### Option 1: CSV (recommended)

**Header row (exact):**

```text
marker_name,condition,remedy_text,dosage_notes,precautions,source
```

**Rules:**

- **marker_name** — Use the **exact canonical name** from the list below (e.g. `Hemoglobin`, `WBC`, `Creatinine`). The app matches report parameters to these names (and their aliases) so spelling must match.
- **condition** — Only `low` or `high`.
- **remedy_text** — Full text shown to the user (no length limit; keep concise for readability).
- **dosage_notes**, **precautions**, **source** — Optional; can be empty.

**Example rows:**

```csv
marker_name,condition,remedy_text,dosage_notes,precautions,source
Hemoglobin,low,"Pomegranate, dates, beetroot, spinach; iron-rich diet. Punarnava and Lauha bhasma under guidance.","Take with vitamin C for absorption.",Consult practitioner if on other meds,Classical texts
WBC,low,"Giloy, Ashwagandha; immune-supporting diet. Lauha and Chyawanprash under guidance.",,, 
WBC,high,"Cooling diet; avoid excess pungent. Neem, Guduchi under guidance.",,,
Creatinine,high,"Reduce protein load; avoid excess salt. Gokshura, Punarnava under guidance.",,Kidney cases: medical supervision,
```

Save as e.g. `ayurveda_remedies.csv`. We can load it via a small script or SQL (see “How to load” below).

### Option 2: JSON

Same logic; array of objects:

```json
[
  { "marker_name": "Hemoglobin", "condition": "low", "remedy_text": "Pomegranate, dates...", "dosage_notes": "", "precautions": "", "source": "" },
  { "marker_name": "WBC", "condition": "low", "remedy_text": "Giloy, Ashwagandha...", "dosage_notes": "", "precautions": "", "source": "" }
]
```

---

## Valid `marker_name` values (canonical names)

Use **exactly** these strings in your CSV/JSON so the app can match report parameters. These come from `blood_marker_reference` (report names like "Hb" or "Hgb" are mapped to "Hemoglobin" internally).

**Blood / CBC:** Hemoglobin, Hematocrit, RBC, WBC, Platelet Count, MCV, MCH, MCHC, RDW, ESR, MPV, PDW  

**Metabolic / Electrolytes:** Glucose (Fasting), Sodium, Potassium, Chloride, Carbon Dioxide, Calcium, Magnesium, Phosphorus  

**Kidney:** Creatinine, BUN, Urea, eGFR, Uric Acid, BUN/Creatinine Ratio  

**Liver:** ALT, AST, Alkaline Phosphatase, Bilirubin (Total), Bilirubin (Direct), Albumin, Total Protein, Globulin, A:G ratio, Bilirubin (Indirect), GGT  

**Lipids:** Total Cholesterol, LDL Cholesterol, HDL Cholesterol, Triglycerides, VLDL Cholesterol, Non HDL Cholesterol, Total Cholesterol/HDL Ratio, LDL/HDL Ratio, Apolipoprotein A1, Apolipoprotein B, Apo B/Apo A1 Ratio  

**Diabetes:** HbA1c, Estimated Average Glucose, Fasting Insulin  

**Thyroid:** TSH, Free T4, Free T3, Total T4, Total T3  

**Cardiac / Inflammation:** CRP, LDH, Troponin I, Troponin T, BNP, NT-proBNP  

**Iron:** Serum Iron, Ferritin, TIBC, UIBC, Transferrin Saturation  

**Vitamins / Minerals:** Vitamin D, Vitamin B12, Folate  

**Urine:** Urine Protein, Urine Glucose, Urine Creatinine, Urine Specific Gravity, Urine pH  

**Tumor markers:** PSA, CEA, AFP, CA 125, CA 19-9  

---

## How the app uses it (no AI)

1. After a report is analysed, the app has **parameters** with **name**, **value**, **normal_range**, **status** (normal / abnormal).
2. For each **abnormal** parameter it derives **low** or **high** from value vs reference range.
3. It resolves the report **name** (e.g. "Hb") to the **canonical** `marker_name` (e.g. "Hemoglobin") using `blood_marker_reference`.
4. It looks up `ayurveda_remedy_lookup` for `(marker_name, condition)`.
5. If a row exists, it shows **remedy_text** (and optionally dosage_notes, precautions) to the user — **no AI call**.

So: **your content is shown as-is; accuracy is exactly what you put in the table.**

---

## How to load your data

**1. Create the table (one time)**  
Run **`supabase-ayurveda-remedy-lookup.sql`** in Supabase → SQL Editor.

**2. Load from CSV (recommended)**  
Save your data as `ayurveda_remedies.csv` in the project root (or pass the path). Then run:

```bash
node scripts/load-ayurveda-remedies.js [path/to/ayurveda_remedies.csv]
```

Your `.env` must have `VITE_SUPABASE_URL` and either `SUPABASE_SERVICE_ROLE_KEY` or `VITE_SUPABASE_ANON_KEY`. The script **upserts** by (marker_name, condition), so you can re-run it when you add or update rows.

**3. Or add rows manually**  
Supabase Dashboard → Table Editor → `ayurveda_remedy_lookup` → Insert rows (or import CSV if your project supports it).

Once the table exists and is populated, the app shows **"Ayurvedic remedy (from database):"** under each abnormal parameter that has a matching row — no AI is used.
