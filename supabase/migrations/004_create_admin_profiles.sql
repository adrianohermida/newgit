-- Migration: 004_create_admin_profiles
-- Cria perfis internos para o dashboard com RLS basica

CREATE TABLE IF NOT EXISTS public.admin_profiles (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT        NOT NULL UNIQUE,
  full_name   TEXT,
  role        TEXT        NOT NULL DEFAULT 'viewer'
                          CHECK (role IN ('admin', 'editor', 'viewer')),
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_profiles_email
  ON public.admin_profiles (email);

CREATE INDEX IF NOT EXISTS idx_admin_profiles_role
  ON public.admin_profiles (role);

ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_profiles'
      AND policyname = 'admin_profiles_service_role_all'
  ) THEN
    CREATE POLICY admin_profiles_service_role_all
      ON public.admin_profiles
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_profiles'
      AND policyname = 'admin_profiles_authenticated_select_self'
  ) THEN
    CREATE POLICY admin_profiles_authenticated_select_self
      ON public.admin_profiles
      FOR SELECT
      TO authenticated
      USING (auth.uid() = id);
  END IF;
END
$$;
