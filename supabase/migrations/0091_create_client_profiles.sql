-- Migration: 009_create_client_profiles
-- Perfis do portal do cliente autenticado via Supabase Auth

CREATE TABLE IF NOT EXISTS public.client_profiles (
  id          UUID        PRIMARY KEY,
  email       TEXT        NOT NULL UNIQUE,
  full_name   TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  whatsapp    TEXT,
  cpf         TEXT,
  metadata    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_profiles_email
  ON public.client_profiles (email);

CREATE INDEX IF NOT EXISTS idx_client_profiles_is_active
  ON public.client_profiles (is_active);

ALTER TABLE public.client_profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_profiles'
      AND policyname = 'client_profiles_service_role_all'
  ) THEN
    CREATE POLICY client_profiles_service_role_all
      ON public.client_profiles
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
      AND tablename = 'client_profiles'
      AND policyname = 'client_profiles_authenticated_select_self'
  ) THEN
    CREATE POLICY client_profiles_authenticated_select_self
      ON public.client_profiles
      FOR SELECT
      TO authenticated
      USING (auth.uid() = id);
  END IF;
END
$$;
