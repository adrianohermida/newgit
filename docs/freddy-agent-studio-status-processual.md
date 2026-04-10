# Freddy AI Agent Studio - Workflow `status_processual`

## Objetivo

Usar o `Freddy Memory Gateway` para que o AI Freddy:

- recupere contexto CRM e judicial do cliente
- use memoria compartilhada do DotoBot
- responda de forma segura
- faca handoff quando houver risco processual ou necessidade de validacao humana

## Pre-requisitos

- `FREDDY_ACTION_SHARED_SECRET` configurado no runtime
- endpoints publicados:
  - `https://hermidamaia.adv.br/functions/api/freddy-get-contact-360`
  - `https://hermidamaia.adv.br/functions/api/freddy-search-memory`
  - `https://hermidamaia.adv.br/functions/api/freddy-save-memory`
  - `https://hermidamaia.adv.br/functions/api/freddy-save-outcome`

## Action 1 - Get Contact 360

### Informacoes a serem utilizadas

Entradas:

- `email` -> `Text`
- `contact_id` -> `Text`
- `process_id` -> `Text`
- `numero_cnj` -> `Text`
- `query` -> `Text`
- `top_k` -> `Number`

### Conecte sua API

- `Tipo de API`: `POST`
- `URL da API`: `https://hermidamaia.adv.br/functions/api/freddy-get-contact-360`

Headers:

- `Content-Type` = `application/json`
- `x-freddy-secret` = `<valor de FREDDY_ACTION_SHARED_SECRET>`

Body:

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

### Definir valores de saida

Criar os seguintes outputs:

- `summary` -> `data.summary`
- `contact_name` -> `data.contact.display_name`
- `contact_email` -> `data.identifiers.email`
- `account_name` -> `data.sales_account.name`
- `safe_status` -> `data.judicial.safe_process_status.label`
- `safe_status_caution` -> `data.judicial.safe_process_status.caution`
- `latest_activity_at` -> `data.judicial.safe_process_status.latest_activity_at`
- `stale_days` -> `data.judicial.safe_process_status.stale_days`
- `process_relations_total` -> `data.judicial.process_relations.total_related`
- `process_relation_tags` -> `data.judicial.process_relations.relation_tags`
- `client_parties` -> `data.judicial.parties.client_parties`
- `recent_publications` -> `data.judicial.recent_publications`
- `recent_documents` -> `data.judicial.recent_documents`
- `memory_matches` -> `data.memory_matches`
- `deal_list` -> `data.deals`
- `activity_list` -> `data.activities`

## Action 2 - Search Shared Memory

### Informacoes a serem utilizadas

Entradas:

- `query` -> `Text`
- `top_k` -> `Number`

### Conecte sua API

- `Tipo de API`: `POST`
- `URL da API`: `https://hermidamaia.adv.br/functions/api/freddy-search-memory`

Headers:

- `Content-Type` = `application/json`
- `x-freddy-secret` = `<valor de FREDDY_ACTION_SHARED_SECRET>`

Body:

```json
{
  "query": "{{user_query}}",
  "top_k": 8
}
```

### Definir valores de saida

- `memory_summary` -> `data.summary`
- `memory_hits` -> `data.matches`

## Action 3 - Save Shared Memory

- `Tipo de API`: `POST`
- `URL da API`: `https://hermidamaia.adv.br/functions/api/freddy-save-memory`

Headers:

- `Content-Type` = `application/json`
- `x-freddy-secret` = `<valor de FREDDY_ACTION_SHARED_SECRET>`

Body:

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
  "route": "/freshsales/freddy/status-processual"
}
```

## Action 4 - Save Conversation Outcome

- `Tipo de API`: `POST`
- `URL da API`: `https://hermidamaia.adv.br/functions/api/freddy-save-outcome`

Headers:

- `Content-Type` = `application/json`
- `x-freddy-secret` = `<valor de FREDDY_ACTION_SHARED_SECRET>`

Body:

```json
{
  "agent_ref": "freddy-ai",
  "category": "processual_handoff",
  "severity": "media",
  "status": "open",
  "title": "Handoff processual sensivel",
  "description": "Pergunta exige validacao humana do time processual.",
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

## Instrucao principal do workflow

Use este texto como base nas instrucoes do workflow:

```text
Voce deve consultar a action Get Contact 360 antes de responder perguntas processuais, publicacoes, documentos, audiencia ou status.

Use o campo summary como resumo principal de contexto.
Use judicial.safe_process_status apenas como contexto operacional seguro.
Use judicial.recent_publications e judicial.recent_documents para trazer contexto recente, sem inventar interpretacao juridica.
Use judicial.parties e judicial.process_relations para entender partes, CPF/CNPJ e relacoes entre processos.
Use memory_matches e Search Shared Memory para continuidade de conversa e memoria compartilhada.

Nunca invente andamento, prazo, estrategia ou probabilidade de exito.
Nunca transforme contexto operacional em conclusao juridica individualizada.
Se houver pedido de interpretacao individualizada, urgencia, contradicao de dados, ausencia de contexto suficiente ou risco processual, faca handoff para o time processual e registre Save Conversation Outcome.

Ao final de respostas relevantes, execute Save Shared Memory.
```

## Regra de resposta segura

Use este padrão:

- se houver contexto suficiente:
  - resuma o que foi encontrado
  - deixe claro que se trata de contexto operacional
  - ofereca encaminhamento ao time processual quando a pergunta exigir leitura individualizada

- se nao houver contexto suficiente:
  - diga que nao ha base segura suficiente naquele momento
  - solicite o identificador do processo ou confirme o cadastro
  - se persistir a incerteza, faca handoff

## Quando fazer handoff obrigatorio

- pedido de analise individualizada do processo
- contradicao entre memoria, CRM e fala do cliente
- risco emocional, reclamacao ou escalacao
- ausencia de processo identificado com seguranca
- pedido sobre prazo, recurso, estrategia ou consequencia juridica concreta

## Exemplo de resposta segura

```text
Encontrei contexto relacionado ao seu cadastro e ao processo vinculado, com movimentacoes e publicacoes recentes. Posso te adiantar esse panorama de forma operacional, mas para uma leitura individualizada do andamento e das implicacoes juridicas o ideal e validar com o nosso time processual. Se voce quiser, eu ja registro esse encaminhamento com o contexto da conversa.
```
