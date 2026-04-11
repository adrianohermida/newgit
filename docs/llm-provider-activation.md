# Ativacao dos Providers LLM

Este projeto suporta 4 providers operacionais no mesmo fluxo de `AI Task`, `Dotobot` e `/llm-test`:

- `gpt`
- `local`
- `cloudflare`
- `custom`

## 1. Provider padrao

Use a env abaixo para definir qual provider deve abrir por padrao no produto:

```env
LAWDESK_DEFAULT_PROVIDER=gpt
```

Valores aceitos:

- `gpt`
- `local`
- `cloudflare`
- `custom`

## 2. Backend principal (`gpt`)

O provider `gpt` usa o backend HTTP atual e valida:

- `GET /health`
- `POST /execute`
- fallback para `POST /v1/execute`

```env
PROCESS_AI_BASE=https://seu-backend
HMDAV_AI_SHARED_SECRET=seu-segredo
```

Se `PROCESS_AI_BASE` estiver ausente, o provider aparece como nao configurado.

Se `health` responder, mas `/execute` e `/v1/execute` falharem, o provider passa a aparecer como `degraded`.
Esse cenario normalmente indica deploy ou roteamento divergente no worker publicado.

## 3. LLM propria (`local`)

O provider `local` espera um endpoint compativel com:

- `POST /v1/messages`

Formato esperado: semelhante ao runtime em `ai-core/runtime/crates/api`.

Objetivo recomendado:

- usar um backend rodando na sua propria maquina
- aproveitar seu hardware local como origem da inferencia
- manter o mesmo contrato HTTP para `AI Task`, `Dotobot` e `/llm-test`

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
- `AICORE_API_BASE_URL`
- `DOTOBOT_PYTHON_API_BASE`

Observacoes importantes:

- hoje o produto ja sabe consumir um endpoint local em `http://127.0.0.1:8000/v1/messages`
- isso nao exige mudar o frontend depois; basta apontar o provider `local` para o endpoint da sua maquina
- o backend local pode ser:
  - um bridge proprio da AetherLab
  - um runtime OpenAI-compatible exposto na sua rede local
  - um gateway que use Ollama ou outro motor local por baixo

Diagnostico rapido:

```powershell
npm run diagnose:local-llm
```

Se quiser validar outra URL:

```powershell
npm run diagnose:local-llm -- -BaseUrl http://127.0.0.1:8000 -Model aetherlab-local-v1
```

## 4. Cloudflare Workers AI (`cloudflare`)

O provider `cloudflare` depende do binding `AI` no runtime do Worker ou Pages.

Envs uteis:

```env
CLOUDFLARE_WORKERS_AI_ENABLED=true
CLOUDFLARE_WORKERS_AI_MODEL=@cf/meta/llama-3.1-8b-instruct
```

Observacao:

- o health fica `operational` quando o binding `AI` esta realmente disponivel
- apenas a flag, sem binding, nao garante execucao real

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

Tambem e possivel validar:

- em `/interno/agentlab/environment`
- pelo seletor do `AI Task`
- pelo seletor do `Dotobot`

## 7. Interpretacao rapida

- `operational`: provider pronto para uso
- `degraded`: configurado, mas com falha de health ou da sonda de execucao
- `failed`: nao configurado ou indisponivel

## 8. Checklist de deploy do `gpt`

Para o provider principal, valide nesta ordem:

1. `GET https://seu-backend/health`
2. `POST https://seu-backend/execute`
3. `POST https://seu-backend/v1/execute`
4. `/llm-test` com provider `gpt`

Se `health` estiver OK e a execucao falhar:

1. revise o deploy publicado do worker
2. confirme se o custom domain aponta para a versao correta
3. compare o remoto com `workers/hmadv-process-ai/src/index.ts`
