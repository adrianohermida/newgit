-- Migration: 001_create_agendamentos
-- Cria a tabela de agendamentos com RLS e índices

CREATE TABLE IF NOT EXISTS public.agendamentos (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                TEXT        NOT NULL,
  email               TEXT        NOT NULL,
  telefone            TEXT        NOT NULL,
  area                TEXT        NOT NULL,
  data                DATE        NOT NULL,
  hora                TIME        NOT NULL,
  observacoes         TEXT,
  status              TEXT        NOT NULL DEFAULT 'pendente'
                                  CHECK (status IN ('pendente', 'confirmado', 'cancelado')),
  token_confirmacao   UUID        NOT NULL DEFAULT gen_random_uuid(),
  google_event_id     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para consultas frequentes
CREATE INDEX IF NOT EXISTS idx_agendamentos_status
  ON public.agendamentos (status);

CREATE INDEX IF NOT EXISTS idx_agendamentos_data
  ON public.agendamentos (data);

CREATE INDEX IF NOT EXISTS idx_agendamentos_token_confirmacao
  ON public.agendamentos (token_confirmacao);

-- Row Level Security
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;

-- Policy: service_role tem acesso total
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'agendamentos'
      AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY service_role_all
      ON public.agendamentos
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;
