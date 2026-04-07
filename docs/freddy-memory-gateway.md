# Freddy Memory Gateway

## Objetivo

Permitir que o AI Freddy no Freshsales use a mesma memoria compartilhada do DotoBot e do AgentLab.

Esta camada expõe 4 endpoints para cadastrar em `AI Agent Studio > Actions Library`:

- `freddy-get-contact-360`
- `freddy-search-memory`
- `freddy-save-memory`
- `freddy-save-outcome`

## Auth recomendada

Use um secret compartilhado no Pages:

- `FREDDY_ACTION_SHARED_SECRET`

Header recomendado na Action:

- `x-freddy-secret: <seu_secret>`

Aceita tambem:

- `x-hmadv-secret`
- `x-shared-secret`
- `Authorization: Bearer <secret>`

## Endpoints

### 1. Get Contact 360

URL:

- `/functions/api/freddy-get-contact-360`

Body sugerido:

```json
{
  "email": "{{customer.email}}",
  "contact_id": "{{customer.contact_id}}",
  "query": "{{user_query}}",
  "top_k": 6
}
```

Retorna:

- contact
- sales_account
- deals
- tasks
- notes
- documents
- activities
- rag.matches
- summary

Uso:

- chamar no começo da conversa
- chamar antes de responder duvidas sensíveis

### 2. Search Memory

URL:

- `/functions/api/freddy-search-memory`

Body sugerido:

```json
{
  "query": "{{user_query}}",
  "top_k": 8
}
```

Uso:

- buscar memórias relevantes antes da resposta final

### 3. Save Memory

URL:

- `/functions/api/freddy-save-memory`

Body sugerido:

```json
{
  "session_id": "{{conversation.id}}",
  "agent_ref": "freddy-ai",
  "email": "{{customer.email}}",
  "contact_id": "{{customer.contact_id}}",
  "account_id": "{{customer.account_id}}",
  "deal_id": "{{deal.id}}",
  "query": "{{user_query}}",
  "response_text": "{{agent_response}}",
  "status": "ok",
  "route": "/freshsales/freddy"
}
```

Uso:

- salvar memoria apos respostas importantes
- salvar resumo de conversa
- salvar contexto comercial e de atendimento

### 4. Save Outcome

URL:

- `/functions/api/freddy-save-outcome`

Body sugerido:

```json
{
  "agent_ref": "freddy-ai",
  "category": "conversation_outcome",
  "severity": "media",
  "status": "open",
  "title": "Handoff processual sensivel",
  "description": "Cliente pediu status individualizado de processo.",
  "email": "{{customer.email}}",
  "contact_id": "{{customer.contact_id}}",
  "account_id": "{{customer.account_id}}",
  "deal_id": "{{deal.id}}",
  "workflow": "status_processual",
  "intent": "status_processual",
  "handoff": "time_processual",
  "query": "{{user_query}}",
  "response_text": "{{agent_response}}"
}
```

Uso:

- registrar outcome/handoff/incidente
- alimentar governanca do AgentLab
- manter historico operacional e de melhoria

## Fluxo recomendado no AI Agent Studio

### Inicio da conversa

1. `Get Contact 360`
2. se houver dados relevantes, usar o `summary`

### Antes da resposta principal

1. `Search Memory`
2. combinar:
   - contexto do contato
   - memoria RAG
   - pergunta atual

### Depois da resposta

1. `Save Memory`

### Se houver handoff, erro ou risco juridico

1. `Save Outcome`

## Regras de uso para escritorio juridico

- nunca responder status processual individualizado sem validacao
- usar `Get Contact 360` para evitar perguntar tudo de novo
- usar `Search Memory` para recuperar contexto relevante
- usar `Save Memory` para consolidar historico
- usar `Save Outcome` para incidentes, handoffs e aprendizado

## Observacao importante

Esta camada nao substitui o `Workflow Library` do Freshworks. Ela funciona como backend de memoria e contexto para o AI Freddy, enquanto o AgentLab continua sendo a camada de governanca e melhoria.
