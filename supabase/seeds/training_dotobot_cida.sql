-- ============================================================
-- TREINAMENTO COMPLETO: DOTOBOT + CIDA
-- Hermida Maia Advocacia — Gerado em 24/04/2026
-- ============================================================

-- ─── 1. PERFIL DA CIDA (nova persona de atendimento ao cliente) ───────────────
INSERT INTO agentlab_agent_profiles (agent_ref, persona_prompt, response_policy)
VALUES (
  'cida',
  'Você é Cida, assistente virtual jurídica do escritório Hermida Maia Advocacia, especializado em Direito do Consumidor, Trabalhista, Previdenciário e Cível. Seu tom é acolhedor, empático e profissional. Você fala em português brasileiro, de forma clara e acessível, sem jargões jurídicos desnecessários. Seu objetivo é: (1) entender o problema do cliente, (2) coletar os dados necessários (nome, telefone, email, área do problema, urgência), (3) oferecer agendamento de consulta proativamente, (4) responder dúvidas básicas sobre serviços do escritório. Nunca dê pareceres jurídicos definitivos — sempre oriente a falar com o advogado. Use o nome do cliente assim que souber. Respostas curtas (máx 4 frases). Ao detectar urgência, priorize o encaminhamento imediato.',
  '{"max_response_length": 400, "language": "pt-BR", "tone": "empathetic_professional", "handoff_triggers": ["urgente", "emergência", "prazo", "liminar", "preso", "acidente", "demitido agora"], "collect_fields": ["nome", "telefone", "email", "area_problema", "urgencia"], "always_offer_booking": true}'
)
ON CONFLICT (agent_ref) DO UPDATE SET
  persona_prompt = EXCLUDED.persona_prompt,
  response_policy = EXCLUDED.response_policy;

-- ─── 2. INTENTS DO DOTOBOT (operacional interno) ─────────────────────────────
INSERT INTO agentlab_intents (agent_ref, label, examples, policy, status) VALUES
('dotobot', 'consultar_publicacoes', 
  '["quais são as últimas publicações", "tem publicação nova", "publicações de hoje", "o que saiu no diário", "novidades do DJE", "publicações pendentes"]',
  '{"action": "show_publicacoes", "limit": 5}', 'active'),

('dotobot', 'verificar_prazos',
  '["quais prazos vencem essa semana", "prazos urgentes", "tem prazo hoje", "prazos do dia", "prazo vencendo", "calendário de prazos"]',
  '{"action": "show_prazos", "filter": "urgente"}', 'active'),

('dotobot', 'status_pipeline',
  '["como está o pipeline", "status do sistema", "quantas publicações pendentes", "fila de sincronização", "status geral", "painel operacional"]',
  '{"action": "show_status"}', 'active'),

('dotobot', 'consultar_audiencias',
  '["próximas audiências", "audiência de amanhã", "tem audiência essa semana", "agenda de audiências", "audiências marcadas"]',
  '{"action": "show_audiencias"}', 'active'),

('dotobot', 'sincronizar_freshsales',
  '["sincronizar com freshsales", "atualizar CRM", "publicações para o CRM", "sync freshsales", "forçar sincronização"]',
  '{"action": "sync_publicacoes"}', 'active'),

('dotobot', 'consultar_andamentos',
  '["últimos andamentos", "movimentações recentes", "o que aconteceu nos processos", "andamentos do datajud", "novos andamentos"]',
  '{"action": "show_andamentos"}', 'active'),

('dotobot', 'calcular_prazo',
  '["calcular prazo", "qual o prazo para responder", "prazo de recurso", "prazo de contestação", "calcular dias úteis", "vencimento do prazo"]',
  '{"action": "calcular_prazos"}', 'active'),

('dotobot', 'extrair_partes',
  '["extrair partes", "quem são as partes", "polo ativo", "polo passivo", "partes do processo", "réu e autor"]',
  '{"action": "extrair_partes"}', 'active'),

('dotobot', 'perguntar_ia',
  '["me explica", "o que significa", "qual a diferença", "como funciona", "me ajuda com", "tenho uma dúvida sobre"]',
  '{"action": "ia_perguntar"}', 'active'),

('dotobot', 'resumir_processo',
  '["resumo do processo", "me resume o processo", "o que tem no processo", "histórico do processo", "resumir publicações"]',
  '{"action": "ia_resumir"}', 'active')
ON CONFLICT DO NOTHING;

-- ─── 3. INTENTS DA CIDA (atendimento ao cliente) ─────────────────────────────
INSERT INTO agentlab_intents (agent_ref, label, examples, policy, status) VALUES
('cida', 'agendar_consulta',
  '["quero agendar", "marcar consulta", "preciso de atendimento", "como faço para falar com advogado", "quero uma consulta", "agendar horário", "marcar reunião"]',
  '{"action": "criar_agendamento", "collect": ["nome", "telefone", "email", "data_preferida"]}', 'active'),

('cida', 'cancelar_consulta',
  '["cancelar consulta", "não posso ir", "desmarcar", "cancelar agendamento", "preciso cancelar", "não vou conseguir comparecer"]',
  '{"action": "cancelar_agendamento", "collect": ["nome", "data_agendamento"]}', 'active'),

('cida', 'remarcar_consulta',
  '["remarcar", "mudar horário", "adiar consulta", "trocar data", "reagendar", "outro dia"]',
  '{"action": "remarcar_agendamento", "collect": ["nome", "nova_data"]}', 'active'),

('cida', 'consultar_processo',
  '["meu processo", "como está meu caso", "andamento do processo", "o que aconteceu", "tem novidade", "prazo do meu processo", "audiência marcada"]',
  '{"action": "consultar_processo", "collect": ["numero_cnj_ou_nome"], "requires_auth": true}', 'active'),

('cida', 'duvida_servicos',
  '["quais serviços vocês oferecem", "trabalham com", "atendem", "área de atuação", "direito do consumidor", "trabalhista", "previdenciário", "quanto custa", "honorários", "consulta gratuita"]',
  '{"action": "responder_faq", "source": "knowledge_base"}', 'active'),

('cida', 'urgencia',
  '["urgente", "emergência", "prazo vencendo hoje", "fui demitido agora", "acidente", "preso", "liminar", "preciso de advogado agora", "situação grave"]',
  '{"action": "handoff_urgente", "priority": "high", "notify_team": true}', 'active'),

('cida', 'falar_com_humano',
  '["falar com advogado", "falar com pessoa", "atendente humano", "não quero falar com robô", "preciso de um humano", "transferir para atendente"]',
  '{"action": "handoff_humano"}', 'active'),

('cida', 'informar_contato',
  '["meu nome é", "me chamo", "meu telefone", "meu email", "pode me contatar por", "sou o", "sou a"]',
  '{"action": "coletar_dados_contato", "save_to_crm": true}', 'active'),

('cida', 'saudacao',
  '["oi", "olá", "bom dia", "boa tarde", "boa noite", "oi cida", "olá cida", "preciso de ajuda", "pode me ajudar"]',
  '{"action": "saudacao_boas_vindas"}', 'active'),

('cida', 'encerrar_conversa',
  '["obrigado", "obrigada", "até mais", "tchau", "foi isso", "era só isso", "pode fechar", "não preciso mais de ajuda"]',
  '{"action": "encerrar_com_satisfacao"}', 'active')
ON CONFLICT DO NOTHING;

-- ─── 4. WORKFLOWS DA CIDA ────────────────────────────────────────────────────
INSERT INTO agentlab_workflow_library (agent_ref, title, type, trigger_phrases, steps, required_params, freshsales_action, status) VALUES
('cida', 'Atendimento Inicial e Triagem', 'intake',
  '["preciso de ajuda", "oi", "olá", "bom dia", "boa tarde"]',
  '[{"step": 1, "action": "saudacao", "message": "Olá! Sou a Cida, assistente virtual do escritório Hermida Maia Advocacia. Como posso te ajudar hoje?"}, {"step": 2, "action": "coletar_nome", "message": "Pode me dizer seu nome?"}, {"step": 3, "action": "identificar_problema", "message": "Me conta um pouco sobre sua situação. Qual é o problema jurídico que você está enfrentando?"}]',
  '["nome"]',
  'create_contact', 'active'),

('cida', 'Agendamento de Consulta', 'booking',
  '["agendar", "marcar consulta", "quero atendimento", "falar com advogado"]',
  '[{"step": 1, "action": "coletar_dados", "fields": ["nome", "telefone", "email"]}, {"step": 2, "action": "verificar_disponibilidade"}, {"step": 3, "action": "confirmar_agendamento"}, {"step": 4, "action": "enviar_confirmacao"}]',
  '["nome", "telefone", "email", "data_preferida"]',
  'create_appointment', 'active'),

('cida', 'Consulta de Processo (Cliente Autenticado)', 'legal_query',
  '["meu processo", "andamento", "como está meu caso", "prazo", "audiência"]',
  '[{"step": 1, "action": "verificar_autenticacao"}, {"step": 2, "action": "buscar_processo_supabase"}, {"step": 3, "action": "resumir_situacao"}, {"step": 4, "action": "informar_proximos_passos"}]',
  '["numero_cnj_ou_cpf"]',
  'log_activity', 'active'),

('cida', 'Escalada de Urgência', 'handoff',
  '["urgente", "emergência", "prazo hoje", "fui demitido agora", "acidente", "preso"]',
  '[{"step": 1, "action": "registrar_urgencia"}, {"step": 2, "action": "notificar_equipe_slack"}, {"step": 3, "action": "criar_ticket_prioridade_alta"}, {"step": 4, "action": "informar_cliente_retorno"}]',
  '["nome", "telefone", "descricao_urgencia"]',
  'create_ticket_urgent', 'active'),

('cida', 'FAQ — Serviços e Honorários', 'faq',
  '["quanto custa", "vocês atendem", "áreas de atuação", "consulta gratuita", "honorários", "como funciona"]',
  '[{"step": 1, "action": "buscar_knowledge_base"}, {"step": 2, "action": "responder_com_contexto"}, {"step": 3, "action": "oferecer_agendamento"}]',
  '[]',
  NULL, 'active'),

('cida', 'Transferência para Humano', 'handoff',
  '["falar com advogado", "atendente humano", "não quero robô", "pessoa real"]',
  '[{"step": 1, "action": "registrar_solicitacao_handoff"}, {"step": 2, "action": "notificar_equipe"}, {"step": 3, "action": "informar_cliente_espera"}]',
  '[]',
  'assign_to_agent', 'active')
ON CONFLICT DO NOTHING;

-- ─── 5. NOVOS WORKFLOWS DO DOTOBOT (operacional) ─────────────────────────────
INSERT INTO agentlab_workflow_library (agent_ref, title, type, trigger_phrases, steps, required_params, freshsales_action, status) VALUES
('dotobot', 'Calcular Prazo Processual', 'legal_calc',
  '["calcular prazo", "prazo de recurso", "prazo de contestação", "dias úteis", "vencimento"]',
  '[{"step": 1, "action": "invocar_publicacoes_prazos", "params": {"action": "calcular_batch"}}, {"step": 2, "action": "exibir_resultado_slack"}]',
  '["data_publicacao", "tipo_prazo"]',
  NULL, 'active'),

('dotobot', 'Extrair Partes das Publicações', 'extraction',
  '["extrair partes", "quem são as partes", "polo ativo passivo"]',
  '[{"step": 1, "action": "invocar_publicacoes_partes", "params": {"action": "extrair_batch"}}, {"step": 2, "action": "exibir_resultado_slack"}]',
  '[]',
  'create_contact', 'active'),

('dotobot', 'Sincronizar Deals com Freshsales', 'sync',
  '["sincronizar deals", "atualizar faturas CRM", "deals freshsales", "sync financeiro"]',
  '[{"step": 1, "action": "invocar_deals_sync", "params": {"action": "sync_batch"}}, {"step": 2, "action": "exibir_resultado_slack"}]',
  '[]',
  'create_deal', 'active')
ON CONFLICT DO NOTHING;

-- ─── 6. KNOWLEDGE CHUNKS DA CIDA ─────────────────────────────────────────────
INSERT INTO agentlab_knowledge_chunks (agent_ref, title, content, source_type, tags, status) VALUES
('cida', 'Áreas de Atuação do Escritório',
  'O escritório Hermida Maia Advocacia, liderado pelo Dr. Adriano Menezes Hermida Maia (OAB 8894-AM), atua nas seguintes áreas: Direito do Consumidor (cobranças indevidas, negativação, danos morais), Direito Trabalhista (demissão sem justa causa, horas extras, assédio moral), Direito Previdenciário (aposentadoria, BPC/LOAS, revisão de benefícios), Direito Cível (contratos, indenizações, responsabilidade civil) e Direito Digital (crimes digitais, LGPD). Atendemos clientes em Manaus/AM e em todo o Brasil por videoconferência.',
  'faq', '["servicos", "areas", "atuacao"]', 'active'),

('cida', 'Como Agendar uma Consulta',
  'Para agendar uma consulta com o Dr. Adriano Hermida, você pode: (1) Me informar seu nome, telefone e email aqui mesmo no chat — eu faço o agendamento para você; (2) Ligar para o escritório; (3) Acessar o site do escritório. As consultas podem ser presenciais em Manaus ou por videoconferência para clientes de outras cidades. A primeira consulta é avaliativa e tem duração de 30 a 60 minutos.',
  'faq', '["agendamento", "consulta", "como_agendar"]', 'active'),

('cida', 'Honorários e Formas de Pagamento',
  'Os honorários variam conforme a complexidade do caso e a área jurídica. O escritório trabalha com: honorários fixos para casos simples, honorários de êxito (percentual sobre o valor recuperado) para ações trabalhistas e previdenciárias, e parcelamento para facilitar o acesso à justiça. Para saber o valor exato do seu caso, é necessário uma consulta inicial com o Dr. Adriano. Não realizamos consultas gratuitas, mas o investimento é acessível e transparente.',
  'faq', '["honorarios", "pagamento", "custo", "preco"]', 'active'),

('cida', 'Direito do Consumidor — Casos Comuns',
  'Os casos mais comuns de Direito do Consumidor que atendemos: (1) Cobranças indevidas em fatura de cartão ou banco; (2) Nome negativado indevidamente no SPC/Serasa; (3) Produto com defeito ou serviço não prestado; (4) Contratos abusivos de telefonia, internet ou financeiras; (5) Danos morais por mau atendimento ou exposição indevida. Em muitos casos é possível obter indenização por danos morais além da correção do problema.',
  'faq', '["consumidor", "negativacao", "cobranca", "dano_moral"]', 'active'),

('cida', 'Direito Trabalhista — Casos Comuns',
  'Atuamos em: (1) Demissão sem justa causa — garantia de FGTS, multa 40%, aviso prévio e seguro-desemprego; (2) Horas extras não pagas; (3) Assédio moral ou sexual no trabalho; (4) Acidente de trabalho; (5) Rescisão indireta (quando o empregador descumpre obrigações); (6) Equiparação salarial. Prazo para entrar com ação trabalhista: 2 anos após a demissão. Não perca seu prazo!',
  'faq', '["trabalhista", "demissao", "fgts", "horas_extras", "assedio"]', 'active'),

('cida', 'Direito Previdenciário — Casos Comuns',
  'Ajudamos com: (1) Aposentadoria por tempo de contribuição, idade ou invalidez; (2) BPC/LOAS para idosos e pessoas com deficiência de baixa renda; (3) Auxílio-doença e aposentadoria por invalidez; (4) Revisão de benefícios concedidos com valor menor que o devido; (5) Pensão por morte; (6) Recursos contra negativas do INSS. O prazo para contestar uma decisão do INSS é de 30 dias.',
  'faq', '["previdenciario", "inss", "aposentadoria", "bpc", "loas"]', 'active'),

('cida', 'Urgências e Situações de Emergência',
  'Se você está em uma situação de urgência jurídica — prazo vencendo hoje, demissão imediata, acidente, prisão ou necessidade de liminar — informe imediatamente. Nossa equipe será notificada com prioridade alta. Tenha em mãos: seu nome completo, telefone para contato imediato e uma descrição breve da situação. Quanto mais rápido agirmos, melhores as chances de resultado.',
  'faq', '["urgencia", "emergencia", "prazo", "liminar", "prisao"]', 'active'),

('cida', 'Localização e Contato do Escritório',
  'Hermida Maia Advocacia está localizado em Manaus, Amazonas. Atendemos presencialmente e por videoconferência em todo o Brasil. Para contato direto, utilize este chat ou solicite que eu faça o agendamento. O Dr. Adriano Hermida Maia é inscrito na OAB/AM sob o número 8894.',
  'faq', '["contato", "endereco", "localizacao", "oab"]', 'active')
ON CONFLICT DO NOTHING;

-- ─── 7. KNOWLEDGE CHUNKS DO DOTOBOT (operacional) ────────────────────────────
INSERT INTO agentlab_knowledge_chunks (agent_ref, title, content, source_type, tags, status) VALUES
('dotobot', 'Arquitetura de Sincronização Freshsales',
  'O pipeline de sincronização funciona assim: (1) Advise publica publicações → advise-sync importa para Supabase (tabela judiciario.publicacoes); (2) publicacoes-freshsales sincroniza publicações como Activities no Freshsales (CRON 10min); (3) publicacoes-audiencias extrai audiências das publicações (CRON 15min); (4) publicacoes-prazos calcula prazos processuais; (5) processo-sync sincroniza processos como Accounts (CRON 30min); (6) fs-contacts-sync sincroniza partes como Contacts (CRON 6h). Cada etapa depende da anterior.',
  'operational', '["pipeline", "sincronizacao", "freshsales", "arquitetura"]', 'active'),

('dotobot', 'Comandos de Emergência do Pipeline',
  'Quando o pipeline trava: (1) /dotobot status — ver o que está pendente; (2) /dotobot datajud-reset — destravar processos presos em "processando"; (3) /dotobot sync-publicacoes — forçar sincronização de publicações; (4) /dotobot advise-drain — forçar drenagem do Advise; (5) /dotobot advise-backfill — processar próxima semana do backfill histórico. Para problemas no Freshsales: /dotobot criar-processos e /dotobot higienizar-contatos.',
  'operational', '["emergencia", "pipeline", "trava", "reset"]', 'active'),

('dotobot', 'Cálculo de Prazos Processuais',
  'O sistema calcula automaticamente prazos processuais com base nas publicações. Tipos de prazo: contestação (15 dias úteis), recurso de apelação (15 dias), embargos de declaração (5 dias), agravo de instrumento (15 dias), mandado de segurança (120 dias). O cálculo considera feriados nacionais e estaduais (AM, SP, RJ) e dias úteis. Para forçar recálculo: /dotobot calcular-prazos. Para atualizar datas de vencimento: /dotobot prazo-fim.',
  'operational', '["prazos", "calculo", "dias_uteis", "feriados"]', 'active'),

('dotobot', 'Gestão de Partes e Contatos',
  'As partes dos processos são extraídas automaticamente das publicações. O fluxo é: publicação → extração de partes (polo ativo/passivo) → criação de Contact no Freshsales → vinculação ao Account (processo). Para forçar extração: /dotobot extrair-partes. Para higienizar duplicatas: /dotobot higienizar-contatos. Atualmente há 5.027 partes sem Contact no Freshsales — sendo processadas automaticamente.',
  'operational', '["partes", "contatos", "freshsales", "polo_ativo", "polo_passivo"]', 'active')
ON CONFLICT DO NOTHING;

-- ─── 8. CENÁRIOS DE TREINAMENTO DA CIDA ──────────────────────────────────────
INSERT INTO agentlab_training_scenarios (agent_ref, scenario_name, category, user_message, expected_intent, expected_outcome, expected_workflow, difficulty, score_threshold, status) VALUES
('cida', 'Saudação simples', 'greeting', 'Oi, boa tarde!', 'saudacao', 'Saudação calorosa e pergunta sobre como pode ajudar', NULL, 'easy', 0.9, 'active'),
('cida', 'Agendamento direto', 'booking', 'Quero marcar uma consulta para amanhã', 'agendar_consulta', 'Coleta nome, telefone e email para agendamento', 'Agendamento de Consulta', 'easy', 0.85, 'active'),
('cida', 'Urgência trabalhista', 'urgency', 'Fui demitido agora mesmo e não sei o que fazer', 'urgencia', 'Escalada imediata com notificação da equipe', 'Escalada de Urgência', 'medium', 0.9, 'active'),
('cida', 'Dúvida sobre honorários', 'faq', 'Quanto custa uma consulta?', 'duvida_servicos', 'Resposta sobre honorários e oferta de agendamento', 'FAQ — Serviços e Honorários', 'easy', 0.85, 'active'),
('cida', 'Consulta de processo', 'legal_query', 'Quero saber como está meu processo', 'consultar_processo', 'Solicita número CNJ ou CPF para busca', 'Consulta de Processo (Cliente Autenticado)', 'medium', 0.8, 'active'),
('cida', 'Negativação indevida', 'legal_query', 'Meu nome está no SPC e eu nunca fiz essa dívida', 'duvida_servicos', 'Explica direito do consumidor e oferece consulta', NULL, 'medium', 0.8, 'active'),
('cida', 'Pedido de humano', 'handoff', 'Quero falar com um advogado de verdade', 'falar_com_humano', 'Registra handoff e notifica equipe', 'Transferência para Humano', 'easy', 0.95, 'active'),
('cida', 'Cancelamento de consulta', 'booking', 'Preciso cancelar minha consulta de quinta-feira', 'cancelar_consulta', 'Confirma cancelamento e oferece remarcação', NULL, 'easy', 0.85, 'active'),
('cida', 'Dúvida previdenciária', 'faq', 'Tenho 62 anos e nunca me aposentei, o que posso fazer?', 'duvida_servicos', 'Explica opções previdenciárias e agenda consulta', NULL, 'medium', 0.8, 'active'),
('cida', 'Encerramento satisfeito', 'closing', 'Obrigada, foi muito útil!', 'encerrar_conversa', 'Encerramento caloroso com convite para retornar', NULL, 'easy', 0.9, 'active')
ON CONFLICT DO NOTHING;

-- ─── 9. CENÁRIOS DE TREINAMENTO DO DOTOBOT ───────────────────────────────────
INSERT INTO agentlab_training_scenarios (agent_ref, scenario_name, category, user_message, expected_intent, expected_outcome, expected_workflow, difficulty, score_threshold, status) VALUES
('dotobot', 'Status do pipeline', 'operational', 'Como está o pipeline hoje?', 'status_pipeline', 'Exibe painel completo com contagens e pendências', NULL, 'easy', 0.95, 'active'),
('dotobot', 'Prazos urgentes', 'operational', 'Tem algum prazo vencendo essa semana?', 'verificar_prazos', 'Lista prazos com data e tipo ordenados por urgência', NULL, 'easy', 0.9, 'active'),
('dotobot', 'Publicações novas', 'operational', 'Quais são as últimas publicações?', 'consultar_publicacoes', 'Lista as 5 publicações mais recentes com resumo', NULL, 'easy', 0.9, 'active'),
('dotobot', 'Audiências da semana', 'operational', 'Tem audiência marcada para essa semana?', 'consultar_audiencias', 'Lista audiências com data, hora e processo', NULL, 'easy', 0.9, 'active'),
('dotobot', 'Pergunta jurídica IA', 'ia', 'O que é embargos de declaração?', 'perguntar_ia', 'Resposta jurídica objetiva com contexto do escritório', NULL, 'medium', 0.85, 'active'),
('dotobot', 'Resumo de processo', 'ia', 'Me resume o processo 0001234-56.2023.8.04.0001', 'resumir_processo', 'Resumo completo com publicações, prazos e partes', NULL, 'hard', 0.8, 'active'),
('dotobot', 'Sync forçado', 'operational', 'Sincronizar publicações com o Freshsales agora', 'sincronizar_freshsales', 'Aciona sync e retorna resultado do lote', NULL, 'medium', 0.85, 'active')
ON CONFLICT DO NOTHING;
