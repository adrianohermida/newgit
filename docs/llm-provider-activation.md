# Ativação dos Providers LLM

Este projeto agora suporta 4 providers operacionais no mesmo fluxo de `AI Task`, `Dotobot` e `/llm-test`:

- `gpt`
- `local`
- `cloudflare`
- `custom`

## 1. Provider padrão

Use a env abaixo para definir qual provider deve abrir por padrão no produto:

```env
LAWDESK_DEFAULT_PROVIDER=gpt
```

Valores aceitos:

- `gpt`
- `local`
- `cloudflare`
- `custom`

## 2. Backend principal (`gpt`)

O provider `gpt` usa o backend HTTP atual e consulta `GET /health`.

```env
PROCESS_AI_BASE=https://seu-backend
HMDAV_AI_SHARED_SECRET=seu-segredo
```

Se `PROCESS_AI_BASE` estiver ausente, o provider aparece como não configurado.

## 3. LLM própria (`local`)

O provider `local` espera um endpoint compatível com:

- `POST /v1/messages`

Formato esperado: semelhante ao runtime em `ai-core/runtime/crates/api`.

Envs:

```env
LOCAL_LLM_BASE_URL=http://127.0.0.1:8000
LOCAL_LLM_API_KEY=se-necessario
LOCAL_LLM_AUTH_TOKEN=opcional
LOCAL_LLM_MODEL=hermida-local-14b
LOCAL_LLM_MAX_TOKENS=1400
```

Aliases suportados:

- `LLM_BASE_URL`
- `LLM_API_KEY`
- `LLM_AUTH_TOKEN`
- `LLM_MODEL`
- `LLM_MAX_TOKENS`

## 4. Cloudflare Workers AI (`cloudflare`)

O provider `cloudflare` depende do binding `AI` no runtime do Worker/Pages.

Envs úteis:

```env
CLOUDFLARE_WORKERS_AI_ENABLED=true
CLOUDFLARE_WORKERS_AI_MODEL=@cf/meta/llama-3.1-8b-instruct
```

Observação:

- o health fica `operational` quando o binding `AI` está realmente disponível
- apenas a flag, sem binding, não garante execução real

## 5. Endpoint custom (`custom`)

O provider `custom` usa o mesmo contrato do provider `local`:

```env
CUSTOM_LLM_BASE_URL=https://seu-endpoint
CUSTOM_LLM_API_KEY=se-necessario
CUSTOM_LLM_AUTH_TOKEN=opcional
CUSTOM_LLM_MODEL=custom-model
CUSTOM_LLM_MAX_TOKENS=1400
```

## 6. Como validar

1. Abra `/llm-test`
2. Escolha o provider
3. Rode o smoke test
4. Confirme:
   - `status`
   - `source`
   - `model`
   - resposta final

Também é possível validar:

- em `/interno/agentlab/environment`
- pelo seletor do `AI Task`
- pelo seletor do `Dotobot`

## 7. Interpretação rápida

- `operational`: provider pronto para uso
- `degraded`: configurado, mas com falha de health/probe
- `failed`: não configurado ou indisponível
