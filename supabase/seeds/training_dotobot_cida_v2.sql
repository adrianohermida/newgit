-- ============================================================
-- TREINAMENTO CONJUNTO: DOTOBOT + CIDA
-- Hermida Maia Advocacia — v2 — 24/04/2026
-- Schemas verificados: agentlab_agent_profiles, agentlab_intents,
-- agentlab_workflow_library, agentlab_knowledge_sources,
-- agentlab_knowledge_chunks, agentlab_training_scenarios
-- ============================================================

-- ─── 1. PERFIL DA CIDA ────────────────────────────────────────────────────────
-- Cida é a assistente de atendimento ao cliente (Freshchat/WhatsApp/Widget)
-- Dotobot é o assistente operacional interno (Slack)
-- Ambos compartilham a mesma base de conhecimento jurídico do escritório.

INSERT INTO agentlab_agent_profiles (agent_ref, persona_prompt, response_policy)
VALUES (
  'cida',
  E'Você é Cida, assistente virtual jurídica do escritório Hermida Maia Advocacia, especializado em Direito do Consumidor, Trabalhista, Previdenciário e Cível. Seu tom é acolhedor, empático e profissional. Você fala em português brasileiro, de forma clara e acessível, sem jargões jurídicos desnecessários.\n\nSeu objetivo é: (1) entender o problema do cliente, (2) coletar os dados necessários (nome, telefone, email, área do problema, urgência), (3) oferecer agendamento de consulta proativamente, (4) responder dúvidas básicas sobre serviços do escritório.\n\nNunca dê pareceres jurídicos definitivos — sempre oriente a falar com o advogado. Use o nome do cliente assim que souber. Respostas curtas (máx 4 frases). Ao detectar urgência, priorize o encaminhamento imediato.\n\nFERRAMENTAS DISPONÍVEIS: criar contatos, criar tickets, criar agendamentos, consultar processos, buscar base de conhecimento.',
  '{"max_response_length": 400, "language": "pt-BR", "tone": "empathetic_professional", "handoff_triggers": ["urgente", "emergência", "prazo", "liminar", "preso", "acidente", "demitido agora"], "collect_fields": ["nome", "telefone", "email", "area_problema", "urgencia"], "always_offer_booking": true}'
)
ON CONFLICT (agent_ref) DO UPDATE SET
  persona_prompt = EXCLUDED.persona_prompt,
  response_policy = EXCLUDED.response_policy;

-- Atualizar perfil do Dotobot para refletir capacidades operacionais completas
INSERT INTO agentlab_agent_profiles (agent_ref, persona_prompt, response_policy)
VALUES (
  'dotobot',
  E'Você é Dotobot, assistente operacional interno do escritório Hermida Maia Advocacia. Você auxilia a equipe jurídica com: gestão de publicações do DJE/Advise, sincronização com Freshsales CRM, cálculo de prazos processuais, extração de partes, consulta de andamentos no DataJud, gestão de audiências e análise de processos com IA.\n\nSeu tom é direto, técnico e eficiente. Responda em português brasileiro. Forneça dados precisos com números e datas. Quando houver erros no pipeline, explique a causa e sugira o comando correto para corrigir.\n\nFERRAMENTAS DISPONÍVEIS: consultar Supabase (processos, publicações, prazos, audiências, andamentos), acionar Edge Functions de sincronização, buscar base de conhecimento operacional.',
  '{"max_response_length": 800, "language": "pt-BR", "tone": "technical_direct", "show_counts": true, "show_dates": true, "suggest_commands": true}'
)
ON CONFLICT (agent_ref) DO UPDATE SET
  persona_prompt = EXCLUDED.persona_prompt,
  response_policy = EXCLUDED.response_policy;

-- ─── 2. KNOWLEDGE SOURCES (base compartilhada) ───────────────────────────────
-- Inserir fontes de conhecimento para ambos os bots

-- 2a. Base jurídica compartilhada (Cida + Dotobot)
INSERT INTO agentlab_knowledge_sources (agent_ref, source_type, title, content, status, notes)
VALUES
  ('cida', 'faq', 'Áreas de Atuação do Escritório',
   'O escritório Hermida Maia Advocacia, liderado pelo Dr. Adriano Menezes Hermida Maia (OAB/AM 8894), atua nas seguintes áreas: Direito do Consumidor (cobranças indevidas, negativação, danos morais), Direito Trabalhista (demissão sem justa causa, horas extras, assédio moral), Direito Previdenciário (aposentadoria, BPC/LOAS, revisão de benefícios), Direito Cível (contratos, indenizações, responsabilidade civil) e Direito Digital (crimes digitais, LGPD). Atendemos clientes em Manaus/AM e em todo o Brasil por videoconferência.',
   'active', 'FAQ principal do escritório'),

  ('cida', 'faq', 'Como Agendar uma Consulta',
   'Para agendar uma consulta com o Dr. Adriano Hermida, você pode informar seu nome, telefone e email aqui mesmo no chat — a Cida faz o agendamento para você. As consultas podem ser presenciais em Manaus ou por videoconferência para clientes de outras cidades. A primeira consulta é avaliativa e tem duração de 30 a 60 minutos.',
   'active', 'Fluxo de agendamento'),

  ('cida', 'faq', 'Honorários e Formas de Pagamento',
   'Os honorários variam conforme a complexidade do caso e a área jurídica. O escritório trabalha com: honorários fixos para casos simples, honorários de êxito (percentual sobre o valor recuperado) para ações trabalhistas e previdenciárias, e parcelamento para facilitar o acesso à justiça. Para saber o valor exato do seu caso, é necessário uma consulta inicial com o Dr. Adriano.',
   'active', 'Política de honorários'),

  ('cida', 'faq', 'Direito do Consumidor — Casos Comuns',
   'Os casos mais comuns que atendemos: (1) Cobranças indevidas em fatura de cartão ou banco; (2) Nome negativado indevidamente no SPC/Serasa; (3) Produto com defeito ou serviço não prestado; (4) Contratos abusivos de telefonia, internet ou financeiras; (5) Danos morais por mau atendimento. Em muitos casos é possível obter indenização por danos morais além da correção do problema.',
   'active', 'Direito do Consumidor'),

  ('cida', 'faq', 'Direito Trabalhista — Casos Comuns',
   'Atuamos em: (1) Demissão sem justa causa — garantia de FGTS, multa 40%, aviso prévio e seguro-desemprego; (2) Horas extras não pagas; (3) Assédio moral ou sexual no trabalho; (4) Acidente de trabalho; (5) Rescisão indireta; (6) Equiparação salarial. Prazo para entrar com ação trabalhista: 2 anos após a demissão. Não perca seu prazo!',
   'active', 'Direito Trabalhista'),

  ('cida', 'faq', 'Direito Previdenciário — Casos Comuns',
   'Ajudamos com: (1) Aposentadoria por tempo de contribuição, idade ou invalidez; (2) BPC/LOAS para idosos e pessoas com deficiência de baixa renda; (3) Auxílio-doença e aposentadoria por invalidez; (4) Revisão de benefícios concedidos com valor menor que o devido; (5) Pensão por morte; (6) Recursos contra negativas do INSS. O prazo para contestar uma decisão do INSS é de 30 dias.',
   'active', 'Direito Previdenciário'),

  ('cida', 'faq', 'Urgências e Situações de Emergência',
   'Se você está em uma situação de urgência jurídica — prazo vencendo hoje, demissão imediata, acidente, prisão ou necessidade de liminar — informe imediatamente. Nossa equipe será notificada com prioridade alta. Tenha em mãos: seu nome completo, telefone para contato imediato e uma descrição breve da situação.',
   'active', 'Protocolo de urgência'),

  ('cida', 'faq', 'Localização e Contato',
   'Hermida Maia Advocacia está localizado em Manaus, Amazonas. Atendemos presencialmente e por videoconferência em todo o Brasil. O Dr. Adriano Hermida Maia é inscrito na OAB/AM sob o número 8894.',
   'active', 'Dados de contato'),

  -- Base operacional do Dotobot
  ('dotobot', 'operational', 'Arquitetura do Pipeline de Sincronização',
   'O pipeline funciona em camadas: (1) Advise → advise-sync importa publicações para judiciario.publicacoes; (2) publicacoes-freshsales sincroniza como Activities no Freshsales (CRON 10min, lote 30); (3) publicacoes-audiencias extrai audiências (CRON 15min); (4) publicacoes-prazos calcula prazos processuais; (5) processo-sync sincroniza processos como Accounts (CRON 30min, lote 100); (6) publicacoes-partes extrai partes e cria Contacts (CRON 6h); (7) fs-contacts-sync higieniza duplicatas. Cada etapa depende da anterior.',
   'active', 'Arquitetura do sistema'),

  ('dotobot', 'operational', 'Comandos de Emergência do Pipeline',
   'Quando o pipeline trava: /dotobot status — painel geral; /dotobot datajud-reset — destravar processos presos em "processando"; /dotobot sync-publicacoes — forçar sync de publicações; /dotobot advise-drain — forçar drenagem do Advise; /dotobot advise-backfill — processar próxima semana do backfill histórico; /dotobot criar-processos — criar Accounts ausentes no Freshsales; /dotobot higienizar-contatos — deduplicar Contacts.',
   'active', 'Comandos de emergência'),

  ('dotobot', 'operational', 'Cálculo de Prazos Processuais',
   'Tipos de prazo calculados automaticamente: contestação (15 dias úteis), recurso de apelação (15 dias), embargos de declaração (5 dias), agravo de instrumento (15 dias), mandado de segurança (120 dias). O cálculo considera feriados nacionais e estaduais (AM, SP, RJ) e conta apenas dias úteis. Comandos: /dotobot calcular-prazos (recalcular lote), /dotobot prazo-fim (atualizar datas de vencimento).',
   'active', 'Cálculo de prazos'),

  ('dotobot', 'operational', 'Gestão de Partes e Contatos no CRM',
   'As partes são extraídas automaticamente das publicações (polo ativo/passivo). Fluxo: publicação → publicacoes-partes extrai partes → cria Contact no Freshsales → vincula ao Account (processo). Comandos: /dotobot extrair-partes (forçar extração), /dotobot higienizar-contatos (deduplicar). Pendência atual: 5.027 partes sem Contact no Freshsales — sendo processadas automaticamente.',
   'active', 'Gestão de partes'),

  ('dotobot', 'operational', 'Sincronização com Freshsales — Entidades',
   'Mapeamento de entidades: Processo → Account (campo: numero_cnj, tipo_processo, vara, tribunal); Publicação → Activity (campo: data_publicacao, despacho, tipo_publicacao); Parte → Contact (campo: nome, cpf, polo); Audiência → Appointment; Prazo → Task (com data de vencimento); Deal → vinculado ao Account via billing-import. Todos os vínculos usam account_id_freshsales como chave.',
   'active', 'Mapeamento de entidades CRM'),

  ('dotobot', 'operational', 'Backfill Histórico do Advise',
   'O backfill processa publicações históricas semana a semana. Estado atual: semanas de 2024 processadas, 2025 em andamento. Comandos: /dotobot advise-backfill (processar próxima semana), /dotobot advise-drain (drenar publicações pendentes por data). Bug corrigido em 24/04/2026: parâmetros de data agora passados corretamente via querystring.',
   'active', 'Backfill histórico');

-- ─── 3. INTENTS — CIDA (atendimento ao cliente) ──────────────────────────────

INSERT INTO agentlab_intents (agent_ref, label, examples, policy, status) VALUES
('cida', 'saudacao',
  '["oi", "olá", "bom dia", "boa tarde", "boa noite", "oi cida", "olá cida", "preciso de ajuda", "pode me ajudar", "hello"]',
  '{"action": "saudacao_boas_vindas", "next": "identificar_problema"}', 'active'),

('cida', 'agendar_consulta',
  '["quero agendar", "marcar consulta", "preciso de atendimento", "como faço para falar com advogado", "quero uma consulta", "agendar horário", "marcar reunião", "quero ser atendido"]',
  '{"action": "criar_agendamento", "collect": ["nome", "telefone", "email", "data_preferida"]}', 'active'),

('cida', 'cancelar_consulta',
  '["cancelar consulta", "não posso ir", "desmarcar", "cancelar agendamento", "preciso cancelar", "não vou conseguir comparecer", "quero cancelar"]',
  '{"action": "cancelar_agendamento", "collect": ["nome", "data_agendamento"]}', 'active'),

('cida', 'remarcar_consulta',
  '["remarcar", "mudar horário", "adiar consulta", "trocar data", "reagendar", "outro dia", "mudar data da consulta"]',
  '{"action": "remarcar_agendamento", "collect": ["nome", "nova_data"]}', 'active'),

('cida', 'consultar_processo',
  '["meu processo", "como está meu caso", "andamento do processo", "o que aconteceu", "tem novidade", "prazo do meu processo", "audiência marcada", "status do processo"]',
  '{"action": "consultar_processo", "collect": ["numero_cnj_ou_nome"], "requires_auth": true}', 'active'),

('cida', 'duvida_servicos',
  '["quais serviços vocês oferecem", "trabalham com", "atendem", "área de atuação", "direito do consumidor", "trabalhista", "previdenciário", "quanto custa", "honorários", "consulta gratuita", "vocês fazem"]',
  '{"action": "responder_faq", "source": "knowledge_base"}', 'active'),

('cida', 'urgencia',
  '["urgente", "emergência", "prazo vencendo hoje", "fui demitido agora", "acidente", "preso", "liminar", "preciso de advogado agora", "situação grave", "não tenho tempo", "é hoje"]',
  '{"action": "handoff_urgente", "priority": "high", "notify_team": true}', 'active'),

('cida', 'falar_com_humano',
  '["falar com advogado", "falar com pessoa", "atendente humano", "não quero falar com robô", "preciso de um humano", "transferir para atendente", "quero falar com alguém"]',
  '{"action": "handoff_humano"}', 'active'),

('cida', 'informar_contato',
  '["meu nome é", "me chamo", "meu telefone", "meu email", "pode me contatar por", "sou o", "sou a", "meu CPF é"]',
  '{"action": "coletar_dados_contato", "save_to_crm": true}', 'active'),

('cida', 'encerrar_conversa',
  '["obrigado", "obrigada", "até mais", "tchau", "foi isso", "era só isso", "pode fechar", "não preciso mais de ajuda", "valeu"]',
  '{"action": "encerrar_com_satisfacao"}', 'active'),

('cida', 'negativacao_indevida',
  '["meu nome está sujo", "fui negativado", "SPC", "Serasa", "nome no cadastro negativo", "cobrança indevida", "dívida que não é minha", "nunca fiz essa dívida"]',
  '{"action": "responder_faq", "topic": "consumidor_negativacao", "offer_booking": true}', 'active'),

('cida', 'demissao_trabalhista',
  '["fui demitido", "me mandaram embora", "perdi o emprego", "rescisão", "FGTS", "aviso prévio", "seguro desemprego", "não recebi meus direitos"]',
  '{"action": "responder_faq", "topic": "trabalhista_demissao", "offer_booking": true}', 'active'),

('cida', 'aposentadoria_previdencia',
  '["quero me aposentar", "aposentadoria", "INSS negou", "BPC", "LOAS", "revisão de benefício", "auxílio doença", "invalidez", "pensão por morte"]',
  '{"action": "responder_faq", "topic": "previdenciario", "offer_booking": true}', 'active')
ON CONFLICT DO NOTHING;

-- ─── 4. INTENTS — DOTOBOT (operacional interno) ──────────────────────────────

INSERT INTO agentlab_intents (agent_ref, label, examples, policy, status) VALUES
('dotobot', 'status_pipeline',
  '["como está o pipeline", "status do sistema", "quantas publicações pendentes", "fila de sincronização", "status geral", "painel operacional", "o que está travado"]',
  '{"action": "show_status", "include_counts": true}', 'active'),

('dotobot', 'consultar_publicacoes',
  '["quais são as últimas publicações", "tem publicação nova", "publicações de hoje", "o que saiu no diário", "novidades do DJE", "publicações pendentes", "últimas publicações"]',
  '{"action": "show_publicacoes", "limit": 5}', 'active'),

('dotobot', 'verificar_prazos',
  '["quais prazos vencem essa semana", "prazos urgentes", "tem prazo hoje", "prazos do dia", "prazo vencendo", "calendário de prazos", "prazos críticos"]',
  '{"action": "show_prazos", "filter": "urgente"}', 'active'),

('dotobot', 'consultar_audiencias',
  '["próximas audiências", "audiência de amanhã", "tem audiência essa semana", "agenda de audiências", "audiências marcadas", "calendário de audiências"]',
  '{"action": "show_audiencias"}', 'active'),

('dotobot', 'consultar_andamentos',
  '["últimos andamentos", "movimentações recentes", "o que aconteceu nos processos", "andamentos do datajud", "novos andamentos", "movimentações do dia"]',
  '{"action": "show_andamentos"}', 'active'),

('dotobot', 'sincronizar_freshsales',
  '["sincronizar com freshsales", "atualizar CRM", "publicações para o CRM", "sync freshsales", "forçar sincronização", "mandar para o CRM"]',
  '{"action": "sync_publicacoes"}', 'active'),

('dotobot', 'calcular_prazo',
  '["calcular prazo", "qual o prazo para responder", "prazo de recurso", "prazo de contestação", "calcular dias úteis", "vencimento do prazo", "quando vence"]',
  '{"action": "calcular_prazos"}', 'active'),

('dotobot', 'extrair_partes',
  '["extrair partes", "quem são as partes", "polo ativo", "polo passivo", "partes do processo", "réu e autor", "identificar partes"]',
  '{"action": "extrair_partes"}', 'active'),

('dotobot', 'perguntar_ia',
  '["me explica", "o que significa", "qual a diferença", "como funciona", "me ajuda com", "tenho uma dúvida sobre", "explica para mim"]',
  '{"action": "ia_perguntar"}', 'active'),

('dotobot', 'resumir_processo',
  '["resumo do processo", "me resume o processo", "o que tem no processo", "histórico do processo", "resumir publicações", "me conta sobre o processo"]',
  '{"action": "ia_resumir"}', 'active'),

('dotobot', 'enriquecer_processo',
  '["enriquecer processo", "buscar dados no datajud", "atualizar dados do processo", "pegar informações do tribunal", "enriquecer com datajud"]',
  '{"action": "ia_enriquecer"}', 'active'),

('dotobot', 'deals_financeiro',
  '["sincronizar deals", "status financeiro", "faturas pendentes", "deals freshsales", "sync financeiro", "situação financeira dos processos"]',
  '{"action": "deals_sync"}', 'active')
ON CONFLICT DO NOTHING;

-- ─── 5. WORKFLOWS — CIDA ─────────────────────────────────────────────────────

INSERT INTO agentlab_workflow_library (agent_ref, title, type, trigger_phrases, steps, required_params, freshsales_action, status, priority) VALUES
('cida', 'Atendimento Inicial e Triagem', 'intake',
  '["preciso de ajuda", "oi", "olá", "bom dia", "boa tarde", "boa noite"]',
  '[{"step": 1, "action": "saudacao", "message": "Olá! Sou a Cida, assistente virtual do escritório Hermida Maia Advocacia. Como posso te ajudar hoje?"}, {"step": 2, "action": "coletar_nome", "message": "Pode me dizer seu nome?"}, {"step": 3, "action": "identificar_problema", "message": "Me conta um pouco sobre sua situação. Qual é o problema jurídico que você está enfrentando?"}]',
  '["nome"]', 'create_contact', 'active', 1),

('cida', 'Agendamento de Consulta', 'booking',
  '["agendar", "marcar consulta", "quero atendimento", "falar com advogado", "consulta"]',
  '[{"step": 1, "action": "coletar_dados", "fields": ["nome", "telefone", "email"]}, {"step": 2, "action": "verificar_disponibilidade"}, {"step": 3, "action": "confirmar_agendamento"}, {"step": 4, "action": "enviar_confirmacao"}]',
  '["nome", "telefone", "email", "data_preferida"]', 'create_appointment', 'active', 2),

('cida', 'Consulta de Processo (Cliente Autenticado)', 'legal_query',
  '["meu processo", "andamento", "como está meu caso", "prazo", "audiência", "status do processo"]',
  '[{"step": 1, "action": "verificar_autenticacao"}, {"step": 2, "action": "buscar_processo_supabase"}, {"step": 3, "action": "resumir_situacao"}, {"step": 4, "action": "informar_proximos_passos"}]',
  '["numero_cnj_ou_cpf"]', 'log_activity', 'active', 3),

('cida', 'Escalada de Urgência', 'handoff',
  '["urgente", "emergência", "prazo hoje", "fui demitido agora", "acidente", "preso", "liminar", "não tenho tempo"]',
  '[{"step": 1, "action": "registrar_urgencia"}, {"step": 2, "action": "notificar_equipe_slack"}, {"step": 3, "action": "criar_ticket_prioridade_alta"}, {"step": 4, "action": "informar_cliente_retorno", "message": "Entendi a urgência! Já notifiquei nossa equipe. Um advogado entrará em contato com você em breve. Pode me passar seu telefone para contato imediato?"}]',
  '["nome", "telefone", "descricao_urgencia"]', 'create_ticket_urgent', 'active', 1),

('cida', 'FAQ — Serviços e Honorários', 'faq',
  '["quanto custa", "vocês atendem", "áreas de atuação", "consulta gratuita", "honorários", "como funciona", "quais serviços"]',
  '[{"step": 1, "action": "buscar_knowledge_base"}, {"step": 2, "action": "responder_com_contexto"}, {"step": 3, "action": "oferecer_agendamento"}]',
  '[]', NULL, 'active', 4),

('cida', 'Transferência para Humano', 'handoff',
  '["falar com advogado", "atendente humano", "não quero robô", "pessoa real", "quero falar com alguém"]',
  '[{"step": 1, "action": "registrar_solicitacao_handoff"}, {"step": 2, "action": "notificar_equipe"}, {"step": 3, "action": "informar_cliente_espera", "message": "Claro! Vou te transferir para um de nossos advogados. Aguarde um momento — eles entrarão em contato em breve."}]',
  '[]', 'assign_to_agent', 'active', 2),

('cida', 'Coleta de Dados para CRM', 'crm_intake',
  '["meu nome é", "me chamo", "meu telefone", "meu email", "meu CPF"]',
  '[{"step": 1, "action": "coletar_nome"}, {"step": 2, "action": "coletar_telefone"}, {"step": 3, "action": "coletar_email"}, {"step": 4, "action": "salvar_contato_freshsales"}]',
  '["nome", "telefone", "email"]', 'create_contact', 'active', 3)
ON CONFLICT DO NOTHING;

-- ─── 6. WORKFLOWS — DOTOBOT (novos, além dos existentes) ─────────────────────

INSERT INTO agentlab_workflow_library (agent_ref, title, type, trigger_phrases, steps, required_params, freshsales_action, status, priority) VALUES
('dotobot', 'Calcular Prazo Processual', 'legal_calc',
  '["calcular prazo", "prazo de recurso", "prazo de contestação", "dias úteis", "vencimento"]',
  '[{"step": 1, "action": "invocar_publicacoes_prazos", "fn": "publicacoes-prazos", "params": {"action": "calcular_batch"}}, {"step": 2, "action": "exibir_resultado_slack"}]',
  '["data_publicacao", "tipo_prazo"]', NULL, 'active', 3),

('dotobot', 'Extrair Partes das Publicações', 'extraction',
  '["extrair partes", "quem são as partes", "polo ativo passivo", "identificar partes"]',
  '[{"step": 1, "action": "invocar_publicacoes_partes", "fn": "publicacoes-partes", "params": {"action": "extrair_batch"}}, {"step": 2, "action": "exibir_resultado_slack"}]',
  '[]', 'create_contact', 'active', 4),

('dotobot', 'Sincronizar Deals Financeiros', 'sync',
  '["sincronizar deals", "atualizar faturas CRM", "deals freshsales", "sync financeiro", "situação financeira"]',
  '[{"step": 1, "action": "invocar_deals_sync", "fn": "deals-sync", "params": {"action": "sync_batch"}}, {"step": 2, "action": "exibir_resultado_slack"}]',
  '[]', 'create_deal', 'active', 5),

('dotobot', 'Painel de Status Operacional', 'dashboard',
  '["status", "painel", "como está", "pipeline", "pendências", "o que está travado"]',
  '[{"step": 1, "action": "contar_publicacoes_pendentes"}, {"step": 2, "action": "contar_processos_sem_account"}, {"step": 3, "action": "contar_prazos_urgentes"}, {"step": 4, "action": "contar_audiencias_proximas"}, {"step": 5, "action": "exibir_painel_slack"}]',
  '[]', NULL, 'active', 1),

('dotobot', 'Backfill Histórico do Advise', 'backfill',
  '["advise backfill", "processar semana", "importar histórico", "backfill", "semanas antigas"]',
  '[{"step": 1, "action": "invocar_backfill_runner", "fn": "advise-backfill-runner", "params": {"action": "run_next"}}, {"step": 2, "action": "exibir_resultado_slack"}]',
  '[]', NULL, 'active', 5),

('dotobot', 'Enriquecer Processos com DataJud', 'enrichment',
  '["enriquecer processo", "buscar datajud", "atualizar dados tribunal", "tipo físico eletrônico"]',
  '[{"step": 1, "action": "invocar_datajud_worker", "fn": "datajud-worker", "params": {"action": "enrich_formato"}}, {"step": 2, "action": "exibir_resultado_slack"}]',
  '[]', NULL, 'active', 4)
ON CONFLICT DO NOTHING;

-- ─── 7. CENÁRIOS DE TREINAMENTO — CIDA ───────────────────────────────────────

INSERT INTO agentlab_training_scenarios (agent_ref, scenario_name, category, user_message, expected_intent, expected_outcome, expected_workflow, difficulty, score_threshold, status) VALUES
('cida', 'Saudação simples', 'greeting',
  'Oi, boa tarde!', 'saudacao',
  'Saudação calorosa e pergunta sobre como pode ajudar', 'Atendimento Inicial e Triagem', 'easy', 0.9, 'active'),

('cida', 'Agendamento direto', 'booking',
  'Quero marcar uma consulta para amanhã', 'agendar_consulta',
  'Coleta nome, telefone e email para agendamento', 'Agendamento de Consulta', 'easy', 0.85, 'active'),

('cida', 'Urgência trabalhista', 'urgency',
  'Fui demitido agora mesmo e não sei o que fazer', 'urgencia',
  'Escalada imediata com notificação da equipe e coleta de telefone', 'Escalada de Urgência', 'medium', 0.9, 'active'),

('cida', 'Dúvida sobre honorários', 'faq',
  'Quanto custa uma consulta?', 'duvida_servicos',
  'Resposta sobre honorários sem valor fixo e oferta de agendamento', 'FAQ — Serviços e Honorários', 'easy', 0.85, 'active'),

('cida', 'Consulta de processo', 'legal_query',
  'Quero saber como está meu processo', 'consultar_processo',
  'Solicita número CNJ ou CPF para busca', 'Consulta de Processo (Cliente Autenticado)', 'medium', 0.8, 'active'),

('cida', 'Negativação indevida', 'legal_query',
  'Meu nome está no SPC e eu nunca fiz essa dívida', 'negativacao_indevida',
  'Explica direito do consumidor, menciona possibilidade de danos morais e oferece consulta', 'FAQ — Serviços e Honorários', 'medium', 0.8, 'active'),

('cida', 'Pedido de humano', 'handoff',
  'Quero falar com um advogado de verdade', 'falar_com_humano',
  'Registra handoff e notifica equipe sem questionar a decisão do cliente', 'Transferência para Humano', 'easy', 0.95, 'active'),

('cida', 'Cancelamento de consulta', 'booking',
  'Preciso cancelar minha consulta de quinta-feira', 'cancelar_consulta',
  'Confirma cancelamento e oferece remarcação proativamente', NULL, 'easy', 0.85, 'active'),

('cida', 'Dúvida previdenciária', 'faq',
  'Tenho 62 anos e nunca me aposentei, o que posso fazer?', 'aposentadoria_previdencia',
  'Explica opções de aposentadoria por idade e BPC/LOAS e agenda consulta', 'FAQ — Serviços e Honorários', 'medium', 0.8, 'active'),

('cida', 'Encerramento satisfeito', 'closing',
  'Obrigada, foi muito útil!', 'encerrar_conversa',
  'Encerramento caloroso com convite para retornar e avaliação', NULL, 'easy', 0.9, 'active'),

('cida', 'Demissão sem justa causa', 'legal_query',
  'Fui mandado embora sem justa causa e a empresa não pagou meu FGTS', 'demissao_trabalhista',
  'Explica direitos trabalhistas (FGTS + multa 40% + aviso prévio) e agenda consulta urgente', 'Agendamento de Consulta', 'medium', 0.85, 'active'),

('cida', 'Prazo urgente', 'urgency',
  'Recebi uma notificação judicial e o prazo vence amanhã', 'urgencia',
  'Escalada imediata, notifica equipe, coleta dados de contato', 'Escalada de Urgência', 'hard', 0.95, 'active'),

('cida', 'Coleta de dados proativa', 'crm',
  'Meu nome é João Silva, meu telefone é 92 99999-0000', 'informar_contato',
  'Salva dados no CRM e agradece, pergunta sobre o problema', 'Coleta de Dados para CRM', 'easy', 0.9, 'active'),

('cida', 'Área de atuação', 'faq',
  'Vocês trabalham com direito digital?', 'duvida_servicos',
  'Confirma atuação em direito digital (LGPD, crimes digitais) e oferece consulta', 'FAQ — Serviços e Honorários', 'easy', 0.85, 'active'),

('cida', 'Remarcação de consulta', 'booking',
  'Preciso mudar minha consulta para sexta-feira', 'remarcar_consulta',
  'Confirma remarcação e envia nova confirmação', NULL, 'easy', 0.85, 'active')
ON CONFLICT DO NOTHING;

-- ─── 8. CENÁRIOS DE TREINAMENTO — DOTOBOT ────────────────────────────────────

INSERT INTO agentlab_training_scenarios (agent_ref, scenario_name, category, user_message, expected_intent, expected_outcome, expected_workflow, difficulty, score_threshold, status) VALUES
('dotobot', 'Status do pipeline', 'operational',
  'Como está o pipeline hoje?', 'status_pipeline',
  'Exibe painel completo com contagens de pendências por entidade', 'Painel de Status Operacional', 'easy', 0.95, 'active'),

('dotobot', 'Prazos urgentes', 'operational',
  'Tem algum prazo vencendo essa semana?', 'verificar_prazos',
  'Lista prazos com data, tipo e processo ordenados por urgência', NULL, 'easy', 0.9, 'active'),

('dotobot', 'Publicações novas', 'operational',
  'Quais são as últimas publicações?', 'consultar_publicacoes',
  'Lista as 5 publicações mais recentes com processo, data e tipo de despacho', NULL, 'easy', 0.9, 'active'),

('dotobot', 'Audiências da semana', 'operational',
  'Tem audiência marcada para essa semana?', 'consultar_audiencias',
  'Lista audiências com data, hora, processo e tipo', NULL, 'easy', 0.9, 'active'),

('dotobot', 'Pergunta jurídica IA', 'ia',
  'O que é embargos de declaração?', 'perguntar_ia',
  'Resposta jurídica objetiva com prazo (5 dias) e contexto prático', NULL, 'medium', 0.85, 'active'),

('dotobot', 'Resumo de processo', 'ia',
  'Me resume o processo 0001234-56.2023.8.04.0001', 'resumir_processo',
  'Resumo completo com publicações, prazos, partes e próximos passos', NULL, 'hard', 0.8, 'active'),

('dotobot', 'Sync forçado', 'operational',
  'Sincronizar publicações com o Freshsales agora', 'sincronizar_freshsales',
  'Aciona sync e retorna resultado do lote com contagem de sucesso/erro', NULL, 'medium', 0.85, 'active'),

('dotobot', 'Calcular prazo de contestação', 'legal_calc',
  'Calcular prazo de contestação para publicação de hoje', 'calcular_prazo',
  'Calcula 15 dias úteis a partir de hoje, considerando feriados', 'Calcular Prazo Processual', 'medium', 0.85, 'active'),

('dotobot', 'Extrair partes de publicações', 'extraction',
  'Extrair partes das publicações pendentes', 'extrair_partes',
  'Aciona extração em lote e retorna contagem de partes criadas no CRM', 'Extrair Partes das Publicações', 'medium', 0.85, 'active'),

('dotobot', 'Andamentos recentes', 'operational',
  'Quais são os últimos andamentos dos processos?', 'consultar_andamentos',
  'Lista os 10 andamentos mais recentes com processo, data e descrição', NULL, 'easy', 0.9, 'active'),

('dotobot', 'Enriquecer com DataJud', 'enrichment',
  'Atualizar tipo físico ou eletrônico dos processos', 'enriquecer_processo',
  'Aciona datajud-worker com action enrich_formato e retorna processos atualizados', 'Enriquecer Processos com DataJud', 'hard', 0.8, 'active'),

('dotobot', 'Status deals financeiros', 'financial',
  'Como estão os deals no Freshsales?', 'deals_financeiro',
  'Exibe contagem de deals por status (pendente, sincronizado, erro)', 'Sincronizar Deals Financeiros', 'medium', 0.85, 'active'),

('dotobot', 'Backfill histórico', 'operational',
  'Processar próxima semana do backfill do Advise', 'status_pipeline',
  'Aciona advise-backfill-runner e retorna semana processada e publicações importadas', 'Backfill Histórico do Advise', 'hard', 0.8, 'active'),

('dotobot', 'Diferença entre recursos', 'ia',
  'Qual a diferença entre apelação e agravo de instrumento?', 'perguntar_ia',
  'Explica diferença técnica com prazos: apelação (15 dias, decisão final) vs agravo (15 dias, decisão interlocutória)', NULL, 'hard', 0.8, 'active'),

('dotobot', 'Criar processos no CRM', 'operational',
  'Criar os processos que estão faltando no Freshsales', 'sincronizar_freshsales',
  'Aciona fs-repair-orphans com action criar_processos_ausentes e retorna contagem', NULL, 'medium', 0.85, 'active')
ON CONFLICT DO NOTHING;
