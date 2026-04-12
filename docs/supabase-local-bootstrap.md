# Supabase Local Bootstrap

Guia objetivo para subir um `Supabase local` no Windows e preparar a stack offline do Lawdesk/ai-core.

## Quando usar

Use `Supabase local` quando quiser:

- persistência estruturada offline
- histórico de runs do AI Task
- memória vetorial local
- RPCs equivalentes ao ambiente remoto
- testes end-to-end sem depender do Supabase cloud

Se a prioridade for só colocar o `LLM local + Obsidian` para rodar sem internet, este passo pode vir depois.

## Pré-requisitos

- Docker Desktop
- Node.js
- Supabase CLI

Instalação da CLI:

```powershell
npm install -g supabase
```

ou via Scoop/Chocolatey, se preferir.

## Inicialização

No diretório do repo:

```powershell
supabase init
supabase start
```

Ao subir, anote:

- API URL local
- anon key local
- service role key local
- DB URL local

## Variáveis para o ambiente local

Use no `.env.local`, `.dev.vars` ou shell:

```env
SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<local-anon-key>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<local-service-role-key>
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

## Ordem recomendada de bootstrap

1. Subir o `Supabase local`
2. Validar `admin-auth-config`
3. Portar migrations mínimas
4. Validar `admin-lawdesk-providers`
5. Validar `admin-lawdesk-chat`
6. Integrar memória/persistência local

## Migrations mínimas sugeridas

Primeiro bloco:

- tabelas de sessões
- tabelas de task runs
- tabelas de eventos/logs

Segundo bloco:

- memória Dotobot
- embeddings
- RPCs de busca e upsert

## Vetores locais

Se quiser busca vetorial offline no Postgres local:

1. habilitar `pgvector`
2. escolher uma única dimensão
3. manter o mesmo modelo de embedding em todo o ambiente local

Evite misturar:

- `384`
- `768`

na mesma tabela ou RPC.

## Critério de pronto

O ambiente estará minimamente pronto quando:

- `LLM local` responder offline
- `Obsidian` local continuar funcionando
- `Supabase local` responder autenticação e gravações
- `AI Task` conseguir salvar histórico/run local

## Observação prática

Para a primeira versão offline, você pode começar com:

- `LLM local`
- `Obsidian local`

e deixar o `Supabase local` como fase 2 de endurecimento.
