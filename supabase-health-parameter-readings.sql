-- Health Parameter Readings: Store individual parameters for historical comparison
-- Run this in Supabase SQL Editor AFTER supabase-health-reports-setup.sql
-- Enables tracking parameters over time per user and per family member
--
-- SETUP: Supabase Dashboard → SQL Editor → New query → Paste this file → Run

-- Table: one row per parameter per report (for comparison over time)
CREATE TABLE IF NOT EXISTS health_parameter_readings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  family_member_id UUID REFERENCES family_members(id) ON DELETE CASCADE,
  report_id UUID REFERENCES health_reports(id) ON DELETE CASCADE NOT NULL,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
  category TEXT NOT NULL,
  parameter_name TEXT NOT NULL,
  parameter_value TEXT NOT NULL,
  normal_range TEXT,
  status TEXT CHECK (status IN ('normal', 'abnormal')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Indexes for fast lookups: by user, by family member, by report, by parameter over time
CREATE INDEX IF NOT EXISTS idx_health_parameter_readings_user_id ON health_parameter_readings(user_id);
CREATE INDEX IF NOT EXISTS idx_health_parameter_readings_family_member_id ON health_parameter_readings(family_member_id);
CREATE INDEX IF NOT EXISTS idx_health_parameter_readings_report_id ON health_parameter_readings(report_id);
CREATE INDEX IF NOT EXISTS idx_health_parameter_readings_recorded_at ON health_parameter_readings(recorded_at);
CREATE INDEX IF NOT EXISTS idx_health_parameter_readings_user_recorded ON health_parameter_readings(user_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_parameter_readings_member_param ON health_parameter_readings(family_member_id, parameter_name, recorded_at DESC);

-- Row Level Security: users see only their own account's data (their + their family members' readings)
ALTER TABLE health_parameter_readings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own parameter readings" ON health_parameter_readings;
CREATE POLICY "Users can view own parameter readings"
  ON health_parameter_readings FOR SELECT
  USING (auth.uid() = user_id);

-- Insert/Update/Delete only via service role (Edge Function) or ensure user can insert for own reports
-- Edge Function uses service role, so no user INSERT policy needed for app inserts.
-- If you ever allow client inserts, add: WITH CHECK (auth.uid() = user_id)

COMMENT ON TABLE health_parameter_readings IS 'Stores each health parameter from reports for historical comparison. recorded_at = date of the report/analysis.';
