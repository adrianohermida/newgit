# Fase 1 - Arquitetura do Blog e Dashboard Interno

## Objetivo

Definir uma arquitetura implementavel para:

- evoluir o blog atual para um produto editorial real;
- criar um dashboard interno autenticado;
- preservar o site publico atual;
- reaproveitar a stack ja existente: Next.js + Cloudflare Pages Functions + Supabase.

## Decisoes principais

### 1. Stack de dados

Usar Supabase como fonte de verdade para:

- posts do blog;
- autores internos;
- perfis e papeis do dashboard;
- opcionalmente agregacoes futuras de leads e agendamentos.

Justificativa:

- o projeto ja usa Supabase para agendamentos;
- ja existe estrutura de migrations em `supabase/migrations`;
- reduz a necessidade de introduzir um CMS externo neste momento;
- facilita auth e controle de acesso em uma unica plataforma.

### 2. Backend privilegiado

Continuar usando `functions/api/*` como backend canonico para operacoes sensiveis.

Responsabilidades:

- leitura e escrita administrativas;
- criacao e atualizacao de posts;
- publicacao e despublicacao;
- leitura consolidada de agendamentos e leads;
- protecao de secrets e regras de permissao.

Justificativa:

- o repositorio ja esta organizado em torno de Cloudflare Pages Functions;
- evita expor `service_role` no frontend;
- mantem consistencia com o fluxo operacional existente.

### 3. Site publico preservado

O site atual continua sendo a camada publica principal.

Regra:

- nao substituir paginas existentes;
- adicionar novas rotas quando necessario;
- evoluir `/blog` para dados reais por tras, preservando a rota publica.

### 4. Dashboard interno como area separada

Criar o dashboard em rotas dedicadas, com layout proprio e sem acoplar ao `Layout` publico.

Prefixo recomendado:

- `/interno`

Alternativas aceitas:

- `/dashboard`
- `/admin`

Recomendacao:

- usar `/interno` por combinar melhor com operacao interna do escritorio e evitar confusao com metricas publicas.

## Arquitetura proposta

## Camadas

### Camada publica

Rotas:

- `/`
- `/servicos`
- `/calculadora`
- `/contato`
- `/agendamento`
- `/faq`
- `/blog`
- `/blog/[slug]`

Responsabilidade:

- marketing;
- educacao e conteudo;
- captacao;
- descoberta dos artigos publicados.

### Camada interna

Rotas:

- `/interno/login`
- `/interno`
- `/interno/posts`
- `/interno/posts/novo`
- `/interno/posts/[id]`
- `/interno/agendamentos`
- `/interno/leads`

Responsabilidade:

- operacao editorial;
- visao interna do funil;
- consulta de agendamentos e leads;
- gestao de conteudo.

### Camada de API

Rotas recomendadas novas em `functions/api/*`:

- `GET /api/blog-posts`
- `GET /api/blog-post`
- `POST /api/blog-posts`
- `PATCH /api/blog-posts/:id` ou rota equivalente sem parametro dinamico
- `POST /api/blog-posts/:id/publish`
- `POST /api/admin-login-session` se optar por sessao server-side
- `GET /api/admin-agendamentos`
- `GET /api/admin-leads`

Observacao:

- como Cloudflare Pages Functions com parametros dinamicos podem exigir convencoes especificas de pasta, a implementacao final deve seguir o padrao de arquivo suportado pelo projeto no momento da codificacao.

## Modelo de dados recomendado

## 1. Tabela `blog_posts`

Campos recomendados:

- `id uuid primary key`
- `slug text unique not null`
- `title text not null`
- `excerpt text not null`
- `content text not null`
- `cover_image_url text`
- `category text`
- `status text not null`
- `seo_title text`
- `seo_description text`
- `published_at timestamptz`
- `author_id uuid`
- `created_at timestamptz`
- `updated_at timestamptz`

Valores sugeridos para `status`:

- `draft`
- `published`
- `archived`

## 2. Tabela `admin_profiles`

Campos recomendados:

- `id uuid primary key`
- `email text unique not null`
- `full_name text`
- `role text not null`
- `is_active boolean not null default true`
- `created_at timestamptz`
- `updated_at timestamptz`

Valores sugeridos para `role`:

- `admin`
- `editor`
- `viewer`

## 3. View ou tabela para leads

Como MVP, nao e necessario remodelar tudo de imediato.

Opcoes:

- curto prazo: consultar leads do Freshdesk via API server-side;
- medio prazo: persistir snapshots em tabela propria `crm_leads`.

Recomendacao:

- curto prazo: leitura server-side via endpoint administrativo;
- medio prazo: materializar no banco apenas se surgir necessidade de filtro, auditoria ou analytics.

## 4. Reaproveitamento de `agendamentos`

A tabela `agendamentos` ja existe e deve ser reutilizada no dashboard interno em modo leitura primeiro.

Fase inicial:

- listar;
- filtrar por status;
- buscar por data;
- visualizar detalhes.

Sem alterar:

- tokens;
- contrato das rotas publicas;
- integracao com Google Calendar.

## Estrategia de autenticacao

## Recomendacao

Usar Supabase Auth para acesso ao dashboard interno.

Fluxo sugerido:

- usuario interno faz login em `/interno/login`;
- frontend recebe sessao autenticada;
- perfil e role sao carregados de `admin_profiles`;
- dashboard libera modulos conforme role.

Por que essa opcao:

- ja conversa bem com Supabase;
- evita criar auth manual;
- reduz risco de seguranca;
- facilita expansao futura.

## Regra de autorizacao

### `viewer`

- pode visualizar posts, agendamentos e leads;
- nao publica nem altera.

### `editor`

- pode criar e editar posts;
- nao gerencia usuarios.

### `admin`

- acesso completo ao dashboard;
- gerencia posts e usuarios internos.

## Estrategia de implementacao do blog

## Fase 1A - estrutura invisivel ao usuario

Implementar sem quebrar a pagina atual:

- tabela `blog_posts`;
- migration inicial;
- rotas de leitura publica;
- rota de detalhe `/blog/[slug]`;
- utilitarios de acesso a dados;
- seed inicial com os posts atualmente hardcoded.

Resultado:

- o blog continua funcionando;
- passamos a ter fonte unica de conteudo.

## Fase 1B - transicao da listagem publica

Migrar `/blog` e `components/home/BlogSection.js` para consumirem dados reais.

Regra:

- manter a identidade visual atual no primeiro momento;
- trocar apenas a origem dos dados.

## Fase 1C - operacao editorial

Entregar no dashboard:

- listar posts;
- criar rascunho;
- editar post;
- publicar;
- arquivar.

## Estrategia de implementacao do dashboard

## Shell do dashboard

Criar um layout proprio com:

- sidebar;
- header interno;
- area de conteudo;
- estados de carregamento;
- bloqueio por autenticacao.

Arquivos sugeridos:

- `pages/interno/index.js`
- `pages/interno/login.js`
- `pages/interno/posts/index.js`
- `pages/interno/posts/novo.js`
- `pages/interno/posts/[id].js`
- `components/interno/*`

## Modulos do MVP

### Modulo 1 - Posts

Escopo:

- CRUD basico;
- preview textual;
- status;
- publicacao.

### Modulo 2 - Agendamentos

Escopo:

- listagem;
- filtros por status e data;
- detalhe simples.

Origem:

- Supabase via endpoint administrativo.

### Modulo 3 - Leads

Escopo:

- listagem simples;
- origem;
- assunto;
- status se disponivel;
- link para o ticket quando existir.

Origem:

- curto prazo: Freshdesk server-side;
- medio prazo: base propria.

## Fronteiras para evitar regressao

### Nao mexer agora

- `components/Layout.js`
- fluxo publico de agendamento
- paginas publicas existentes, exceto quando precisarem consumir dados reais do blog
- contratos de `functions/api/agendar.js`, `confirmar.js`, `cancelar.js`, `remarcar.js`

### Pode ser criado sem impacto

- novas migrations do Supabase;
- novas rotas `pages/interno/*`;
- novas rotas `pages/blog/[slug].js`;
- novos endpoints administrativos em `functions/api/*`;
- novos componentes internos.

## Ordem recomendada de execucao

### Etapa 1

Criar migrations do blog e perfis internos.

### Etapa 2

Criar utilitarios server-side para ler posts e perfis.

### Etapa 3

Criar rota publica `/blog/[slug]`.

### Etapa 4

Criar shell do dashboard interno com login.

### Etapa 5

Criar modulo de posts no dashboard.

### Etapa 6

Criar listagens administrativas de agendamentos e leads.

### Etapa 7

Migrar `/blog` e a home para fonte de dados real.

## Decisoes pendentes para o inicio da implementacao

Estas decisoes podem ser tomadas ja na abertura da Fase 2:

- confirmar prefixo da area interna: `/interno` ou `/dashboard`;
- definir se o editor do blog sera textarea inicial ou rich text simples;
- decidir se os leads do dashboard serao somente leitura via Freshdesk ou persistidos localmente;
- decidir se autores serao derivados do usuario autenticado ou cadastrados separadamente.

## Saida esperada da Fase 1

Ao final desta fase de arquitetura, a equipe deve estar pronta para implementar com poucas ambiguidades:

- modelo de dados definido;
- rotas publicas e internas definidas;
- estrategia de auth definida;
- ordem tecnica de entrega clara;
- limites de impacto bem estabelecidos.

## Proxima fase sugerida

Fase 2: iniciar a fundacao tecnica, começando pelas migrations de `blog_posts` e `admin_profiles`, depois a rota publica de detalhe do blog e o shell do dashboard interno.
