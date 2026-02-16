-- Supabase Storage Bucket Policies for Health Reports
-- Run this in Supabase SQL Editor AFTER creating the 'health-reports' bucket in Storage

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can upload own reports" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own reports" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own reports" ON storage.objects;

-- Allow users to upload their own files
CREATE POLICY "Users can upload own reports"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'health-reports' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to read their own files
CREATE POLICY "Users can read own reports"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'health-reports' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own files
CREATE POLICY "Users can delete own reports"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'health-reports' AND
  (storage.foldername(name))[1] = auth.uid()::text
);
