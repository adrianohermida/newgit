# HMADV - Deploy e Homologação das Edge Functions

## Projeto

- Supabase Project Ref: `sspvizogbcyigquqycsz`
- Base URL: `https://sspvizogbcyigquqycsz.supabase.co`

## Pré-requisitos

Definir no shell:

```powershell
$env:SUPABASE_ACCESS_TOKEN="SEU_SUPABASE_ACCESS_TOKEN"
$env:HMADV_SERVICE_ROLE="SUA_SERVICE_ROLE"
```

## Functions a publicar agora

- [fs-webhook](D:/Github/newgit/_hmadv_review/supabase/functions/fs-webhook/index.ts)
- [datajud-worker](D:/Github/newgit/_hmadv_review/supabase/functions/datajud-worker/index.ts)
- [sync-worker](D:/Github/newgit/_hmadv_review/supabase/functions/sync-worker/index.ts)
- [tpu-sync](D:/Github/newgit/_hmadv_review/supabase/functions/tpu-sync/index.ts)

## Deploy

Na raiz do repositório:

```powershell
cd D:\Github\newgit

npx supabase functions deploy fs-webhook `
  --project-ref sspvizogbcyigquqycsz `
  --workdir _hmadv_review\supabase

npx supabase functions deploy datajud-worker `
  --project-ref sspvizogbcyigquqycsz `
  --workdir _hmadv_review\supabase

npx supabase functions deploy sync-worker `
  --project-ref sspvizogbcyigquqycsz `
  --workdir _hmadv_review\supabase

npx supabase functions deploy tpu-sync `
  --project-ref sspvizogbcyigquqycsz `
  --workdir _hmadv_review\supabase
```

## Secrets esperados no HMADV

### Freshsales / HMADV

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FRESHSALES_API_KEY`
- `FRESHSALES_DOMAIN`
- `FS_OWNER_ID`
- `FRESHSALES_ACTIVITY_TYPE_CONSULTA`
- `FRESHSALES_ACTIVITY_TYPE_AUDIENCIA`
- `PROCESS_AI_BASE`
- `HMDAV_AI_SHARED_SECRET`

### DataJud / Advise

- `DATAJUD_API_KEY`
- `ADVISE_TOKEN` ou `ADVISE_API_TOKEN`
- `ADVISE_CLIENTE_ID` se o fluxo completo estiver habilitado

## Testes de homologação

### 1. Webhook/tag Datajud

Verificar no Freshsales:

- adicionar a tag `Datajud`
- repetir com `datajud`

Esperado:

- activity em `Consulta`:
  - `Sincronização com o CNJ solicitada - <CNJ>`

### 2. Sincronização concluída

Executar:

```powershell
Invoke-RestMethod -Method Post `
  -Uri "https://sspvizogbcyigquqycsz.supabase.co/functions/v1/datajud-worker" `
  -Headers @{
    apikey = $env:HMADV_SERVICE_ROLE
    Authorization = "Bearer $env:HMADV_SERVICE_ROLE"
    "Content-Type" = "application/json"
  } `
  -Body "{}"
```

Esperado no Freshsales:

- activity em `Consulta`:
  - `Sincronização com o CNJ realizada com sucesso - <CNJ>`
- se houver atualização real:
  - `Detalhes do processo atualizados - <CNJ>`

### 3. Andamentos e publicações

Executar:

```powershell
Invoke-RestMethod -Method Post `
  -Uri "https://sspvizogbcyigquqycsz.supabase.co/functions/v1/sync-worker" `
  -Headers @{
    apikey = $env:HMADV_SERVICE_ROLE
    Authorization = "Bearer $env:HMADV_SERVICE_ROLE"
    "Content-Type" = "application/json"
  } `
  -Body "{}"
```

Esperado no Freshsales:

- activity em `Andamentos`
- activity em `Publicações`
- activity correspondente em `Consulta`

### 4. Processo dirigido

Para validar um processo específico:

```powershell
Invoke-RestMethod -Method Post `
  -Uri "https://sspvizogbcyigquqycsz.supabase.co/functions/v1/sync-worker?action=repair_process" `
  -Headers @{
    apikey = $env:HMADV_SERVICE_ROLE
    Authorization = "Bearer $env:HMADV_SERVICE_ROLE"
    "Content-Type" = "application/json"
  } `
  -Body '{"processo_id":"SEU_PROCESSO_ID"}'
```

### 5. Gateway TPU

Resolver um código específico:

```powershell
Invoke-RestMethod -Method Get `
  -Uri "https://sspvizogbcyigquqycsz.supabase.co/functions/v1/tpu-sync?action=resolver_movimento_detalhado&codigo_cnj=92" `
  -Headers @{
    apikey = $env:HMADV_SERVICE_ROLE
    Authorization = "Bearer $env:HMADV_SERVICE_ROLE"
  }
```

Sincronizar lote do Gateway:

```powershell
Invoke-RestMethod -Method Get `
  -Uri "https://sspvizogbcyigquqycsz.supabase.co/functions/v1/tpu-sync?action=sync_movimentos_gateway&limite=50" `
  -Headers @{
    apikey = $env:HMADV_SERVICE_ROLE
    Authorization = "Bearer $env:HMADV_SERVICE_ROLE"
  }
```

### 6. Audiências e reuniões

Depois que houver registros em `judiciario.audiencias` sem `freshsales_activity_id`:

- rodar `sync-worker`
- verificar:
  - nova activity em `Audiências`
  - nova activity em `Consulta`
  - criação de `Reunião/Appointment` quando a audiência for futura

## Critério de aceite

- `Datajud` e `datajud` acionam o fluxo
- `Consulta` registra solicitação, sucesso e eventos
- `Andamentos`, `Publicações` e `Audiências` recebem seus registros próprios
- audiências futuras geram `Reuniões/Appointments`
- `tpu-sync` resolve e enriquece movimentos via Gateway
