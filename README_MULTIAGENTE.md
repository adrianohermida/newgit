# Dotobot Multiagente — Guia de Integração e Uso

## Endpoints

### Orquestrador Python
- **POST** `/orchestrate`
  - **Body:**
    ```json
    {
      "input": "mensagem do usuário",
      "context": { "chave": "valor" }
    }
    ```
  - **Resposta:**
    ```json
    {
      "result": [ ...etapas multiagente... ]
    }
    ```
  - **Streaming:**
    - O frontend consome a resposta em chunks, exibindo status incremental (thinking, running, ok).

### API Frontend
- **POST** `/functions/api/admin-lawdesk-chat`
  - Encaminha para o orquestrador Python se a flag `pythonOrchestrator` estiver ativada.

---

## Variáveis de Ambiente Essenciais

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `DOTOBOT_OBSIDIAN_VAULT_PATH` (opcional, para persistência local Obsidian)

Preencha em `.dev.vars` e `.env.example`.

---

## Instruções de Uso

1. **Configuração**
   - Preencha `.dev.vars` e `.env.example` com as variáveis acima.
   - Garanta que o backend Python está rodando (`uvicorn ai-core.api_orchestrate:app --reload`).
   - Ative a flag `pythonOrchestrator` no sistema de feature flags.

2. **Execução**
   - Use o painel Dotobot normalmente.
   - O chat exibirá status incremental (thinking → running → ok) e resposta multiagente.

3. **Persistência**
   - Dados são gravados no Supabase (`dotobot_memory_embeddings`) e/ou arquivos markdown no Obsidian.
   - Consulte o Supabase Studio ou a pasta do Obsidian para validar.

---

## Exemplo de Payload

```json
{
  "input": "Resuma este processo e gere uma petição.",
  "context": { "user": "dr.adriano" }
}
```

---

## Observações
- O sistema permite fallback para o fluxo antigo via feature flag.
- O streaming no frontend garante UX estilo ChatGPT/Claude.
- O código está pronto para integração com LLM real e expansão de skills.
