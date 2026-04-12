# Universal LLM Assistant Extension

Bridge local para o `ai-core`, Dotobot Copilot e AI Task.

## Capacidades atuais

- busca local de arquivos
- busca web no navegador local
- abertura de URLs no navegador local
- endpoint unificado de comando (`POST /execute`)
- healthcheck local (`GET /health`)

## Subir o serviço

```bash
npm install express cors open
node server.js
```

Ou, a partir da raiz do repositório:

```powershell
npm run start:universal-llm-extension
```

## Endpoints

### `GET /health`

Retorna status, porta e comandos suportados.

### `POST /execute`

Payload:

```json
{
  "command": "web_search",
  "payload": {
    "query": "jurisprudencia atraso voo dano moral"
  }
}
```

Comandos suportados:

- `health_check`
- `search_files`
- `web_search`
- `open_url`

## Integração com o ai-core

Defina:

```env
UNIVERSAL_LLM_EXTENSION_BASE_URL=http://127.0.0.1:32123
```

Então o runtime local do `ai-core` pode acionar:

```http
POST /v1/browser/execute
```

## Integração com Copilot e AI Task

Com o provider `local` apontando para o `ai-core`, o fluxo fica:

1. Copilot ou AI Task envia conversa para `/api/admin-lawdesk-chat`
2. o app usa o provider `local`
3. o provider `local` chama `ai-core /v1/messages`
4. o `ai-core` pode usar o bridge local do navegador em `/v1/browser/execute`

## Segurança

- o serviço só roda localmente
- a navegação acontece no navegador da máquina do operador
- a busca de arquivos depende do caminho base autorizado
