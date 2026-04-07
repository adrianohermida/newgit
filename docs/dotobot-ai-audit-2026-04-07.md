# Auditoria DotoBot AI - 2026-04-07

## Resumo executivo

O projeto ja possui uma base boa para evoluir o DotoBot AI, mas a memoria conversacional e o RAG ainda estao mais "preparados" do que realmente conectados ao fluxo vivo do agente dentro do Freshsales/Freshchat.

O principal gargalo hoje nao e falta de schema. O principal gargalo e acoplamento:

1. o backend de memoria vetorial existe
2. o healthcheck do RAG existe
3. a persistencia de embeddings existe
4. o AgentLab existe
5. a integracao de CRM existe

Mas a memoria ainda nao esta plugada de forma consistente nos pontos que realmente respondem ao usuario.

## O que ja existe e e valioso

### AgentLab

- cockpit administrativo de governanca, treinamento, workflows, knowledge, evaluation, environment e conversations
- fila de melhoria viva
- catalogo de agentes
- telemetria do widget Freshchat
- automacao de CRM, templates, dispatch e fila de acao

### Freshsales

- probes e adaptadores para `contacts`, `sales_accounts`, `deals`, `sales_activities`
- snapshots locais
- schema mapeado
- painel interno com operacao de jornada, agendamento, presenca, Zoom e CRM

### Freshchat Web Messenger

- widget no site funcionando
- JWT ativo
- host do widget identificado
- telemetria de uso do widget no AgentLab

### Memoria/RAG do DotoBot

- tabela vetorial `dotobot_memory_embeddings`
- RPCs:
  - `upsert_dotobot_memory_embedding`
  - `search_dotobot_memory_embeddings`
- healthcheck em `lib/lawdesk/rag.js`
- fallback para Obsidian
- task runs em:
  - `dotobot_task_runs`
  - `dotobot_task_run_events`
- function Supabase:
  - `dotobot-embed`

## Achados criticos

### 1. O RAG existe, mas nao esta plugado no fluxo vivo do agente

No repo existe:

- `retrieveDotobotRagContext(...)`
- `persistDotobotMemory(...)`
- `runDotobotRagHealth(...)`

Mas, na auditoria do codigo, eles nao aparecem plugados de forma clara nos handlers reais que respondem o usuario do DotoBot.

Implicacao:

- a memoria existe tecnicamente
- o agente continua se comportando como se tivesse memoria fraca
- o ganho de contexto fica muito abaixo do potencial

### 2. Drift entre repo local e Supabase remoto

No Supabase remoto existem varias Edge Functions ativas que nao estao no repo local, por exemplo:

- `generateAIResponse`
- `processarMensagemChatWidget`
- `invokeLLM`
- varias funcoes operacionais do workspace

No repo local, dentro de `supabase/functions`, hoje aparece somente:

- `dotobot-embed`

Implicacao:

- o comportamento real do agente pode estar fora do versionamento principal
- fica dificil melhorar memoria, workflow e guardrails com seguranca
- existe risco alto de regressao e de conhecimento fragmentado

### 3. Workflow Library do AI Agent Studio nao deve ser tratado como API oficial

Pelas referencias oficiais recentes do Freshworks, AI Agent Studio oferece:

- knowledge sources
- persona
- AI Agent responses
- workflows
- actions library
- skill builder

Mas nao apareceu documentacao publica confiavel para CRUD externo do Workflow Library no estilo "criar/editar skills via API administrativa oficial".

Implicacao:

- a automacao total do `Workflow Library` nao deve ser a aposta principal
- o caminho seguro e usar o AgentLab como fonte de governanca e backlog
- a publicacao final no Freddy continua manual ou semiassistida

### 4. Freshchat administrativo continua sem API valida

O site ja usa bem o Web Messenger com JWT, mas o espelhamento administrativo de conversas do Freshchat ainda depende de:

- `Your chat URL`
- `Your API Key`

Sem isso, o AgentLab nao consegue espelhar 100% das conversas administrativas do Freshchat via REST oficial.

### 5. A memoria juridica ainda nao esta organizada por tipo de conhecimento

Hoje o projeto ja tem bastante estrutura, mas falta separar a memoria em camadas:

- memoria conversacional curta
- memoria de relacionamento/CRM
- memoria juridica estavel
- memoria operacional do escritorio
- memoria de workflow e handoff

Sem essa separacao, o agente mistura:

- FAQ
- historico de conversa
- contexto comercial
- orientacao juridica geral
- sinais processuais

Isso prejudica seguranca juridica e qualidade da resposta.

## O que eu sugiro fazer

## Fase 1 - Conectar memoria ao fluxo real do DotoBot

Objetivo: fazer a memoria funcionar onde a resposta e gerada.

Implementar nos handlers reais do agente:

1. antes de responder:
   - chamar `retrieveDotobotRagContext(...)`
2. depois de responder:
   - chamar `persistDotobotMemory(...)`
3. salvar metadados ricos:
   - `agent_ref`
   - `intent`
   - `knowledge_pack`
   - `workflow`
   - `contact_id`
   - `freshsales_contact_id`
   - `freshchat_conversation_id`
   - `handoff`
   - `confidence`

Resultado esperado:

- memoria de curto e medio prazo real
- reaproveitamento de contexto por sessao e por contato
- melhora imediata na sensacao de continuidade

## Fase 2 - Criar uma arquitetura de memoria em 4 camadas

### Camada A - Conversa

Para cada interacao:

- mensagem do usuario
- resposta do agente
- intent inferida
- handoff
- score de qualidade

Persistencia:

- `agentlab_conversation_threads`
- `agentlab_conversation_messages`
- `dotobot_memory_embeddings`

### Camada B - Relacionamento/CRM

Trazer para o contexto:

- lifecycle stage
- meeting stage
- negotiation stage
- closing stage
- client stage
- ownership
- ultima atividade
- no-show / comparecimento
- proposta enviada / aceita

Persistencia:

- snapshots Freshsales ja existentes
- cache normalizado por contato

### Camada C - Conhecimento juridico-estavel

Separar knowledge packs por tema:

- agendamento
- consulta
- honorarios
- portal e financeiro
- documentos
- status processual geral
- LGPD
- contrato/proposta

Esses itens devem gerar chunks e embeddings proprios, nao depender so de respostas rapidas.

### Camada D - Workflow e handoff

Persistir:

- qual workflow foi usado
- por que houve handoff
- para qual time
- se resolveu ou nao

Isso e essencial para treinar melhor o DotoBot AI vs DotoBot chatbot.

## Fase 3 - Criar um centro de memoria dentro do AgentLab

Adicionar um modulo novo:

- `/interno/agentlab/memoria`

Com:

- saude do RAG
- contagem de memorias
- sessoes com mais contexto
- top intents persistidas
- top gaps de memoria
- historico de retrieval
- historico de persistencia
- falhas de embedding

Esse modulo deve mostrar:

- se o agente esta lembrando
- o que ele esta lembrando
- quando a memoria ficou rasa

## Fase 4 - Criar "Knowledge Packs" operacionais por agente

Separar no AgentLab:

- `dotobot-chatbot`
- `dotobot-ai`

Cada um com:

- quick replies
- intents
- sources
- workflow library backlog
- guardrails
- memoria preferencial

Exemplo:

- chatbot:
  - triagem
  - FAQ
  - agendamento
  - financeiro basico
- agente de IA:
  - contexto de CRM
  - memoria da sessao
  - fluxos com mais profundidade
  - handoff inteligente
  - leitura de sinais juridicos gerais

## Fase 5 - Integracao com AI Agent Studio de forma segura

Como nao devemos depender de API publica instavel para `Workflow Library`, a recomendacao e:

1. manter no `AgentLab` o backlog oficial de:
   - workflows
   - intents
   - knowledge packs
   - handoffs
   - respostas rapidas
2. usar o `AgentLab` como painel de treino, auditoria e governanca
3. publicar no Freddy/AI Agent Studio de forma manual ou semiassistida

Resultado:

- versionamento no repo
- governanca interna
- menos dependencia da UI do Freshworks para pensar a estrategia

## Fase 6 - Ajustes especificos para escritorio de advocacia

### Guardrails obrigatorios

- nunca inventar andamento processual individualizado
- nunca prometer resultado
- nunca substituir orientacao juridica formal
- sempre distinguir:
  - informacao geral
  - status individual
  - triagem comercial
  - suporte financeiro

### Memoria com etica

A memoria do agente deve priorizar:

- proximo passo
- contexto de relacionamento
- historico de agendamento
- preferencias de canal
- estagio de jornada

E evitar:

- inferencias juridicas arriscadas
- consolidar "verdades" processuais sem fonte confiavel

## Prioridade tecnica imediata

### P1

- plugar `retrieveDotobotRagContext` e `persistDotobotMemory` nos handlers reais do agente
- identificar no Supabase remoto as funcoes vivas que hoje respondem o chat e trazer esse codigo para o repo

### P2

- criar modulo `Memoria` no AgentLab
- chunking dos knowledge packs juridicos
- embeddings por fonte

### P3

- espelhar conversas administrativas do Freshchat quando houver `Your chat URL` e `Your API Key`
- correlacionar memoria com conversao comercial

## Conclusao objetiva

Hoje o HMADV ja tem:

- schema
- embeddings
- retrieval
- cockpit
- CRM
- widget JWT

O que falta nao e "mais tecnologia".
O que falta e:

- integrar a memoria no fluxo vivo do agente
- unificar o codigo que hoje esta espalhado entre repo e Supabase remoto
- separar chatbot x agente de IA
- estruturar o conhecimento juridico em packs operacionais

Sem isso, o DotoBot AI continua parecendo "sem memoria", mesmo com a fundacao tecnica praticamente pronta.
