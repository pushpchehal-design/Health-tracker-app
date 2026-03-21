-- Ayurvedic remedies lookup by blood parameter + condition (low/high).
-- The app reads from this table and shows remedies to the user WITHOUT invoking AI.
-- Populate via CSV/script; see AYURVEDA_REMEDY_DATABASE.md for format and marker list.

CREATE TABLE IF NOT EXISTS public.ayurveda_remedy_lookup (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT,
  marker_name TEXT NOT NULL,
  condition TEXT NOT NULL CHECK (condition IN ('low', 'high')),
  remedy_text TEXT NOT NULL,
  lifestyle_modification TEXT,
  dosage_notes TEXT,
  precautions TEXT,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(marker_name, condition)
);

-- If table already exists, add new columns:
ALTER TABLE public.ayurveda_remedy_lookup ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.ayurveda_remedy_lookup ADD COLUMN IF NOT EXISTS lifestyle_modification TEXT;
ALTER TABLE public.ayurveda_remedy_lookup ADD COLUMN IF NOT EXISTS dietary_recommendations TEXT;

CREATE INDEX IF NOT EXISTS idx_ayurveda_remedy_lookup_marker_condition
  ON public.ayurveda_remedy_lookup (LOWER(TRIM(marker_name)), condition);

COMMENT ON TABLE public.ayurveda_remedy_lookup IS 'Ayurvedic remedies for blood report parameters. App looks up by marker_name + condition (low/high) and displays without AI.';

ALTER TABLE public.ayurveda_remedy_lookup ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read for authenticated" ON public.ayurveda_remedy_lookup;
CREATE POLICY "Allow read for authenticated"
  ON public.ayurveda_remedy_lookup FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow read for anon" ON public.ayurveda_remedy_lookup;
CREATE POLICY "Allow read for anon"
  ON public.ayurveda_remedy_lookup FOR SELECT TO anon USING (true);

-- Allow load script (anon or service_role) to insert/update. Use SUPABASE_SERVICE_ROLE_KEY in .env to bypass RLS instead.
DROP POLICY IF EXISTS "Allow insert for load script" ON public.ayurveda_remedy_lookup;
CREATE POLICY "Allow insert for load script"
  ON public.ayurveda_remedy_lookup FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS "Allow update for load script" ON public.ayurveda_remedy_lookup;
CREATE POLICY "Allow update for load script"
  ON public.ayurveda_remedy_lookup FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Add report-format aliases for remedy lookup mapping.
UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY['Hemoglobin (HB)', 'Hemoglobin (HB), EDTA Blood'])
  WHERE name = 'Hemoglobin' AND NOT (COALESCE(aliases, '{}') @> ARRAY['Hemoglobin (HB)']);
UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY['Total WBC', 'WBC -Total Leucocytes Count'])
  WHERE name = 'WBC' AND NOT (COALESCE(aliases, '{}') @> ARRAY['Total WBC']);
UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY['Cholesterol HDL Ratio', 'Cholesterol/HDL Ratio'])
  WHERE name = 'Total Cholesterol/HDL Ratio' AND NOT (COALESCE(aliases, '{}') @> ARRAY['Cholesterol HDL Ratio']);
UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY['hs CRP', 'hs-CRP'])
  WHERE name = 'CRP' AND NOT (COALESCE(aliases, '{}') @> ARRAY['hs CRP']);
UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY['Blood Urea'])
  WHERE name = 'Urea' AND NOT (COALESCE(aliases, '{}') @> ARRAY['Blood Urea']);
UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY['SGPT ALT', 'SGPT'])
  WHERE name = 'ALT' AND NOT (COALESCE(aliases, '{}') @> ARRAY['SGPT ALT']);
UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY['SGOT AST', 'SGOT'])
  WHERE name = 'AST' AND NOT (COALESCE(aliases, '{}') @> ARRAY['SGOT AST']);

-- New markers for heart/lipid panel (run after blood_marker_reference base seed)
INSERT INTO blood_marker_reference (name, aliases, unit, normal_low, normal_high, category) VALUES
  ('Homocysteine', ARRAY['Hcy', 'Plasma Homocysteine'], 'µmol/L', 5, 15, 'Blood'),
  ('Lipoprotein(a)', ARRAY['Lp(a)', 'Lipoprotein a', 'Lp(a), Serum'], 'mg/dL', 0, 30, 'Blood'),
  ('Blood Pressure related sodium retention tendency', ARRAY['Sodium retention tendency'], 'unit', 0, 1, 'Heart')
ON CONFLICT (name) DO NOTHING;

-- Example row (semicolon format: category ; marker_name ; condition ; remedy_text ; lifestyle_modification):
-- Blood ; Hemoglobin (HB) ; Low ; Punarnava Mandur 250 mg... ; Sleep before 10:30 pm...
-- Loader maps "Hemoglobin (HB)" → "Hemoglobin" when blood_marker_reference has that alias.
