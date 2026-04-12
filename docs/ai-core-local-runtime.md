# ai-core Local Runtime

Runtime local do `ai-core` para servir o provider `local` do Copilot e do AI Task, com ponte opcional para a Universal LLM Assistant.

## O que este runtime expõe

- `GET /health`
- `GET /v1/providers`
- `POST /execute`
- `POST /rag-context`
- `POST /v1/messages`
- `POST /v1/browser/execute`

## Objetivo de arquitetura

- `custom`: AetherLab remoto publicado, hoje apoiado no worker HMADV IA.
- `cloudflare`: execução direta do Workers AI no backend web.
- `local`: ai-core rodando na sua máquina, podendo usar:
  - um endpoint local OpenAI-compatible mais rápido que Ollama
  - Ollama como fallback
  - a Universal LLM Assistant para web search, abrir URL e busca local de arquivos

## Variáveis principais

```env
AICORE_API_BASE_URL=http://127.0.0.1:8000
AI_CORE_DEFAULT_PROVIDER=local

AICORE_LOCAL_LLM_BASE_URL=http://127.0.0.1:11434
AICORE_LOCAL_LLM_MODEL=aetherlab-legal-local-v1
AICORE_LOCAL_LLM_API_KEY=
AICORE_LOCAL_LLM_AUTH_TOKEN=

AICORE_CLOUD_BASE_URL=https://ai.hermidamaia.adv.br
AICORE_CLOUD_MODEL=aetherlab-legal-v1
AICORE_CLOUD_API_KEY=
AICORE_CLOUD_AUTH_TOKEN=

UNIVERSAL_LLM_EXTENSION_BASE_URL=http://127.0.0.1:32123
UNIVERSAL_LLM_DEFAULT_BASE_PATH=D:\\Obsidian\\hermidamaia
```

## Execução local

No diretório `ai-core`:

```powershell
python -m pip install -e .
python -m uvicorn api.app:app --host 0.0.0.0 --port 8000
```

Ou, a partir da raiz do repositório:

```powershell
npm run setup:ai-core-local
npm run start:ai-core-local
```

Se a porta `8000` estiver ocupada, o script local tenta `8010` e depois `8020`, gravando o endpoint real em `.ai-core-local-runtime.json`.

No diretório `universal-llm-extension`:

```powershell
node server.js
```

## Como o app principal consome isso

Configure o provider `local` do Pages/app com:

```env
LOCAL_LLM_BASE_URL=http://127.0.0.1:8000
LOCAL_LLM_MODEL=aetherlab-legal-local-v1
LOCAL_LLM_API_KEY=
LOCAL_LLM_AUTH_TOKEN=
```

Para Ollama e a maioria dos runtimes locais, `LOCAL_LLM_API_KEY` e `LOCAL_LLM_AUTH_TOKEN` podem ficar vazios.

Assim, o Copilot e o AI Task continuam usando `/api/admin-lawdesk-chat`, mas quando o provider selecionado for `local` eles vão conversar com o `ai-core` local via `/v1/messages`.

## Browser automation

O runtime local também expõe:

```http
POST /v1/browser/execute
```

Exemplo:

```json
{
  "command": "web_search",
  "payload": {
    "query": "jurisprudencia dano moral atraso voo stj"
  }
}
```

Comandos suportados atualmente:

- `health_check`
- `search_files`
- `web_search`
- `open_url`

## Próximos passos recomendados

- adicionar um endpoint local de modelo AetherLab próprio para substituir o fallback Ollama
- plugar `task_run_start` do AI Task em ferramentas explícitas de browser/files quando a missão exigir navegação
- consolidar observabilidade do `ai-core` e da extensão no mesmo painel técnico

- subir `supabase start` quando quisermos persistÃªncia estruturada 100% offline

## Compatibilidade do provider local

O `ai-core` aceita runtimes locais nestes formatos:

- `Anthropic-compatible` via `POST /v1/messages`
- `OpenAI-compatible` via `GET /v1/models` e `POST /v1/chat/completions`
- `Ollama` via `GET /api/tags` e `POST /api/chat`

Assim, o provider `local` do Copilot e do AI Task pode continuar único mesmo quando o modelo estiver servido por uma stack diferente na sua máquina.
