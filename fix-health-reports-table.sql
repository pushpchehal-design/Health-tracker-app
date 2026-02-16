-- Fix health_reports table - Add missing column or recreate table
-- Run this in Supabase SQL Editor

-- First, check if table exists and drop it if needed (this will delete any existing data)
-- If you have important data, skip the DROP and use ALTER TABLE instead
DROP TABLE IF EXISTS health_analysis CASCADE;
DROP TABLE IF EXISTS health_reports CASCADE;

-- Create health_reports table with all columns
CREATE TABLE health_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  family_member_id UUID REFERENCES family_members(id) ON DELETE CASCADE,
  report_name TEXT NOT NULL,
  report_type TEXT,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  analyzed_at TIMESTAMP WITH TIME ZONE,
  analysis_status TEXT DEFAULT 'pending' CHECK (analysis_status IN ('pending', 'processing', 'completed', 'failed'))
);

-- Create health_analysis table
CREATE TABLE health_analysis (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID REFERENCES health_reports(id) ON DELETE CASCADE NOT NULL,
  category TEXT NOT NULL,
  findings JSONB,
  summary TEXT,
  recommendations TEXT,
  risk_level TEXT CHECK (risk_level IN ('Low', 'Moderate', 'High', 'Critical')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Enable Row Level Security
ALTER TABLE health_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_analysis ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own reports" ON health_reports;
DROP POLICY IF EXISTS "Users can insert own reports" ON health_reports;
DROP POLICY IF EXISTS "Users can delete own reports" ON health_reports;
DROP POLICY IF EXISTS "Users can view own analysis" ON health_analysis;

-- Create policies for health_reports
CREATE POLICY "Users can view own reports"
  ON health_reports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own reports"
  ON health_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own reports"
  ON health_reports FOR DELETE
  USING (auth.uid() = user_id);

-- Create policy for health_analysis
CREATE POLICY "Users can view own analysis"
  ON health_analysis FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM health_reports 
      WHERE health_reports.id = health_analysis.report_id 
      AND health_reports.user_id = auth.uid()
    )
  );
