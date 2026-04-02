ALTER TABLE IF EXISTS public.agendamentos
  ADD COLUMN IF NOT EXISTS meeting_outcome text,
  ADD COLUMN IF NOT EXISTS meeting_outcome_notes text,
  ADD COLUMN IF NOT EXISTS attended_at timestamptz,
  ADD COLUMN IF NOT EXISTS no_show_at timestamptz,
  ADD COLUMN IF NOT EXISTS proposal_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS proposal_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS proposal_refused_at timestamptz,
  ADD COLUMN IF NOT EXISTS contract_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS crm_last_event text;

CREATE INDEX IF NOT EXISTS idx_agendamentos_meeting_outcome
  ON public.agendamentos (meeting_outcome);

CREATE INDEX IF NOT EXISTS idx_agendamentos_crm_last_event
  ON public.agendamentos (crm_last_event);
