-- Migration: 005_create_blog_posts
-- Cria a base editorial do blog publico

CREATE TABLE IF NOT EXISTS public.blog_posts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             TEXT        NOT NULL UNIQUE,
  title            TEXT        NOT NULL,
  excerpt          TEXT        NOT NULL,
  content          TEXT        NOT NULL,
  cover_image_url  TEXT,
  category         TEXT,
  status           TEXT        NOT NULL DEFAULT 'draft'
                               CHECK (status IN ('draft', 'published', 'archived')),
  seo_title        TEXT,
  seo_description  TEXT,
  published_at     TIMESTAMPTZ,
  author_id        UUID        REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_status
  ON public.blog_posts (status);

CREATE INDEX IF NOT EXISTS idx_blog_posts_published_at
  ON public.blog_posts (published_at DESC);

CREATE INDEX IF NOT EXISTS idx_blog_posts_category
  ON public.blog_posts (category);

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'blog_posts'
      AND policyname = 'blog_posts_service_role_all'
  ) THEN
    CREATE POLICY blog_posts_service_role_all
      ON public.blog_posts
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
      AND tablename = 'blog_posts'
      AND policyname = 'blog_posts_public_select_published'
  ) THEN
    CREATE POLICY blog_posts_public_select_published
      ON public.blog_posts
      FOR SELECT
      TO anon, authenticated
      USING (status = 'published');
  END IF;
END
$$;
