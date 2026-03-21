-- Run in Supabase SQL Editor (production + local if needed).
-- Ayurveda analysis entitlements after Razorpay payment + tier on reports for display.

-- 1) Credits: one row = one Generate click (used_at set after successful generation)
CREATE TABLE IF NOT EXISTS public.analysis_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('basic', 'full')),
  razorpay_order_id TEXT NOT NULL,
  razorpay_payment_id TEXT NOT NULL UNIQUE,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analysis_entitlements_user_unused
  ON public.analysis_entitlements (user_id, tier)
  WHERE used_at IS NULL;

ALTER TABLE public.analysis_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users select own entitlements" ON public.analysis_entitlements;
CREATE POLICY "Users select own entitlements"
  ON public.analysis_entitlements FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own unused entitlements" ON public.analysis_entitlements;
CREATE POLICY "Users update own unused entitlements"
  ON public.analysis_entitlements FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND used_at IS NULL)
  WITH CHECK (auth.uid() = user_id);

-- Inserts only via Edge Function (service role), not from client

COMMENT ON TABLE public.analysis_entitlements IS 'Razorpay-confirmed credits for Ayurveda Generate; used_at set when generation succeeds.';

-- 2) How to render the report table (basic = remedies only)
ALTER TABLE public.health_reports
  ADD COLUMN IF NOT EXISTS ayurveda_tier TEXT CHECK (ayurveda_tier IS NULL OR ayurveda_tier IN ('basic', 'full'));

COMMENT ON COLUMN public.health_reports.ayurveda_tier IS 'Set when user runs Generate: basic = remedies only UI; full = remedies + dietary + lifestyle.';
