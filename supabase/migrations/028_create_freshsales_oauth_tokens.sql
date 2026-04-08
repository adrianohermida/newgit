-- 028_create_freshsales_oauth_tokens
-- Armazena tokens OAuth 2.0 do Freshsales Suite
-- Um registro por provedor (upsert on conflict provider)

create table if not exists public.freshsales_oauth_tokens (
  id            uuid        primary key default gen_random_uuid(),
  provider      text        not null unique,          -- ex: 'freshsales'
  access_token  text        not null,
  refresh_token text,
  expires_at    timestamptz not null,
  token_type    text        not null default 'Bearer',
  scope         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.freshsales_oauth_tokens is
  'Tokens OAuth 2.0 do Freshsales Suite — gerenciado pela Edge Function oauth';

-- RLS: apenas service_role pode acessar
alter table public.freshsales_oauth_tokens enable row level security;

create policy "service_role_only"
  on public.freshsales_oauth_tokens
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Índice de busca por provedor (já é unique, mas explícito para clareza)
create index if not exists idx_freshsales_oauth_tokens_provider
  on public.freshsales_oauth_tokens (provider);
