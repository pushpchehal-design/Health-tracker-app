-- Profile & Family Members: Family History + Allergies
-- Run in Supabase SQL Editor after user_profiles and family_members exist.
-- These columns are used for AI-driven health analysis later.

-- 1) user_profiles: add family_history and allergies
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS family_history TEXT,
  ADD COLUMN IF NOT EXISTS allergies TEXT[];

COMMENT ON COLUMN user_profiles.family_history IS 'Dedicated family medical history (e.g. heart disease in parents).';
COMMENT ON COLUMN user_profiles.allergies IS 'Known allergies: food, drugs, environmental.';

-- 2) family_members: add family_history and allergies
ALTER TABLE family_members
  ADD COLUMN IF NOT EXISTS family_history TEXT,
  ADD COLUMN IF NOT EXISTS allergies TEXT[];

COMMENT ON COLUMN family_members.family_history IS 'Family medical history for this member.';
COMMENT ON COLUMN family_members.allergies IS 'Known allergies for this member.';
