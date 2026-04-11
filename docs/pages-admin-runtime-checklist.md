# Pages Admin Runtime Checklist

## Contexto

Este projeto publica frontend estatico em Cloudflare Pages com `out/`, mas o backend administrativo de producao roda em `functions/api/*`.

Isso significa:

- `pages/api/*` ajuda em desenvolvimento local e em alguns cenarios Node.
- em producao Pages, a verdade canonica e `functions/api/*`.
- qualquer correcao critica para `AI Task`, `Dotobot` e `LLM Test` precisa existir em `functions/api/*`.

## Rotas criticas

- `/api/admin-lawdesk-providers`
- `/api/admin-lawdesk-chat`
- `/api/admin-dotobot-rag-health`

## Sintomas classicos quando o runtime certo nao foi publicado

- `LLM Test` fica sem catalogo de providers
- `provider health` cai em fallback ou mostra erro generico
- `RAG health` falha sem `errorType`
- `gpt` parece quebrado mesmo com o worker `ai.hermidamaia.adv.br` respondendo

## Validacao rapida

### Gate unico recomendado

Com envs carregadas no terminal:

```powershell
$env:LAW_DESK_ADMIN_TOKEN="SEU_TOKEN_ADMIN"
$env:PROCESS_AI_SHARED_SECRET="SEU_SHARED_SECRET"
$env:PROCESS_AI_BASE="https://ai.hermidamaia.adv.br"
npm run gate:lawdesk-stack
```

O gate executa:

- auditoria de envs criticas do Pages e do worker
- testes locais de `providers` e `llm-test`
- validacao do runtime `functions/api`
- diagnostico do worker `hmadv-process-ai`
- verificacao consolidada de Pages + IA

Se preferir, tambem aceita parametros explicitos:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/release-gate-lawdesk.ps1 -PagesBaseUrl "https://hermidamaia.adv.br" -AiBaseUrl "https://ai.hermidamaia.adv.br" -AdminToken "SEU_TOKEN" -SharedSecret "SEU_SHARED_SECRET"
```

### 1. Backend HMADV IA

```powershell
npm run diagnose:hmadv-ai
```

Esperado:

- `/health` responde
- `/execute` responde
- `/v1/execute` responde

### 2. Runtime administrativo do Pages

Sem token admin:

```powershell
npm run diagnose:pages-admin
```

Com token admin:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/diagnose-pages-admin-runtime.ps1 -BaseUrl "https://hermidamaia.adv.br" -AdminToken "SEU_TOKEN"
```

Verificacao consolidada do stack:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/postdeploy-verify-lawdesk-stack.ps1 -PagesBaseUrl "https://hermidamaia.adv.br" -AiBaseUrl "https://ai.hermidamaia.adv.br" -AdminToken "SEU_TOKEN"
```

Esperado:

- `/api/admin-lawdesk-providers?include_health=1` nao retorna 404
- `/api/admin-lawdesk-chat` responde com erro de negocio ou sucesso, nao com rota ausente
- `/api/admin-dotobot-rag-health` responde com `errorType` quando houver falha de auth/config

## Ordem recomendada de deploy

1. publicar o worker `hmadv-process-ai`
2. validar `diagnose:hmadv-ai`
3. publicar o projeto `newgit-pages`
4. validar `diagnose:pages-admin`
5. validar `verify:lawdesk-stack` com token admin
6. abrir o `LLM Test` e repetir o smoke test do provider `gpt`

## Diagnostico atual

- o worker publico `ai.hermidamaia.adv.br` ja responde `/execute` e `/v1/execute`
- portanto, se o provider `gpt` continuar falhando no `LLM Test`, a suspeita principal passa a ser:
  - Pages sem deploy novo
  - `functions/api` desatualizado
  - `PROCESS_AI_BASE` ou `LAWDESK_AI_BASE_URL` divergente no ambiente
  - cache/build antigo no frontend
