-- Alternative: Only add the missing column (if you have existing data you want to keep)
-- Run this in Supabase SQL Editor if you want to preserve existing data

-- Check if column exists, if not add it
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'health_reports' 
        AND column_name = 'analysis_status'
    ) THEN
        ALTER TABLE health_reports 
        ADD COLUMN analysis_status TEXT DEFAULT 'pending' 
        CHECK (analysis_status IN ('pending', 'processing', 'completed', 'failed'));
    END IF;
END $$;

-- Also ensure other columns exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'health_reports' 
        AND column_name = 'analyzed_at'
    ) THEN
        ALTER TABLE health_reports 
        ADD COLUMN analyzed_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;
