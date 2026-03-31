-- Migration: 008_bootstrap_superadmin_admin_profiles
-- Garante a existencia de public.admin_profiles com role superadmin
-- e cadastra Adriano Hermida Maia como superadmin inicial.

CREATE TABLE IF NOT EXISTS public.admin_profiles (
  id          UUID        PRIMARY KEY,
  email       TEXT        NOT NULL UNIQUE,
  full_name   TEXT,
  role        TEXT        NOT NULL DEFAULT 'viewer',
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'admin_profiles_role_check'
      AND conrelid = 'public.admin_profiles'::regclass
  ) THEN
    ALTER TABLE public.admin_profiles
      DROP CONSTRAINT admin_profiles_role_check;
  END IF;
END
$$;

ALTER TABLE public.admin_profiles
  ADD CONSTRAINT admin_profiles_role_check
  CHECK (role IN ('superadmin', 'admin', 'editor', 'viewer'));

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

INSERT INTO public.admin_profiles (
  id,
  email,
  full_name,
  role,
  is_active,
  created_at,
  updated_at
)
VALUES (
  '6acf3ef5-34e3-4606-9f5b-4cf714ee8841',
  'adrianohermida@gmail.com',
  'Adriano Hermida Maia',
  'superadmin',
  true,
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE
SET
  email = EXCLUDED.email,
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  is_active = EXCLUDED.is_active,
  updated_at = now();
