-- Report date + manual entry support
-- Run in Supabase SQL Editor. Allows: (1) report date for every report, (2) manual reports without file.

-- 1) Add report_date (date of test) to health_reports; make file fields nullable for manual entries
ALTER TABLE health_reports
  ADD COLUMN IF NOT EXISTS report_date DATE;

ALTER TABLE health_reports
  ALTER COLUMN file_url DROP NOT NULL,
  ALTER COLUMN file_type DROP NOT NULL;

COMMENT ON COLUMN health_reports.report_date IS 'Date of the test/report (user-selected). Used for comparison over time.';

-- 2) Allow app to insert health_parameter_readings (for manual entry)
DROP POLICY IF EXISTS "Users can insert own parameter readings" ON health_parameter_readings;
CREATE POLICY "Users can insert own parameter readings"
  ON health_parameter_readings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 3) Allow app to update health_reports (e.g. set analysis_status after manual entry)
-- (If not already present, allow update for own reports)
DROP POLICY IF EXISTS "Users can update own reports" ON health_reports;
CREATE POLICY "Users can update own reports"
  ON health_reports FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
