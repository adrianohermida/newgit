-- Migration: 002_add_confirmation_audit
-- Adiciona campo explícito de auditoria para confirmação do agendamento

ALTER TABLE public.agendamentos
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_agendamentos_confirmed_at
  ON public.agendamentos (confirmed_at);
