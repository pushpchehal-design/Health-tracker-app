-- Run in Supabase SQL Editor. Tracks that a paid/coupon credit was used for lab extraction on this report
-- so "Generate Ayurveda" does not require a second credit.

ALTER TABLE public.health_reports
  ADD COLUMN IF NOT EXISTS lab_analysis_credit_consumed BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.health_reports.lab_analysis_credit_consumed IS
  'Set true when lab analysis (or paid manual entry) consumes one analysis_entitlements row; allows Generate Ayurveda without a second credit.';

-- Optional: existing completed reports keep working with Generate (one-time migration).
UPDATE public.health_reports
SET lab_analysis_credit_consumed = true
WHERE analysis_status = 'completed'
  AND lab_analysis_credit_consumed = false;
