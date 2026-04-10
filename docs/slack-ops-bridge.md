# Slack Ops Bridge

Esta ponte permite conversar com o DotoBot pelo Slack como operador interno do workspace, usando:

- memoria compartilhada com o DotoBot
- contexto `judicial 360`
- leitura operacional de Freshsales
- leitura e abertura de tickets no Freshdesk

## Endpoint

- Events API / slash command:
  - `https://SEU_DOMINIO/api/slack-events`

## Variaveis de ambiente

- `SLACK_SIGNING_SECRET`
- `SLACK_BOT_TOKEN`
- `SLACK_USER_TOKEN` (recomendado para `users.info`)
- `SLACK_ACCESS_TOKEN` (fallback)
- `FREDDY_ACTION_SHARED_SECRET`
- `FRESHSALES_API_BASE`
- `FRESHSALES_API_KEY` ou `FRESHSALES_ACCESS_TOKEN`
- `FRESHDESK_DOMAIN`
- `FRESHDESK_API_KEY` ou `FRESHDESK_BASIC_TOKEN`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`

## Configuracao do app no Slack

### Event Subscriptions

- Request URL:
  - `https://SEU_DOMINIO/api/slack-events`

Eventos recomendados:

- `app_mention`
- `message.im`
- `message.channels` se quiser operar em canais

### Slash command

Sugestao:

- command: `/dotobot`
- Request URL:
  - `https://SEU_DOMINIO/api/slack-events`

## Modo de uso

Tudo que nao casar com comando operacional segue para o agente conversacional com memoria.

### Comandos operacionais

- `ajuda`
- `resumo diario`
- `contato email@cliente.com`
- `contato atualizar 310123 campo=valor, campo2=valor`
- `deal 310456`
- `deal atualizar 310456 stage_name=Proposta Aceita`
- `conta 310789`
- `tasks`
- `task 310111`
- `task criar Ligar para cliente | 2026-04-12T14:00:00Z | confirmar documentos | 31000147944`
- `task atualizar 310111 status=2, due_date=2026-04-12T15:00:00Z`
- `task deletar 310111`
- `appointments`
- `documentos email@cliente.com`
- `tickets email@cliente.com`
- `ticket abrir email@cliente.com | Assunto | Descricao | 1 | 2`
- `freshdesk`
- `conversas email@cliente.com`

## Comportamento

- comandos operacionais retornam resposta objetiva em thread
- mensagens livres usam o DotoBot com contexto CRM/judicial e memoria compartilhada
- o bridge salva memoria do atendimento Slack no mesmo backend do DotoBot

## Observacoes

- o bridge ainda nao executa CRUD pleno de todos os modulos do Freshsales
- a base atual cobre bem:
  - contatos
  - deals
  - accounts
  - tasks
  - appointments
  - documentos do cliente
  - conversas registradas no AgentLab
  - Freshdesk

## Proxima expansao sugerida

- criar comandos de update para `appointments`
- criar operacoes seguras de `deals` e `contacts` por intent
- acoplar relatarios diarios agendados via automacao ou cron do worker
