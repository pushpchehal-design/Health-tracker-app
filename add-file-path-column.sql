-- Add file_path column to health_reports table
-- Run this in Supabase SQL Editor

ALTER TABLE health_reports 
ADD COLUMN IF NOT EXISTS file_path TEXT;
