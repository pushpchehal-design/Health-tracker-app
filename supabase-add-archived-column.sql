-- Add archived column to health_reports so users can hide completed reports from the main list.
-- Run once in Supabase SQL Editor.

ALTER TABLE health_reports
  ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false;

COMMENT ON COLUMN health_reports.archived IS 'When true, report is hidden from main list (user chose to archive after viewing).';
