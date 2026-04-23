# 🤖 DotoBot — Comandos & Status de Implementação

> Última verificação: **23/04/2026 03:50** (Horário de Manaus)
> Endpoint base: `https://sspvizogbcyigquqycsz.supabase.co/functions/v1/`

## Legenda

| Ícone | Significado |
|-------|-------------|
| ✅ OK | Endpoint respondeu corretamente |
| ⏱️ TIMEOUT | Função existe mas demora >8s (normal para funções pesadas) |
| ⚠️ AVISO | Endpoint respondeu mas com erro de parâmetro |
| ❌ ERRO | Endpoint com falha ou não encontrado |
| 🔧 CONFIG | Requer configuração manual no Slack App |

## 📊 Painel & Status

| Status | Comando Slash | Edge Function | Descrição | Observação |
|--------|---------------|---------------|-----------|------------|
| ✅ OK | `/dotobot status` | `dotobot-slack` | Painel completo do pipeline em tempo real | 🔧 Registrar no Slack App |
| ✅ OK | `/dotobot pendencias` | `dotobot-slack` | Relatório de pendências de desenvolvimento | 🔧 Registrar no Slack App |
| ✅ OK | `/dotobot help` | `dotobot-slack` | Lista todos os comandos disponíveis | 🔧 Registrar no Slack App |

## 📰 Publicações

| Status | Comando Slash | Edge Function | Descrição | Observação |
|--------|---------------|---------------|-----------|------------|
| ✅ OK | `/dotobot publicacoes` | `dotobot-slack` | Últimas 5 publicações recebidas do Advise | 🔧 Registrar no Slack App |
| ⏱️ TIMEOUT | `/dotobot-advise backfill` | `advise-backfill-runner` | Processa próxima semana do backfill Advise | 🔧 Registrar no Slack App |
| ✅ OK | `/dotobot-advise status` | `dotobot-slack` | Painel de progresso do backfill 120 dias | 🔧 Registrar no Slack App |
| ⏱️ TIMEOUT | `/dotobot-advise drain` | `advise-drain-by-date` | Drena publicações do Advise agora | 🔧 Registrar no Slack App |
| ✅ OK | `— (cron 15min)` | `publicacoes-audiencias` | Extrai audiências das publicações via regex | — |
| ✅ OK | `— (cron 10min)` | `publicacoes-freshsales` | Sincroniza publicações → Freshsales | — |

## ⚖️ Andamentos

| Status | Comando Slash | Edge Function | Descrição | Observação |
|--------|---------------|---------------|-----------|------------|
| ✅ OK | `/dotobot andamentos` | `dotobot-slack` | Últimos 5 andamentos do DataJud | 🔧 Registrar no Slack App |
| ✅ OK | `/dotobot-datajud reset` | `dotobot-slack` | Reseta processos presos em 'processando' | 🔧 Registrar no Slack App |
| ⏱️ TIMEOUT | `— (cron 5min)` | `datajud-worker` | Processa fila DataJud (andamentos) | Normal — função de longa duração |

## 📅 Audiências

| Status | Comando Slash | Edge Function | Descrição | Observação |
|--------|---------------|---------------|-----------|------------|
| ✅ OK | `/dotobot audiencias` | `dotobot-slack` | Próximas audiências agendadas | 🔧 Registrar no Slack App |
| ✅ OK | `— (cron 15min)` | `publicacoes-audiencias` | Extração automática de audiências | — |
| ✅ OK | `— (cron futura)` | `publicacoes-audiencias` | Sincroniza audiências → Freshsales | — |

## 🔧 Freshsales

| Status | Comando Slash | Edge Function | Descrição | Observação |
|--------|---------------|---------------|-----------|------------|
| ✅ OK | `/dotobot-fs fix_activities` | `fs-fix-activities` | Corrige activities pendentes (lote 50) | 🔧 Registrar no Slack App |
| ⏱️ TIMEOUT | `— (cron 5min)` | `fs-account-repair` | Enriquecimento em massa de Accounts | Normal — função de longa duração |
| ✅ OK | `— (cron 30min)` | `processo-sync` | Sync bidirecional processos FS↔Supabase | — |
| ✅ OK | `— (cron 6h)` | `fs-contacts-sync` | Sincronização de Contacts FS↔Supabase | — |

## 🩺 Reparo Órfãos

| Status | Comando Slash | Edge Function | Descrição | Observação |
|--------|---------------|---------------|-----------|------------|
| ✅ OK | `/dotobot-repair all` | `fs-repair-orphans` | Corrige todos os campos órfãos | 🔧 Registrar no Slack App |
| ✅ OK | `/dotobot-repair instancia` | `fs-repair-orphans` | Corrige campo instância | 🔧 Registrar no Slack App |
| ✅ OK | `/dotobot-repair partes` | `fs-repair-orphans` | Corrige polo ativo/passivo | 🔧 Registrar no Slack App |
| ✅ OK | `/dotobot-repair status` | `fs-repair-orphans` | Deriva status processual | 🔧 Registrar no Slack App |
| ✅ OK | `/dotobot-repair fs_sync` | `fs-repair-orphans` | Sincroniza campos corrigidos → Freshsales | 🔧 Registrar no Slack App |

## 🔑 OAuth

| Status | Comando Slash | Edge Function | Descrição | Observação |
|--------|---------------|---------------|-----------|------------|
| ⚠️ AVISO | `— (cron 25min)` | `oauth` | Status dos tokens OAuth do Freshsales | Parâmetro ausente (normal para status sem kind) |

## 🔧 Configuração dos Slash Commands no Slack App

Acesse: https://api.slack.com/apps/A098C4KJKK4/slash-commands

| Comando | Request URL | Usage Hint |
|---------|-------------|------------|
| `/dotobot` | `https://sspvizogbcyigquqycsz.supabase.co/functions/v1/dotobot-slack` | `status \| publicacoes \| andamentos \| audiencias \| pendencias \| help` |
| `/dotobot-repair` | `https://sspvizogbcyigquqycsz.supabase.co/functions/v1/dotobot-slack` | `all \| instancia \| partes \| status \| fs_sync` |
| `/dotobot-fs` | `https://sspvizogbcyigquqycsz.supabase.co/functions/v1/dotobot-slack` | `fix_activities` |
| `/dotobot-advise` | `https://sspvizogbcyigquqycsz.supabase.co/functions/v1/dotobot-slack` | `backfill \| status \| drain` |
| `/dotobot-datajud` | `https://sspvizogbcyigquqycsz.supabase.co/functions/v1/dotobot-slack` | `reset` |

**Importante:** Após criar os comandos, vá em *Install App* e reinstale o app no workspace.

## ⏰ Cron Jobs Ativos no Supabase

| Job | Frequência | Edge Function | Status |
|-----|------------|---------------|--------|
| `advise-backfill-intensivo` | A cada 5 min | `advise-backfill-runner` | ✅ Ativo |
| `fix-pending-activities` | A cada 5 min | `fs-fix-activities` | ✅ Ativo |
| `publicacoes-freshsales-sync` | A cada 10 min | `publicacoes-freshsales` | ✅ Ativo |
| `publicacoes-audiencias-extract` | A cada 15 min | `publicacoes-audiencias` | ✅ Ativo |
| `fs-account-batch-repair` | A cada 5 min | `fs-account-repair` | ✅ Ativo |
| `fs-repair-orphans` | A cada 15 min | `fs-repair-orphans` | ✅ Ativo |
| `oauth-refresh-deals` | A cada 25 min | `oauth` | ✅ Ativo |
| `oauth-refresh-contacts` | A cada 25 min | `oauth` | ✅ Ativo |
| `datajud-worker-cron` | A cada 5 min | `datajud-worker` | ✅ Ativo |
| `processo-sync-bidirectional` | A cada 30 min | `processo-sync` | ✅ Ativo |
| `fs-contacts-sync-cron` | A cada 6 h | `fs-contacts-sync` | ✅ Ativo |
| `dotobot-status-diario` | 8h dias úteis | `dotobot-slack` | ✅ Ativo |
| `dotobot-pendencias-semanal` | Seg 8h30 | `dotobot-slack` | ✅ Ativo |
