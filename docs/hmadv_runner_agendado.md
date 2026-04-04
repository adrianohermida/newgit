# Runner agendado HMADV

## Objetivo

Parar de depender da aba aberta do `/interno` para continuar drenando as filas de:

- `processos`
- `publicacoes`

O endpoint pronto para isso ficou em:

- `/api/admin-hmadv-runner`

Ele usa autenticacao por token e foi pensado para ser chamado por um agendador externo.

## Variavel de ambiente

Configurar no Cloudflare Pages:

- `HMADV_RUNNER_TOKEN`

Sem essa variavel, o endpoint responde `503`.

## Autenticacao

Enviar um destes headers:

```text
Authorization: Bearer SEU_TOKEN
```

ou

```text
x-hmadv-runner-token: SEU_TOKEN
```

## Endpoints

### Snapshot da fila

`GET /api/admin-hmadv-runner`

Retorna:

- overview de processos
- overview de publicacoes
- status resumido dos jobs
- indicador `runnerConfigured`

### Drenagem da fila

`POST /api/admin-hmadv-runner`

Body:

```json
{
  "action": "drain_all",
  "maxChunks": 8
}
```

## Exemplo com scheduler externo

```powershell
$headers = @{
  Authorization = "Bearer SEU_TOKEN"
  "Content-Type" = "application/json"
}

$body = @{
  action = "drain_all"
  maxChunks = 8
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "https://hermidamaia.adv.br/api/admin-hmadv-runner" `
  -Headers $headers `
  -Body $body
```

## Sugestao operacional

- rodar a cada 5 minutos em horario comercial
- usar `maxChunks` entre `6` e `10`
- manter o `/interno` como painel de acompanhamento e disparo manual
- usar o runner para drenagem de continuidade

## GitHub Actions pronto no repositorio

Workflow incluido:

- [D:\\Github\\newgit\\.github\\workflows\\hmadv-runner.yml](D:/Github/newgit/.github/workflows/hmadv-runner.yml)

Secrets esperados no GitHub:

- `HMADV_RUNNER_URL`
  Exemplo: `https://hermidamaia.adv.br/api/admin-hmadv-runner`
- `HMADV_RUNNER_TOKEN`

O workflow:

- roda em dias uteis
- faz POST no runner
- aceita disparo manual
- permite sobrescrever `max_chunks` no `workflow_dispatch`

## Limite honesto

Isso ainda nao cria cron nativo no projeto Pages.

O que ficou pronto foi a trilha segura para plugar:

- Cloudflare Worker separado com cron
- GitHub Actions agendado
- UptimeRobot, cron-job.org ou outro scheduler HTTP
- automacao interna que faca `POST` no endpoint
