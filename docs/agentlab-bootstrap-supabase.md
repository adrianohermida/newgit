**Objetivo**
Tirar o `AgentLab` do modo de contingencia no projeto Supabase que o Cloudflare Pages esta usando.

**Bundle**
Aplicar este arquivo SQL no projeto correto:
[agentlab-bootstrap-supabase.sql](/D:/Github/newgit/docs/agentlab-bootstrap-supabase.sql)

**O que ele cria**
- `agentlab_agent_profiles`
- `agentlab_improvement_queue`
- `agentlab_conversation_threads`
- `agentlab_incidents`
- `agentlab_source_sync_runs`
- `agentlab_training_scenarios`
- `agentlab_training_runs`
- `agentlab_crm_automation_rules`
- `agentlab_crm_automation_runs`
- `agentlab_crm_resource_map`
- `agentlab_crm_dispatch_runs`
- `agentlab_message_templates`
- `agentlab_crm_action_queue`
- `agentlab_quick_replies`
- `agentlab_intents`
- `agentlab_knowledge_sources`
- `agentlab_workflow_library`
- `agentlab_source_states`

**Como aplicar**
1. Abra o projeto Supabase usado pelo Pages.
2. Vá em `SQL Editor`.
3. Cole o conteúdo de [agentlab-bootstrap-supabase.sql](/D:/Github/newgit/docs/agentlab-bootstrap-supabase.sql).
4. Execute o script inteiro.
5. Faça um hard refresh no painel interno.

**Sinais de que deu certo**
- o overview deixa de mostrar `Modo de contingencia`
- a aba `Conversations` habilita os botões de sync
- `Agents`, `Knowledge`, `Workflows` e `Evaluation` passam a persistir sem depender só de fallback

**Se ainda ficar degradado**
- confirme se o Pages está usando o mesmo `SUPABASE_URL` do projeto onde o SQL foi aplicado
- confirme se o runtime tem `SUPABASE_SERVICE_ROLE_KEY`
- se usar cache/CDN, faça novo deploy do Pages ou hard refresh autenticado

**Observacao**
Neste workspace eu nao consigo aplicar o SQL diretamente porque `supabase` CLI e `psql` nao estao instalados no ambiente atual. Por isso deixei o bundle pronto para execucao manual no projeto alvo.
