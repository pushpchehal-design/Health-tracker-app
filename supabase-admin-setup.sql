-- Admin account setup: one table + RLS policies so admins can see all users and all data.
-- Run this in Supabase SQL Editor. After running, add your first admin (see ADMIN_SETUP.md).

-- 1) Table: who is an admin (only these user_ids can access admin features and bypass RLS)
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Admins can only check "am I admin?" (read own row). No one can list all admins from the client.
CREATE POLICY "Users can read own admin row"
  ON public.admin_users FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE from client — add admins only via SQL Editor or service role:
--   INSERT INTO public.admin_users (user_id) VALUES ('your-auth-user-uuid');
-- Get your UUID from: Supabase Dashboard → Authentication → Users → copy user UID.

-- 2) Helper: returns true if current user is admin (usable in other policies)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid());
$$;

-- 3) user_profiles: allow admins to select all rows
DROP POLICY IF EXISTS "Admin can read all user_profiles" ON public.user_profiles;
CREATE POLICY "Admin can read all user_profiles" ON public.user_profiles FOR SELECT USING (public.is_admin());

-- 4) family_members: allow admins to select all
DROP POLICY IF EXISTS "Admin can read all family_members" ON public.family_members;
CREATE POLICY "Admin can read all family_members" ON public.family_members FOR SELECT USING (public.is_admin());

-- 5) health_reports: allow admins to select/delete all (e.g. support)
DROP POLICY IF EXISTS "Admin can read all health_reports" ON public.health_reports;
CREATE POLICY "Admin can read all health_reports" ON public.health_reports FOR SELECT USING (public.is_admin());

-- 6) health_analysis: allow admins to select all
DROP POLICY IF EXISTS "Admin can read all health_analysis" ON public.health_analysis;
CREATE POLICY "Admin can read all health_analysis" ON public.health_analysis FOR SELECT
  USING (public.is_admin());

-- 7) health_parameter_readings: allow admins to select all (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'health_parameter_readings') THEN
    DROP POLICY IF EXISTS "Admin can read all health_parameter_readings" ON public.health_parameter_readings;
    CREATE POLICY "Admin can read all health_parameter_readings" ON public.health_parameter_readings FOR SELECT USING (public.is_admin());
  END IF;
END $$;

-- 8) storage: allow admins to read/delete any file in health-reports bucket
DROP POLICY IF EXISTS "Admin can read all reports storage" ON storage.objects;
CREATE POLICY "Admin can read all reports storage"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'health-reports' AND public.is_admin()
  );

DROP POLICY IF EXISTS "Admin can delete all reports storage" ON storage.objects;
CREATE POLICY "Admin can delete all reports storage"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'health-reports' AND public.is_admin()
  );
