-- Migration: 010_fix_client_profiles_access
-- Ajusta grants/RLS e força recarga do schema do PostgREST para client_profiles

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE public.client_profiles TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.client_profiles TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_profiles'
      AND policyname = 'client_profiles_authenticated_insert_self'
  ) THEN
    CREATE POLICY client_profiles_authenticated_insert_self
      ON public.client_profiles
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_profiles'
      AND policyname = 'client_profiles_authenticated_update_self'
  ) THEN
    CREATE POLICY client_profiles_authenticated_update_self
      ON public.client_profiles
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
