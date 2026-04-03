create extension if not exists pgcrypto;
create extension if not exists vector with schema extensions;

create table if not exists public.dotobot_memory_embeddings (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  session_id text not null default 'anonymous',
  route text,
  role text,
  query text not null,
  response_text text not null,
  status text not null default 'ok',
  steps_count integer not null default 0,
  embedding_model text not null default 'supabase/gte-small',
  embedding_dimensions integer not null default 384,
  metadata jsonb not null default '{}'::jsonb,
  embedding extensions.vector(384) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_dotobot_memory_embeddings_created_at
  on public.dotobot_memory_embeddings (created_at desc);

create index if not exists idx_dotobot_memory_embeddings_session_id
  on public.dotobot_memory_embeddings (session_id, created_at desc);

create index if not exists idx_dotobot_memory_embeddings_embedding
  on public.dotobot_memory_embeddings
  using hnsw (embedding vector_cosine_ops);

create or replace function public.upsert_dotobot_memory_embedding(payload jsonb)
returns public.dotobot_memory_embeddings
language plpgsql
as $$
declare
  stored_row public.dotobot_memory_embeddings;
begin
  insert into public.dotobot_memory_embeddings (
    source_key,
    session_id,
    route,
    role,
    query,
    response_text,
    status,
    steps_count,
    embedding_model,
    embedding_dimensions,
    metadata,
    embedding,
    updated_at
  )
  values (
    coalesce(nullif(payload->>'source_key', ''), gen_random_uuid()::text),
    coalesce(nullif(payload->>'session_id', ''), 'anonymous'),
    nullif(payload->>'route', ''),
    nullif(payload->>'role', ''),
    coalesce(nullif(payload->>'query', ''), ''),
    coalesce(nullif(payload->>'response_text', ''), ''),
    coalesce(nullif(payload->>'status', ''), 'ok'),
    coalesce((payload->>'steps_count')::integer, 0),
    coalesce(nullif(payload->>'embedding_model', ''), 'supabase/gte-small'),
    coalesce((payload->>'embedding_dimensions')::integer, 384),
    coalesce(payload->'metadata', '{}'::jsonb),
    (payload->'embedding')::text::extensions.vector(384),
    now()
  )
  on conflict (source_key) do update set
    session_id = excluded.session_id,
    route = excluded.route,
    role = excluded.role,
    query = excluded.query,
    response_text = excluded.response_text,
    status = excluded.status,
    steps_count = excluded.steps_count,
    embedding_model = excluded.embedding_model,
    embedding_dimensions = excluded.embedding_dimensions,
    metadata = excluded.metadata,
    embedding = excluded.embedding,
    updated_at = now()
  returning * into stored_row;

  return stored_row;
end;
$$;

create or replace function public.match_dotobot_memory_embeddings(
  query_embedding jsonb,
  match_count integer default 5,
  match_threshold double precision default null
)
returns table (
  id uuid,
  source_key text,
  session_id text,
  route text,
  role text,
  query text,
  response_text text,
  status text,
  steps_count integer,
  embedding_model text,
  embedding_dimensions integer,
  metadata jsonb,
  similarity double precision,
  created_at timestamptz
)
language sql
stable
as $$
  select
    m.id,
    m.source_key,
    m.session_id,
    m.route,
    m.role,
    m.query,
    m.response_text,
    m.status,
    m.steps_count,
    m.embedding_model,
    m.embedding_dimensions,
    m.metadata,
    1 - (m.embedding <=> (query_embedding::text)::extensions.vector(384)) as similarity,
    m.created_at
  from public.dotobot_memory_embeddings as m
  where match_threshold is null or 1 - (m.embedding <=> (query_embedding::text)::extensions.vector(384)) >= match_threshold
  order by m.embedding <=> (query_embedding::text)::extensions.vector(384)
  limit greatest(match_count, 1);
$$;
