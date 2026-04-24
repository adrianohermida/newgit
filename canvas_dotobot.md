# 🤖 DotoBot — Catálogo de Comandos & Capacidades

> Última atualização: **24/04/2026** (Horário de Manaus)
> Endpoint base: `https://sspvizogbcyigquqycsz.supabase.co/functions/v1/dotobot-slack`

O DotoBot é o assistente virtual integrado ao Slack responsável pela orquestração, monitoramento e execução de tarefas relacionadas à gestão de processos, publicações, prazos, audiências, partes e integrações com o Freshsales.

## 🛠️ Comandos Disponíveis (`/dotobot`)

O comando principal é `/dotobot [ação]`. Abaixo estão todas as ações suportadas e as Edge Functions que elas acionam no Supabase.

### 📊 Monitoramento & Painéis
| Comando | Edge Function | Descrição |
|---------|---------------|-----------|
| `status` | `dotobot-slack` | Exibe o painel completo do pipeline em tempo real (contagens de processos, publicações, fila de sincronização, etc.) |
| `pendencias` | `dotobot-slack` | Relatório de pendências de desenvolvimento e dados inconsistentes |
| `help` | `dotobot-slack` | Lista todos os comandos disponíveis no Slack |

### 📰 Publicações & Advise
| Comando | Edge Function | Descrição |
|---------|---------------|-----------|
| `publicacoes` | `dotobot-slack` | Lista as últimas 5 publicações recebidas do Advise |
| `advise-drain` | `advise-drain-by-date` | Força a drenagem imediata de publicações pendentes do Advise |
| `advise-backfill` | `advise-backfill-runner` | Processa a próxima semana da fila de backfill histórico do Advise |
| `importar-planilhas` | `advise-import-planilha` | Importa publicações de planilhas exportadas que ainda não têm processo vinculado |
| `sync-publicacoes` | `publicacoes-freshsales` | Sincroniza um lote de publicações pendentes para o Freshsales (como Activities) |

### ⚖️ Processos & Andamentos
| Comando | Edge Function | Descrição |
|---------|---------------|-----------|
| `andamentos` | `dotobot-slack` | Lista os últimos 5 andamentos capturados do DataJud |
| `criar-processos` | `fs-repair-orphans` | Cria processos no Supabase a partir de contas órfãs do Freshsales |
| `tipo-processo` | `datajud-worker` | Enriquecimento em lote do formato (Físico/Eletrônico) dos processos via DataJud |
| `datajud-reset` | `dotobot-slack` | Destrava processos que ficaram presos no status 'processando' no DataJud |

### 📅 Audiências & Prazos
| Comando | Edge Function | Descrição |
|---------|---------------|-----------|
| `audiencias` | `dotobot-slack` | Lista as próximas audiências agendadas |
| `extrair-audiencias` | `publicacoes-audiencias` | Extrai datas e links de audiências do texto das publicações usando IA/Regex |
| `calcular-prazos` | `publicacoes-prazos` | Calcula prazos processuais com base nas publicações recentes |
| `prazo-fim` | `publicacoes-prazos` | Atualiza a data de fim dos prazos calculados considerando feriados e dias úteis |

### 👥 Partes & Contatos
| Comando | Edge Function | Descrição |
|---------|---------------|-----------|
| `extrair-partes` | `publicacoes-partes` | Extrai partes (polo ativo/passivo) das publicações e cria Contacts no Freshsales |
| `higienizar-contatos`| `fs-contacts-sync` | Detecta e mescla contatos duplicados no Freshsales |

### 💰 Financeiro & Deals
| Comando | Edge Function | Descrição |
|---------|---------------|-----------|
| `deals-sync` | `deals-sync` | Sincroniza faturas e assinaturas do Supabase para o Freshsales Deals |

### 🧠 Inteligência Artificial (IA)
| Comando | Edge Function | Descrição |
|---------|---------------|-----------|
| `ia-status` | `dotobot-slack` | Exibe o status da fila de processamento da IA (resumos e extrações) |
| `resumir` | `dotobot-slack` | Aciona a IA para gerar um resumo jurídico de uma publicação específica |
| `perguntar [texto]` | `dotobot-slack` | Permite fazer perguntas jurídicas ou sobre o acervo para a IA do DotoBot |
| `enriquecer` | `advise-ai-enricher` | Envia um lote de publicações complexas para extração estruturada via IA |

---

## ⚙️ Como Configurar no Slack App

Para que os comandos funcionem corretamente no Slack, eles devem estar registrados no painel de administração do Slack App.

1. Acesse: `https://api.slack.com/apps/[APP_ID]/slash-commands`
2. Crie ou edite o comando `/dotobot`
3. Configure o **Request URL** para: `https://sspvizogbcyigquqycsz.supabase.co/functions/v1/dotobot-slack`
4. Adicione uma descrição e os *Usage Hints* (ex: `status | publicacoes | andamentos | calcular-prazos | extrair-partes | deals-sync`)
5. Reinstale o App no Workspace para aplicar as mudanças.

---

## ⏰ Automações (Cron Jobs)

Embora o DotoBot permita acionamento manual via Slack, a maioria das rotinas roda automaticamente via Cron Jobs no Supabase (`pg_cron`):

| Rotina | Frequência | Edge Function |
|--------|------------|---------------|
| Backfill Advise | A cada 5 min | `advise-backfill-runner` |
| Fila DataJud | A cada 5 min | `datajud-worker` |
| Sincronizar Publicações | A cada 10 min | `publicacoes-freshsales` |
| Extrair Audiências | A cada 15 min | `publicacoes-audiencias` |
| Reparar Órfãos | A cada 15 min | `fs-repair-orphans` |
| Sincronizar Processos | A cada 30 min | `processo-sync` |
| Sincronizar Contatos | A cada 6 horas | `fs-contacts-sync` |
| Status Matinal Slack | Dias úteis, 08:00 | `dotobot-slack` |
| Relatório Semanal Slack | Segundas, 08:30 | `dotobot-slack` |
