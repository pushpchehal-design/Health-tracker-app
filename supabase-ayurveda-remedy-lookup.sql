-- Ayurvedic remedies lookup by blood parameter + condition (low/high).
-- The app reads from this table and shows remedies to the user WITHOUT invoking AI.
-- Populate via CSV/script; see AYURVEDA_REMEDY_DATABASE.md for format and marker list.

CREATE TABLE IF NOT EXISTS public.ayurveda_remedy_lookup (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  marker_name TEXT NOT NULL,
  condition TEXT NOT NULL CHECK (condition IN ('low', 'high')),
  remedy_text TEXT NOT NULL,
  dosage_notes TEXT,
  precautions TEXT,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(marker_name, condition)
);

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

-- Example rows (replace with your own data or load from CSV):
-- INSERT INTO public.ayurveda_remedy_lookup (marker_name, condition, remedy_text, dosage_notes) VALUES
-- ('Hemoglobin', 'low', 'Pomegranate, dates, beetroot, spinach; iron-rich diet. Consider Punarnava and Lauha bhasma under guidance.', 'Take with vitamin C for absorption.'),
-- ('WBC', 'low', 'Giloy, Ashwagandha; immune-supporting diet. Consult for Lauha and Chyawanprash.', NULL),
-- ('WBC', 'high', 'Cooling diet; avoid excess pungent. Neem, Guduchi under guidance.', NULL);
