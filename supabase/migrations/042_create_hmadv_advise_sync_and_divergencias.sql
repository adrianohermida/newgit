create schema if not exists judiciario;

create table if not exists judiciario.sync_divergencias (
  id bigserial primary key,
  processo_id uuid null,
  account_id_fs text null,
  tipo text not null,
  campo text null,
  valor_supabase text null,
  valor_freshsales text null,
  resolvido boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists sync_divergencias_resolvido_idx
  on judiciario.sync_divergencias (resolvido, created_at desc);

create index if not exists sync_divergencias_processo_idx
  on judiciario.sync_divergencias (processo_id);

create table if not exists judiciario.advise_sync_status (
  id bigserial primary key,
  ultima_data_movimento timestamptz null,
  ultima_execucao timestamptz null,
  created_at timestamptz not null default now()
);

insert into judiciario.advise_sync_status (
  ultima_data_movimento,
  ultima_execucao
)
select
  '2000-01-01T00:00:00+00:00',
  null
where not exists (
  select 1
  from judiciario.advise_sync_status
);
