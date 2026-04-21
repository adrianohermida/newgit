# Universal LLM Assistant Extension

Bridge local para chat, tasks e automacao de navegador com provider local, cloud e Cloudflare.

## Fonte da extensao

- a fonte primaria da extensao fica em `universal-llm-extension/extension-app`
- `_tmp_universal_llm_assistant` permanece apenas como fallback legado de transicao
- o build resolve a fonte ativa automaticamente por `extension-paths.js`

## Capacidades atuais

- chat com provider local configuravel
- tasks auditaveis com passos e aprovacao
- screenshots e uploads
- gravacao e replay
- busca local de arquivos e comandos locais autorizados
- healthcheck e diagnosticos

## Subir o servico

```bash
npm install
node server.js
```

Ou, a partir da raiz do repositorio:

```powershell
npm run start:universal-llm-extension
```

## Build da extensao

```bash
node build-all.js
```

Artefato gerado:

- `dist/universal-llm-assistant-v<versao>.zip`

## Configuracao do provider local

O provider local agora e configurado por:

- `runtimeUrl`
- `chatPath`
- `executePath`
- `providerLabel`
- `runtimeModel`

Padrao atual:

- URL base: `http://127.0.0.1:8000`
- chat: `/v1/messages`
- execucao: `/execute`

## Endpoints principais

- `GET /health`
- `GET /settings`
- `POST /settings`
- `GET /settings/local-models`
- `POST /chat`
- `POST /tasks/run`
- `POST /screenshot`
- `POST /upload`
- `POST /record`
- `GET /download`

## Integracao

O bridge nao precisa mais assumir `ai-core` como unica engine.

O fluxo recomendado e:

1. a UI conversa com `POST /chat`
2. tasks operacionais disparam `POST /tasks/run`
3. o provider local resolve chat em `chatPath`
4. o executor local resolve automacao em `executePath`

Isso facilita migrar o modulo para outros repositorios ou outros runtimes locais compativeis.
