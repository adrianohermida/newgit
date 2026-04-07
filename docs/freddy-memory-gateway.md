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
  "process_id": "{{customer.process_id}}",
  "numero_cnj": "{{customer.numero_cnj}}",
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
- judicial.safe_process_status
- judicial.process_relations
- judicial.parties
- judicial.process_portfolio
- judicial.recent_publications
- judicial.recent_documents
- judicial.process_detail
- judicial.dashboard
- rag.matches
- memory_matches
- summary

Uso:

- chamar no começo da conversa
- chamar antes de responder duvidas sensíveis
- usar `judicial.summary` quando a conversa envolver processo, publicacao, audiencia, documento ou status
- usar `judicial.safe_process_status` como contexto operacional, nunca como base unica para resposta juridica conclusiva
- usar `judicial.parties` e `judicial.process_relations` para entender vinculos de parte, CNJ e processos relacionados

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

## Cadastro exato no AI Agent Studio

### Action 1: Get Contact 360

**Nome sugerido**

- `Get Contact 360`

**Descricao sugerida**

- `Busca contexto unificado do cliente no CRM, memoria RAG e carteira judicial, incluindo processos, publicacoes, documentos, partes e status processual seguro.`

**Entradas sugeridas**

- `email` (`Text`, opcional)
- `contact_id` (`Text`, opcional)
- `process_id` (`Text`, opcional)
- `numero_cnj` (`Text`, opcional)
- `query` (`Text`, opcional)
- `top_k` (`Number`, opcional)

**Conectar API**

- `Method`: `POST`
- `URL`: `https://hermidamaia.adv.br/functions/api/freddy-get-contact-360`

**Headers**

- `Content-Type: application/json`
- `x-freddy-secret: <valor de FREDDY_ACTION_SHARED_SECRET>`

**Body**

```json
{
  "email": "{{customer.email}}",
  "contact_id": "{{customer.contact_id}}",
  "process_id": "{{conversation.process_id}}",
  "numero_cnj": "{{conversation.numero_cnj}}",
  "query": "{{user_query}}",
  "top_k": 6
}
```

**Campos de saida recomendados**

- `data.summary`
- `data.contact`
- `data.sales_account`
- `data.deals`
- `data.activities`
- `data.judicial.summary`
- `data.judicial.safe_process_status`
- `data.judicial.process_portfolio`
- `data.judicial.process_detail`
- `data.judicial.parties`
- `data.judicial.process_relations`
- `data.judicial.recent_publications`
- `data.judicial.recent_documents`
- `data.memory_matches`

### Action 2: Search Memory

**Nome sugerido**

- `Search Shared Memory`

**Descricao sugerida**

- `Busca memoria conversacional e operacional relevante para a pergunta atual.`

**Entradas sugeridas**

- `query` (`Text`, obrigatorio)
- `top_k` (`Number`, opcional)

**Conectar API**

- `Method`: `POST`
- `URL`: `https://hermidamaia.adv.br/functions/api/freddy-search-memory`

**Headers**

- `Content-Type: application/json`
- `x-freddy-secret: <valor de FREDDY_ACTION_SHARED_SECRET>`

**Body**

```json
{
  "query": "{{user_query}}",
  "top_k": 8
}
```

### Action 3: Save Memory

**Nome sugerido**

- `Save Shared Memory`

**Descricao sugerida**

- `Salva a interacao atual na memoria compartilhada para reaproveitamento futuro pelo DotoBot e AI Freddy.`

**Conectar API**

- `Method`: `POST`
- `URL`: `https://hermidamaia.adv.br/functions/api/freddy-save-memory`

**Headers**

- `Content-Type: application/json`
- `x-freddy-secret: <valor de FREDDY_ACTION_SHARED_SECRET>`

**Body**

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

### Action 4: Save Outcome

**Nome sugerido**

- `Save Conversation Outcome`

**Descricao sugerida**

- `Registra handoff, risco operacional, falha ou outcome importante para governanca do AgentLab.`

**Conectar API**

- `Method`: `POST`
- `URL`: `https://hermidamaia.adv.br/functions/api/freddy-save-outcome`

**Headers**

- `Content-Type: application/json`
- `x-freddy-secret: <valor de FREDDY_ACTION_SHARED_SECRET>`

**Body**

```json
{
  "agent_ref": "freddy-ai",
  "category": "conversation_outcome",
  "severity": "media",
  "status": "open",
  "title": "Handoff processual sensivel",
  "description": "Cliente pediu status processual individualizado.",
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

## Instrucoes de workflow para o Freddy

### Workflow: Status processual sensivel

**Objetivo**

- responder de forma segura sem inventar andamento
- usar memoria e contexto do processo
- transferir quando a resposta depender de validacao humana

**Sequencia recomendada**

1. Execute `Get Contact 360`
2. Se a pergunta pedir historico, contexto ou continuidade, execute `Search Shared Memory`
3. Monte a resposta usando:
   - `data.summary`
   - `data.judicial.safe_process_status`
   - `data.judicial.recent_publications[0..2]`
   - `data.judicial.process_detail.process`
   - `data.memory_matches`
4. Nunca afirmar interpretacao juridica conclusiva nem promessa de resultado
5. Se houver pedido de analise individualizada, divergencia, urgencia ou risco, execute `Save Conversation Outcome` e faca handoff
6. Ao final, execute `Save Shared Memory`

**Instrucao sugerida para o AI Agent**

- `Use o contexto retornado pela acao Get Contact 360 como fonte principal de memoria e CRM. Considere judicial.safe_process_status apenas como contexto operacional seguro. Nunca invente andamento, prazo, decisao ou estrategia. Se a pergunta exigir leitura individualizada do processo, resuma o que foi localizado, diga que o time processual precisa validar e faca handoff com contexto.`

### Workflow: Honorarios e financeiro

**Sequencia recomendada**

1. Execute `Get Contact 360`
2. Opcionalmente execute `Search Shared Memory`
3. Use CRM + memoria para evitar repetir perguntas
4. Se houver tema sensivel de cobranca, promessa ou excecao comercial, handoff para financeiro
5. Execute `Save Shared Memory`

### Workflow: Agendamento e remarcacao

**Sequencia recomendada**

1. Execute `Get Contact 360`
2. Use `contact`, `sales_account`, `activities` e `memory_matches` para entender historico
3. Se houver no-show, remarcacao ou urgencia, usar isso no fluxo
4. Ao final, execute `Save Shared Memory`

## Regras operacionais recomendadas

- Se `data.judicial.safe_process_status.alerts` vier preenchido, priorize linguagem cautelosa e objetiva
- Se `data.judicial.process_relations.total_related > 0`, trate o processo como potencialmente relacionado a outros CNJs e evite simplificacoes
- Se `data.judicial.parties.client_parties` estiver vazio, nao assuma que o cliente autenticado e parte principal sem validacao
- Se `data.memory_matches` trouxer contexto relevante, use isso para continuidade, nao para criar fato novo
- Se houver conflito entre CRM, memoria e fala do cliente, o fluxo correto e handoff
