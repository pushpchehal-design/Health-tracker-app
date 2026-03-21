-- Add dietary_recommendations to ayurveda_remedy_lookup for master CSV/semicolon load.
-- Run once in Supabase SQL Editor (or as part of your migrations).
ALTER TABLE public.ayurveda_remedy_lookup ADD COLUMN IF NOT EXISTS dietary_recommendations TEXT;
