-- Gratitude coupon: full report access for users who redeem the code (Edge Function + app read).
CREATE TABLE IF NOT EXISTS public.user_analysis_gratitude (
  user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_analysis_gratitude IS 'Set when user redeems Gratitude coupon; app treats all reports as fully unlocked.';

ALTER TABLE public.user_analysis_gratitude ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own gratitude access" ON public.user_analysis_gratitude;
CREATE POLICY "Users read own gratitude access"
  ON public.user_analysis_gratitude FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
