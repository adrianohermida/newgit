alter table public.agendamentos
add column if not exists zoom_meeting_id text,
add column if not exists zoom_uuid text,
add column if not exists zoom_join_url text,
add column if not exists zoom_start_url text,
add column if not exists zoom_password text,
add column if not exists zoom_host_email text,
add column if not exists zoom_timezone text,
add column if not exists zoom_topic text,
add column if not exists zoom_status text,
add column if not exists zoom_occurrence_id text,
add column if not exists zoom_payload jsonb not null default '{}'::jsonb,
add column if not exists freshsales_contact_id text,
add column if not exists freshsales_appointment_id text,
add column if not exists freshsales_external_id text,
add column if not exists freshsales_sync_status text,
add column if not exists freshsales_sync_error text,
add column if not exists freshsales_payload jsonb not null default '{}'::jsonb,
add column if not exists confirmation_clicked_at timestamptz,
add column if not exists cancellation_clicked_at timestamptz,
add column if not exists remarcacao_clicked_at timestamptz;

create index if not exists idx_agendamentos_zoom_meeting_id
  on public.agendamentos (zoom_meeting_id);

create index if not exists idx_agendamentos_freshsales_contact_id
  on public.agendamentos (freshsales_contact_id);

create index if not exists idx_agendamentos_freshsales_appointment_id
  on public.agendamentos (freshsales_appointment_id);

create index if not exists idx_agendamentos_freshsales_sync_status
  on public.agendamentos (freshsales_sync_status);
