-- Migration: 004_add_agendamento_action_tokens
-- Adiciona tokens e auditoria para cancelamento e remarcação por cliente e advogado

ALTER TABLE public.agendamentos
ADD COLUMN IF NOT EXISTS token_cancelamento UUID NOT NULL DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS token_remarcacao UUID NOT NULL DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS admin_token_confirmacao UUID NOT NULL DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS admin_token_cancelamento UUID NOT NULL DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS admin_token_remarcacao UUID NOT NULL DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS cancelled_by TEXT
  CHECK (cancelled_by IS NULL OR cancelled_by IN ('cliente', 'advogado')),
ADD COLUMN IF NOT EXISTS rescheduled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS rescheduled_by TEXT
  CHECK (rescheduled_by IS NULL OR rescheduled_by IN ('cliente', 'advogado')),
ADD COLUMN IF NOT EXISTS original_data DATE,
ADD COLUMN IF NOT EXISTS original_hora TIME;

CREATE INDEX IF NOT EXISTS idx_agendamentos_token_cancelamento
  ON public.agendamentos (token_cancelamento);

CREATE INDEX IF NOT EXISTS idx_agendamentos_token_remarcacao
  ON public.agendamentos (token_remarcacao);

CREATE INDEX IF NOT EXISTS idx_agendamentos_admin_token_confirmacao
  ON public.agendamentos (admin_token_confirmacao);

CREATE INDEX IF NOT EXISTS idx_agendamentos_admin_token_cancelamento
  ON public.agendamentos (admin_token_cancelamento);

CREATE INDEX IF NOT EXISTS idx_agendamentos_admin_token_remarcacao
  ON public.agendamentos (admin_token_remarcacao);

CREATE INDEX IF NOT EXISTS idx_agendamentos_cancelled_at
  ON public.agendamentos (cancelled_at);

CREATE INDEX IF NOT EXISTS idx_agendamentos_rescheduled_at
  ON public.agendamentos (rescheduled_at);
