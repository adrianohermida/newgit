# Diagnostico e plano de melhoria do AI Freddy

## Situacao atual encontrada no projeto

- O site carrega um script do ecossistema Freshworks, mas com chat desativado em [`pages/_app.js`](D:\Github\newgit\pages\_app.js).
- O canal principal visivel no site ainda e WhatsApp hardcoded em [`components/WhatsappWidgetCircle.js`](D:\Github\newgit\components\WhatsappWidgetCircle.js) e [`components/WhatsappWidget.js`](D:\Github\newgit\components\WhatsappWidget.js).
- O atendimento estruturado hoje e abertura de ticket no Freshdesk por [`functions/api/freshdesk-ticket.js`](D:\Github\newgit\functions\api\freshdesk-ticket.js).
- A base de conhecimento publica e estatica, com FAQs fixos em [`pages/faq.js`](D:\Github\newgit\pages\faq.js) e [`components/servicos/ServicosFAQ.js`](D:\Github\newgit\components\servicos\ServicosFAQ.js).
- Nao foi encontrada implementacao de RAG, embeddings, roteamento por intencao, memoria de conversa, score de lead ou handoff automatico para comercial/juridico.

## Diagnostico

O problema nao e apenas configuracao do bot. Hoje a stack mistura:

- WhatsApp como contato rapido
- Freshdesk como ticketing
- Freshworks/Freshsales apenas como script de rastreamento
- FAQ estatica sem governanca nem resposta contextual

Isso gera um fluxo ruim porque o visitante muda de canal sem continuidade, o contexto nao acompanha o lead e o "AI Freddy" nao tem base confiavel para responder.

## Recomendacao de arquitetura

### 1. Canal conversacional

Use `Freshchat` ou o widget conversacional do `Freshworks Suite` como canal principal do bot.

Motivo:

- e o componente certo para conversa em tempo real
- suporta bot, handoff para humano, campanhas e eventos
- conversa melhor com Freddy AI do que um fluxo improvisado com WhatsApp e FAQ estatica

### 2. CRM e pipeline

Use `Freshsales` ou `Freshworks CRM` para lead, oportunidade, pipeline e automacoes comerciais.

Motivo:

- o chatbot nao deve ser o sistema de registro do lead
- dados de qualificacao, origem, interesse, urgencia e area juridica precisam cair no CRM
- o CRM deve acionar follow-up, agenda e distribuicao

### 3. Suporte e pos-venda

Mantenha `Freshdesk` para ticket/atendimento formal quando o caso virar demanda operacional, documental ou suporte de cliente existente.

### 4. Base de conhecimento

Reconstrua a base em tres camadas:

- Conteudo institucional: servicos, documentos, prazos, cobertura geografica, canais
- Conteudo juridico controlado: respostas revisadas por advogado, com limite claro do que o bot pode afirmar
- Conteudo operacional: documentos necessarios, andamento, agendamento, status e encaminhamento

Idealmente, essa base deve sair do FAQ hardcoded e ir para uma fonte governada, versionada e indexavel.

## Fluxo recomendado

1. Visitante entra no chat.
2. Bot identifica intencao: duvida geral, qualificacao de lead, cliente atual, suporte, agendamento.
3. Bot responde com base governada.
4. Bot coleta campos obrigatorios: nome, telefone, email, area do problema, urgencia, cidade, faixa de divida ou tipo de contrato.
5. Sistema grava lead no CRM.
6. Se for caso qualificado, cria tarefa/oportunidade e oferece agendamento.
7. Se for cliente atual ou demanda operacional, abre ticket no Freshdesk.
8. Se a confianca da IA for baixa, transfere para humano com historico completo.

## O que falta para o AI Freddy funcionar bem

- Orquestracao de canais
- Base de conhecimento versionada e revisada
- Roteamento por intencao
- Handoff humano com contexto
- Integracao CRM + agenda + ticket
- Regras de compliance juridico
- Observabilidade: taxa de resolucao, escalonamento, conversao em lead, agendamento, perda por falha de resposta

## Decisao recomendada

Se a pergunta for "Freshsales Suite, Freshworks CRM ou Freshchat?", a resposta pratica e:

- `Freshchat/Freshworks chat` para conversa
- `Freshsales/Freshworks CRM` para lead e pipeline
- `Freshdesk` para tickets e suporte formal

Ou seja: nao e um ou outro. O melhor desenho e usar cada peca no papel correto, preferencialmente dentro da mesma suite Freshworks para manter contexto.

## Melhoria tecnica aplicada neste repo

Foi adicionada configuracao de canal por ambiente:

- `NEXT_PUBLIC_SUPPORT_CHANNEL`
- `NEXT_PUBLIC_FRESHWORKS_WIDGET_SCRIPT_URL`
- `NEXT_PUBLIC_FRESHWORKS_WIDGET_CHAT`

Com isso, o projeto consegue:

- ativar o widget Freshworks/Freshchat sem hardcode fixo
- manter CRM sem chat, se desejado
- usar WhatsApp apenas como fallback enquanto a operacao conversacional nao estiver pronta

## Proxima fase sugerida

1. Ativar o chat Freshworks no front.
2. Criar endpoint server-side para sincronizar lead qualificado no CRM.
3. Migrar FAQ estatica para base estruturada no Supabase.
4. Implementar busca semantica/RAG com respostas aprovadas.
5. Definir playbooks de transferencia para humano e ticket.
