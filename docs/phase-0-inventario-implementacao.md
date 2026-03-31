# Fase 0 - Inventario de Implementacao

## Objetivo

Planejar a implementacao das UXs ausentes criadas no Stitch sem substituir as paginas atuais do site institucional. O foco desta fase e:

- preservar as rotas ja existentes;
- identificar lacunas reais no repositorio;
- separar o que e site publico, o que e blog e o que sera dashboard interno;
- definir uma ordem de entrega com baixo risco de regressao.

## Escopo preservado

As paginas publicas atuais devem ser mantidas e evoluidas apenas quando fizer sentido complementar funcionalidade:

- `/`
- `/servicos`
- `/blog`
- `/calculadora`
- `/contato`
- `/agendamento`
- `/confirmar`
- `/cancelar`
- `/remarcar`
- `/faq`

## Inventario atual

### 1. Site publico existente

Base principal em Next.js com layout compartilhado:

- `pages/index.js`
- `pages/servicos.js`
- `pages/blog.js`
- `pages/calculadora.js`
- `pages/contato.js`
- `pages/agendamento.js`
- `components/Layout.js`
- `pages/_app.js`

Observacoes:

- o layout global concentra header, footer, menu mobile e widget de WhatsApp;
- tracking e scripts externos sao injetados globalmente em `_app.js`;
- o estilo esta distribuido entre `globals.css`, Tailwind utilitario e muitos estilos inline.

### 2. Fluxos operacionais existentes

#### Agendamento

Frontend:

- `pages/agendamento.js`
- `components/agendamento/AgendamentoForm.js`

Backend canonico:

- `functions/api/agendar.js`
- `functions/api/slots-month.js`
- `functions/api/confirmar.js`
- `functions/api/cancelar.js`
- `functions/api/remarcar.js`

Dependencias:

- Google Calendar
- Supabase
- envio de e-mails transacionais

Risco:

- alto. Qualquer UX nova que toque agendamento precisa preservar contratos e validacoes atuais.

#### Captacao de leads

Frontend:

- `components/home/CalculatorSection.js`
- `pages/contato.js`

Backend canonico:

- `functions/api/freshdesk-ticket.js`

Dependencia:

- Freshdesk

Risco:

- medio. O frontend chama rotas `/api/*`, mas as implementacoes canonicas estao em `functions/api/*`.

### 3. Blog atual

Implementacao atual:

- `pages/blog.js`
- `components/home/BlogSection.js`

Estado atual:

- conteudo estatico hardcoded no frontend;
- nao existe modelo de post, slug dinamico, categoria, editor, preview ou CMS;
- o blog da home e o blog da rota dedicada repetem a mesma ideia de conteudo, mas sem fonte unica.

Conclusao:

- o blog atual funciona como vitrine visual, nao como produto editorial.

### 4. Dashboard interno

Estado atual:

- nao existe rota real de dashboard em `pages/`;
- nao existe autenticacao interna implementada;
- nao existe area administrativa para blog, leads ou agenda;
- existe apenas uma referencia generica a `Dashboard` em `pages.config.js`, sem arquivo correspondente.

Conclusao:

- dashboard interno e uma iniciativa nova, sem base implementada no repositorio atual.

## Lacunas identificadas

### Lacuna A - inconsistencias de estrutura

- `pages.config.js` importa `./pages/sobre`, mas esse arquivo nao existe;
- `pages.config.js` tambem descreve uma estrutura que nao reflete exatamente as rotas reais mantidas em `pages/`;
- existem endpoints legados em `pages/api/*` que retornam `410` e servem apenas como aviso.

Impacto:

- baixo para o site atual;
- medio para onboarding e para novas entregas, porque pode gerar decisoes erradas sobre a arquitetura.

### Lacuna B - blog sem modelo de dados

Falta definir:

- onde os posts vivem;
- quem cria e edita;
- se o conteudo sera markdown, banco, CMS ou painel proprio;
- como ficam categorias, autores, status e SEO.

Impacto:

- alto para qualquer evolucao real do blog.

### Lacuna C - dashboard interno inexistente

Falta definir:

- autenticacao e autorizacao;
- modulos iniciais;
- relacao com Supabase;
- escopo do MVP.

Impacto:

- alto, mas isolavel, porque pode ser construido como area separada sem mexer no site publico.

## Segmentacao recomendada

Para evitar regressao, separar o produto em 3 trilhas:

### Trilha 1 - Site publico preservado

Mantem as paginas atuais como base publica e recebe apenas incrementos pontuais.

### Trilha 2 - Blog como produto editorial

Evolui `/blog` para um fluxo real de publicacao sem quebrar a pagina atual no inicio.

### Trilha 3 - Dashboard interno

Nova area autenticada para operacao interna, desacoplada do site institucional.

## Prioridade de implementacao

### Prioridade 1 - fundacao do blog

Entregas da fundacao:

- definir modelo de dados de post;
- definir origem do conteudo;
- criar arquitetura de listagem + detalhe por slug;
- manter `/blog` atual enquanto a estrutura editorial e preparada.

MVP sugerido:

- listagem publica de posts;
- pagina individual de artigo;
- categorias;
- status `draft` e `published`;
- campos de SEO;
- capa, resumo, corpo e data de publicacao.

### Prioridade 2 - dashboard interno MVP

Modulos iniciais sugeridos:

- login interno;
- dashboard inicial com atalhos;
- gestao de posts do blog;
- visao basica de leads/tickets;
- visao basica de agendamentos.

MVP sugerido:

- `/interno` ou `/dashboard`;
- autenticacao;
- lista de posts;
- criar/editar/publicar post;
- leitura de agendamentos;
- leitura de tickets/leads.

### Prioridade 3 - novas paginas ausentes vindas do Stitch

Criterio:

- implementar apenas paginas inexistentes hoje;
- reutilizar `Layout` quando a pagina for publica;
- criar layout proprio se a pagina for interna;
- nao retrabalhar paginas atuais sem necessidade funcional.

## Proposta de ordem tecnica

### Etapa 0.1 - saneamento de arquitetura

- documentar oficialmente que o backend canonico esta em `functions/api/*`;
- corrigir ou ignorar conscientemente `pages.config.js`;
- definir nomes de rotas novas publicas e internas;
- fechar a estrategia de dados para blog e dashboard.

### Etapa 0.2 - contrato funcional do blog

Definir:

- fonte de verdade dos posts;
- campos obrigatorios;
- fluxo de publicacao;
- estrategia de preview;
- URL final dos artigos.

### Etapa 0.3 - contrato funcional do dashboard

Definir:

- quem acessa;
- quais modulos entram no MVP;
- permissoes por perfil;
- dados apenas leitura x edicao;
- dependencia de Supabase ou outra camada.

### Etapa 0.4 - mapa Stitch -> backlog

Para cada design ausente criado no Stitch, registrar:

- nome da UX;
- tipo: publica ou interna;
- rota alvo;
- dependencia de dados;
- integracoes impactadas;
- prioridade;
- criterio de aceite.

## Backlog inicial recomendado

### Bloco 1 - blog

- criar especificacao do modelo `Post`;
- escolher persistencia;
- criar rotas de listagem e detalhe;
- adaptar `/blog` para consumir dados reais;
- adicionar SEO por post;
- criar gestao de posts no dashboard.

### Bloco 2 - dashboard interno

- definir auth;
- criar shell do dashboard;
- criar navegacao interna;
- criar modulo de posts;
- criar modulo de agendamentos em leitura;
- criar modulo de leads em leitura.

### Bloco 3 - paginas ausentes

- implementar apenas rotas nao existentes hoje;
- plugar CTA e navegacao sem alterar as paginas publicas atuais;
- validar responsividade e consistencia visual.

## Riscos e guardrails

### Guardrails

- nao substituir paginas existentes;
- nao alterar contratos de `functions/api/*` nesta etapa;
- toda nova UX interna deve ficar isolada do layout publico;
- toda evolucao do blog deve ter fallback seguro enquanto o conteudo ainda for estatico.

### Riscos atuais

- ambiguidade entre runtime Next e Cloudflare Pages;
- referencias de configuracao desatualizadas;
- conteudo do blog duplicado e estatico;
- ausencia total de auth para area interna;
- possiveis problemas de encoding em textos ja existentes.

## Saida esperada da fase 0

Ao final da fase 0, devemos ter:

- inventario fechado do que existe e do que falta;
- decisoes de arquitetura para blog e dashboard;
- backlog priorizado;
- mapa dos designs do Stitch que serao implementados sem substituir o site atual.

## Proxima fase sugerida

Fase 1: definicao da arquitetura do blog e do dashboard interno, incluindo dados, rotas, autenticacao e shell de navegacao.
