-- Migration: 022_create_client_profile_change_requests
-- Cria a fila de solicitacoes de alteracao cadastral do portal do cliente.

create table if not exists public.client_profile_change_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  client_email text not null,
  status text not null default 'pending',
  current_snapshot jsonb not null default '{}'::jsonb,
  requested_payload jsonb not null default '{}'::jsonb,
  review_notes text null,
  reviewed_by uuid null,
  reviewed_by_email text null,
  reviewed_at timestamptz null,
  applied_at timestamptz null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint client_profile_change_requests_status_check
    check (status in ('pending', 'approved', 'rejected', 'applied'))
);

create index if not exists idx_client_profile_change_requests_client_id
on public.client_profile_change_requests (client_id);

create index if not exists idx_client_profile_change_requests_status
on public.client_profile_change_requests (status, created_at desc);

create index if not exists idx_client_profile_change_requests_client_email
on public.client_profile_change_requests (client_email);

create or replace function public.set_updated_at_client_profile_change_requests()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists trg_client_profile_change_requests_updated_at on public.client_profile_change_requests;

create trigger trg_client_profile_change_requests_updated_at
before update on public.client_profile_change_requests
for each row
execute function public.set_updated_at_client_profile_change_requests();
