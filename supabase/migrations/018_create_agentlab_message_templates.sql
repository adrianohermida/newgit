create table if not exists public.agentlab_message_templates (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'email',
  template_name text not null,
  subject text null,
  body_html text null,
  body_text text null,
  enabled boolean not null default true,
  notes text null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create unique index if not exists agentlab_message_templates_channel_template_name_idx
  on public.agentlab_message_templates (channel, template_name);

create index if not exists agentlab_message_templates_updated_at_idx
  on public.agentlab_message_templates (updated_at desc);
