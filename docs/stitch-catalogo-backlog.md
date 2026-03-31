# Catalogo Stitch e backlog tecnico

Este documento consolida os artefatos extraidos do Stitch que sao uteis para auth, dashboard, blog e agendamento. O objetivo e acelerar implementacao sem substituir as paginas publicas ja existentes no repositorio.

## 1. Telas prioritarias por trilha

| Trilha | Pastas Stitch mais uteis | Papel na implementacao | Prioridade |
| --- | --- | --- | --- |
| Auth | `login_elite_dark_mode`, `recupera_o_de_senha_solicita_o`, `recupera_o_de_senha_nova_senha`, `cadastro_inicial_elite_dark_mode` | Base visual para login interno, recuperacao, redefinicao e onboarding inicial conectado ao Supabase Auth | Alta |
| Dashboard | `dashboard_elite_dark_mode_1`, `dashboard_elite_dark_mode_2`, `dashboard_elite_vis_o_geral_1`, `dashboard_do_cliente_vis_o_geral_refinado`, `gest_o_de_documentos_dashboard_hermida_maia_1`, `gest_o_de_documentos_dashboard_hermida_maia_2` | Referencia para shell, sidebar, cards, estados e modulos de conteudo interno | Alta |
| Blog | `blog_jur_dico_hermida_maia_1`, `blog_jur_dico_hermida_maia_2` | Referencia para listagem editorial, destaque, categorias, busca e newsletter | Media |
| Agendamento | `agendamento_online_hermida_maia_refinado`, `agendamento_online_hermida_maia_advocacia`, `agendamento_de_consulta_hermida_maia`, `agendamento_de_consulta_com_pix_hermida_maia`, `agendamento_e_consultas_hermida_maia` | Referencia para UX publica de agenda, calendario, slots, historico e eventuais etapas de pagamento | Alta |

## 2. Leitura tecnica dos artefatos

### Auth

- `login_elite_dark_mode`
  - Direcao visual: dark luxury com ouro, vidro escuro, serif para titulos.
  - Elementos reaproveitaveis: card central, labels em uppercase, CTA premium, acesso restrito, links secundarios.
  - Destino no codigo: `pages/interno/login.js` e `components/interno/AuthLayout.js`.

- `recupera_o_de_senha_solicita_o`
  - Direcao visual: card limpo, icone central, CTA verde, suporte visivel.
  - Elementos reaproveitaveis: hierarquia simples, uma acao primaria, retorno para login.
  - Destino no codigo: `pages/interno/recuperar-senha.js`.

- `recupera_o_de_senha_nova_senha`
  - Direcao visual: checklist de seguranca, campos com toggle de visibilidade, instrucoes claras.
  - Elementos reaproveitaveis: validadores visuais, bloco de dicas, CTA principal.
  - Destino no codigo: `pages/interno/atualizar-senha.js`.

- `cadastro_inicial_elite_dark_mode`
  - Direcao visual: onboarding premium com formulario completo.
  - Uso recomendado: criar rota de homologacao off-menu para onboarding inicial no Supabase, sem acionar ainda pelo header da home.
  - Destino no codigo: `pages/interno/cadastro-inicial.js`.

### Dashboard

- `dashboard_elite_dark_mode_1` e `dashboard_elite_dark_mode_2`
  - Melhor referencia para shell administrativo: sidebar escura, cards premium, busca, notificacoes.
  - Aplicar em `components/interno/InternoLayout.js`, `pages/interno/index.js`, `pages/interno/leads.js`, `pages/interno/agendamentos.js`, `pages/interno/posts.js`.

- `dashboard_do_cliente_vis_o_geral_refinado`
  - Melhor referencia para experiencias focadas em jornada, historico, suporte e compromissos.
  - Aplicar na refinacao do modulo de agendamentos e em estados detalhados.

- `gest_o_de_documentos_dashboard_hermida_maia_1` e `gest_o_de_documentos_dashboard_hermida_maia_2`
  - Uteis como base para tabelas, filtros e listas densas.
  - Aplicar nos modulos de posts, leads e documentos quando essa trilha entrar.

### Blog

- `blog_jur_dico_hermida_maia_1`
  - Melhor referencia para `/blog`: hero editorial, destaque, chips de categoria, grid, newsletter.
  - Destino no codigo: `pages/blog.js`.

- `blog_jur_dico_hermida_maia_2`
  - Servir como base para detalhe do artigo e variacoes de leitura.
  - Destino no codigo: `pages/blog/[slug].js`.

### Agendamento

- `agendamento_online_hermida_maia_refinado`
  - Melhor referencia para modernizar o fluxo publico atual sem trocar regra de negocio.
  - Elementos uteis: resumo lateral, calendario, slots, suporte, historico.
  - Destino no codigo: `components/agendamento/*`.

- `agendamento_de_consulta_com_pix_hermida_maia`
  - Nao implementar agora como fluxo principal.
  - Tratar como backlog opcional para etapa futura de pagamento antes da consulta.

- `agendamento_e_consultas_hermida_maia`
  - Uteis para estados de historico, consultas marcadas, remarcacao e confirmacao.

## 3. Backlog tecnico acionavel

### Bloco A: auth integrada com Supabase

1. Portar `login_elite_dark_mode` para `pages/interno/login.js`.
2. Portar `recupera_o_de_senha_solicita_o` para `pages/interno/recuperar-senha.js`.
3. Portar `recupera_o_de_senha_nova_senha` para `pages/interno/atualizar-senha.js`.
4. Criar `pages/interno/cadastro-inicial.js` com `supabase.auth.signUp`.
5. Manter todas essas rotas fora do header publico ate a homologacao completa.

### Bloco B: shell do dashboard

1. Reaproveitar a linguagem de `dashboard_elite_dark_mode_1` no layout interno.
2. Unificar sidebar, header, indicadores e containers.
3. Aplicar primeiro em `pages/interno/index.js`.
4. Depois replicar para `posts`, `agendamentos` e `leads`.

### Bloco C: blog editorial

1. Portar o hero, categorias e destaque de `blog_jur_dico_hermida_maia_1`.
2. Ligar os filtros a dados reais de `blog_posts`.
3. Ajustar `pages/blog/[slug].js` com hierarquia editorial da segunda tela.
4. Deixar newsletter como bloco desacoplado para nao travar rollout.

### Bloco D: agendamento publico

1. Preservar a regra atual de slots e agendamento.
2. Aplicar primeiro a casca visual inspirada em `agendamento_online_hermida_maia_refinado`.
3. Manter compatibilidade com `functions/api/slots-month.js` e `functions/api/agendar.js`.
4. Refinar depois os estados de remarcacao, confirmacao e historico.

## 4. Ordem recomendada de implementacao

1. Auth completa com Supabase.
2. Shell do dashboard interno.
3. Blog editorial.
4. Refinos do agendamento publico.

## 5. Rotas alvo

| Rota | Estado atual | Proximo passo |
| --- | --- | --- |
| `/interno/login` | Ja existe | Refinar visual e manter login funcional |
| `/interno/recuperar-senha` | Ja existe | Refinar visual e feedback |
| `/interno/atualizar-senha` | Ja existe | Refinar visual, toggles e checklist |
| `/interno/cadastro-inicial` | Ainda nao existe | Criar rota off-menu para onboarding |
| `/interno` | Ja existe | Aplicar shell premium do Stitch |
| `/blog` | Ja existe | Portar visual editorial do Stitch |
| Componentes de agendamento publico | Ja existem em fluxo funcional | Melhorar UX sem mexer nos contratos de negocio |
