-- Migration: 026_add_rls_and_performance_indexes
-- Description: Enable Row Level Security (RLS) on conversation/memory tables
-- and add missing performance indexes (source_system, metadata GIN)
-- Note: Preserves all existing data, adds security and performance improvements

-- === RLS SETUP FOR DOTOBOT_MEMORY_EMBEDDINGS ===

-- Enable RLS on memory table
alter table public.dotobot_memory_embeddings enable row level security;

drop policy if exists dotobot_memory_service_all on public.dotobot_memory_embeddings;
drop policy if exists dotobot_memory_authenticated_read_own on public.dotobot_memory_embeddings;
drop policy if exists dotobot_memory_authenticated_insert_own on public.dotobot_memory_embeddings;
drop policy if exists dotobot_memory_authenticated_update_own on public.dotobot_memory_embeddings;

-- Policy: service_role (backend services) can do everything
create policy dotobot_memory_service_all
  on public.dotobot_memory_embeddings
  for all
  to service_role
  using (true)
  with check (true);

-- Policy: authenticated users can read their own session
create policy dotobot_memory_authenticated_read_own
  on public.dotobot_memory_embeddings
  for select
  to authenticated
  using (
    session_id = auth.uid()::text 
    or session_id = 'anonymous'
    or session_id like 'workspace_%'
  );

-- Policy: authenticated users can insert their own session
create policy dotobot_memory_authenticated_insert_own
  on public.dotobot_memory_embeddings
  for insert
  to authenticated
  with check (
    session_id = auth.uid()::text 
    or session_id = 'anonymous'
  );

-- Policy: authenticated users can update their own session
create policy dotobot_memory_authenticated_update_own
  on public.dotobot_memory_embeddings
  for update
  to authenticated
  using (
    session_id = auth.uid()::text 
    or session_id = 'anonymous'
  )
  with check (
    session_id = auth.uid()::text 
    or session_id = 'anonymous'
  );

-- === RLS SETUP FOR AGENTLAB_CONVERSATION_THREADS ===

-- Enable RLS on conversation threads
alter table public.agentlab_conversation_threads enable row level security;

drop policy if exists agentlab_threads_service_all on public.agentlab_conversation_threads;
drop policy if exists agentlab_threads_authenticated_read on public.agentlab_conversation_threads;

-- Policy: service_role can do everything
create policy agentlab_threads_service_all
  on public.agentlab_conversation_threads
  for all
  to service_role
  using (true)
  with check (true);

-- Policy: authenticated users can read if workspace matches (extensible)
create policy agentlab_threads_authenticated_read
  on public.agentlab_conversation_threads
  for select
  to authenticated
  using (
    workspace_id = auth.uid()::uuid 
    or source_system = 'internal_dotobot'
  );

-- === RLS SETUP FOR AGENTLAB_CONVERSATION_MESSAGES ===

-- Enable RLS on conversation messages
alter table public.agentlab_conversation_messages enable row level security;

drop policy if exists agentlab_messages_service_all on public.agentlab_conversation_messages;
drop policy if exists agentlab_messages_authenticated_read on public.agentlab_conversation_messages;

-- Policy: service_role can do everything
create policy agentlab_messages_service_all
  on public.agentlab_conversation_messages
  for all
  to service_role
  using (true)
  with check (true);

-- Policy: authenticated users can read if thread accessible (via cascade)
create policy agentlab_messages_authenticated_read
  on public.agentlab_conversation_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.agentlab_conversation_threads t
      where t.id = agentlab_conversation_messages.thread_id
        and (
          t.workspace_id = auth.uid()::uuid
          or t.source_system = 'internal_dotobot'
        )
    )
    or (
      agentlab_conversation_messages.thread_id is null
      and agentlab_conversation_messages.source_system = 'internal_dotobot'
    )
  );

-- === MISSING INDEXES ===

-- Index on source_system (for filtering by system: 'freshchat', 'internal_dotobot', etc.)
create index if not exists idx_agentlab_conversation_threads_source_system
  on public.agentlab_conversation_threads (source_system);

-- Composite index on source_system + conversation_id (for dedup and queries)
create index if not exists idx_agentlab_conversation_threads_source_composite
  on public.agentlab_conversation_threads (source_system, source_conversation_id);

-- JSONB index on metadata (for queries like metadata->>'type' = 'xyz')
create index if not exists idx_dotobot_memory_metadata_gin
  on public.dotobot_memory_embeddings using gin (metadata);

-- Additional: partial index on 'ok' status (common query)
create index if not exists idx_dotobot_memory_ok_status
  on public.dotobot_memory_embeddings
  using hnsw (embedding vector_cosine_ops)
  where status = 'ok';

-- Index on message source_system for fast filtering
create index if not exists idx_agentlab_conversation_messages_source_system
  on public.agentlab_conversation_messages (source_system);

-- === PERFORMANCE VERIFICATION ===
-- Run after migration:
-- SELECT schemaname, tablename, indexname FROM pg_indexes 
--   WHERE schemaname = 'public' 
--   AND tablename IN ('dotobot_memory_embeddings', 'agentlab_conversation_threads', 'agentlab_conversation_messages')
--   ORDER BY tablename, indexname;
