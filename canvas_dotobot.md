# 🤖 DotoBot & Cida — Catálogo de Comandos & Capacidades (v2.0)
**Atualizado em:** 24/04/2026  
**Ambiente:** Supabase Edge Functions + Freshsales CRM + DataJud

Este documento consolida o guia de comandos Slack e o catálogo de capacidades de Inteligência Artificial para os dois agentes virtuais do escritório Hermida Maia Advocacia: **Dotobot** (operacional interno) e **Cida** (atendimento ao cliente).

---

## 1. 👩‍💼 Cida — Assistente Virtual Jurídica (Atendimento ao Cliente)

A Cida é a assistente de linha de frente, integrada ao Freshchat/WhatsApp/Widget. Seu objetivo é realizar a triagem inicial, agendar consultas e responder dúvidas frequentes, sempre com tom empático e acolhedor.

### 🧠 Base de Conhecimento Jurídico (Knowledge Sources)
A Cida foi treinada com a base jurídica do escritório e pode responder sobre:
- **Direito do Consumidor:** Cobranças indevidas, negativação indevida no SPC/Serasa, danos morais.
- **Direito Trabalhista:** Demissão sem justa causa, horas extras, assédio moral, rescisão indireta.
- **Direito Previdenciário:** Aposentadoria, BPC/LOAS, auxílio-doença, pensão por morte.
- **Institucional:** Áreas de atuação, honorários (política de cobrança), localização e contato do escritório.
- **Urgências:** Protocolo de atendimento imediato para prazos vencendo, prisões ou liminares.

### ⚙️ Workflows Automatizados (Intents & Actions)
A Cida executa os seguintes fluxos de forma autônoma:
1. **Atendimento Inicial e Triagem:** Coleta nome, telefone e entende o problema jurídico do cliente.
2. **Agendamento de Consulta:** Verifica disponibilidade e cria um *Appointment* no Freshsales.
3. **Consulta de Processo:** Para clientes autenticados, busca o status do processo no Supabase pelo CNJ ou CPF.
4. **Escalada de Urgência:** Identifica casos graves (ex: "prazo hoje", "preso"), cria um Ticket de prioridade alta e notifica a equipe no Slack imediatamente.
5. **Transferência para Humano (Handoff):** Transfere o atendimento para um advogado quando solicitado, sem atrito.
6. **Coleta de Dados para CRM:** Salva e atualiza os dados do cliente (*Contact*) no Freshsales proativamente.

---

## 2. 🤖 DotoBot — Assistente Operacional (Slack)

O Dotobot é o assistente da equipe jurídica, focado na gestão do pipeline de dados, sincronização com o CRM e cálculo de prazos processuais.

### 💬 Comandos de Inteligência Artificial (Menção Direta no Slack)
Você pode marcar o Dotobot (`@Dotobot`) no Slack para acionar capacidades de IA:

- `@Dotobot me resume o processo 0001234-56.2023.8.04.0001` → Gera um resumo completo do processo, incluindo últimas publicações, andamentos e prazos pendentes.
- `@Dotobot qual a diferença entre apelação e agravo?` → Responde dúvidas jurídicas técnicas com base no contexto do escritório.
- `@Dotobot como está o pipeline hoje?` → Exibe o painel de status operacional.
- `@Dotobot tem prazo urgente essa semana?` → Lista os prazos críticos que vencem nos próximos dias.

### 🛠️ Comandos de Slash (`/dotobot`) — Operações Manuais

#### 📊 Painéis e Consultas
| Comando | Ação Executada | Função Supabase |
|---|---|---|
| `/dotobot status` | Exibe o painel completo de pendências (publicações, processos, partes). | `dotobot-slack` |
| `/dotobot ia-status` | Exibe as estatísticas de uso da IA (Cloudflare/OpenAI) e logs de erro. | `dotobot-slack` |
| `/dotobot andamentos` | Lista os últimos 10 andamentos processuais capturados no DataJud. | `dotobot-slack` |
| `/dotobot deals-status` | Exibe a contagem de faturas/deals financeiros por status. | `deals-sync` |

#### 🔄 Sincronização com Freshsales (CRM)
| Comando | Ação Executada | Função Supabase |
|---|---|---|
| `/dotobot sync-publicacoes` | Força a sincronização do próximo lote de publicações pendentes. | `publicacoes-freshsales` |
| `/dotobot criar-processos` | Identifica processos ausentes no CRM e cria os Accounts correspondentes. | `fs-repair-orphans` |
| `/dotobot higienizar-contatos`| Procura e mescla partes/contatos duplicados no Freshsales. | `fs-contacts-sync` |
| `/dotobot deals-sync` | Sincroniza faturas e movimentações financeiras como Deals no CRM. | `deals-sync` |

#### ⚖️ Gestão Processual e Prazos
| Comando | Ação Executada | Função Supabase |
|---|---|---|
| `/dotobot calcular-prazos` | Calcula prazos processuais (dias úteis) para novas publicações. | `publicacoes-prazos` |
| `/dotobot prazo-fim` | Atualiza/recalcula a data de vencimento final dos prazos já calculados. | `publicacoes-prazos` |
| `/dotobot extrair-partes` | Extrai o polo ativo e passivo das publicações para criar Contacts. | `publicacoes-partes` |
| `/dotobot extrair-audiencias` | Analisa publicações com IA para encontrar datas de audiências. | `publicacoes-audiencias` |
| `/dotobot tipo-processo` | Consulta o DataJud para atualizar se o processo é Físico ou Eletrônico. | `datajud-worker` |
| `/dotobot datajud-reset` | Destrava processos que ficaram presos no status "processando". | `dotobot-slack` |

#### 📥 Importação e Backfill (Advise)
| Comando | Ação Executada | Função Supabase |
|---|---|---|
| `/dotobot advise-drain` | Força a drenagem de publicações do Advise para uma data específica. | `advise-drain-by-date` |
| `/dotobot advise-backfill` | Inicia o processamento da próxima semana do histórico do Advise. | `advise-backfill-runner` |
| `/dotobot importar-planilhas` | Processa planilhas exportadas, vinculando publicações aos processos. | `advise-import-planilha` |

---

### 🧠 Base de Conhecimento Operacional (Dotobot)
O Dotobot foi treinado para explicar o funcionamento do próprio sistema:
- **Arquitetura do Pipeline:** Sabe explicar a ordem de execução das CRONs (Advise → Publicações → Prazos → Processos → Partes).
- **Mapeamento de Entidades:** Entende que Processo = Account, Parte = Contact, Publicação = Activity, Audiência = Appointment.
- **Cálculo de Prazos:** Conhece as regras de contagem de dias úteis e feriados (AM, SP, RJ) para diferentes tipos de recursos.
- **Troubleshooting:** Sugere os comandos corretos de Slash (`/dotobot`) quando o usuário relata um problema de sincronização.

---

## ⚙️ Como Configurar no Slack App

Para que os comandos funcionem corretamente no Slack, eles devem estar registrados no painel de administração do Slack App.

1. Acesse: `https://api.slack.com/apps/[APP_ID]/slash-commands`
2. Crie ou edite o comando `/dotobot`
3. Configure o **Request URL** para: `https://sspvizogbcyigquqycsz.supabase.co/functions/v1/dotobot-slack`
4. Adicione a descrição e os *Usage Hints*: `status | publicacoes | andamentos | calcular-prazos | extrair-partes | deals-sync`
5. Reinstale o App no Workspace para aplicar as mudanças.
