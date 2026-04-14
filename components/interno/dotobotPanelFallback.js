import { detectIntent } from "../../lib/ai/intent_router";
import { getCurrentContext } from "../../lib/ai/context_engine";
import { buildCopilotContextPayload, buildContextualModuleHref, extractConversationEntities } from "./dotobotPanelContext";
import { inferCopilotModuleFromRoute, MODULE_WORKSPACES } from "./dotobotPanelConfig";

export function buildRagSummary(rag) {
  if (!rag) return { count: 0, sources: [], documents: [] };
  const retrieval = rag.retrieval || rag.supabase || rag.context || {};
  const matches = retrieval.matches || retrieval.items || retrieval.results || [];
  const documents = rag.documents || retrieval.documents || [];
  const sources = [...new Set(matches.map((item) => item?.source || item?.source_key || item?.provider || "context"))];
  return { count: Array.isArray(matches) ? matches.length : 0, sources, documents };
}

export function buildModuleFallbackPlaybook(moduleKey, intentLabel, context = {}) {
  const playbooks = {
    processos: {
      summary: intentLabel === "analyze_case" ? "Priorize leitura de fatos, CNJ, polos e gaps operacionais antes de qualquer conclusão." : "Confirme CNJ, espelho operacional e consistência de vínculo com CRM antes de seguir.",
      steps: ["Validar identificadores do processo e se o contexto veio com CNJ ou referência confiável.", "Abrir a mesa de Processos para revisar backlog, polos faltantes e reflexos operacionais.", "Se houver impacto em atendimento ou CRM, encaminhar o caso com resumo curto para o módulo responsável."],
    },
    publicacoes: {
      summary: "Trate a fila, o reflexo e a extração de partes antes de reexecutar qualquer rotina pesada.",
      steps: ["Conferir se a publicação depende de processo já reconciliado e com partes válidas.", "Abrir Publicações para revisar fila, chunks de backfill e sinais de falha no reflexo.", "Se o caso for sensível, encaminhar handoff com número do processo e risco operacional observado."],
    },
    financeiro: {
      summary: intentLabel === "query_data" ? "Use o contexto para localizar recebível, deal ou referência de processo antes de reconciliar." : "Priorize reconciliação, vínculo com deals e bloqueios de publicação financeira.",
      steps: ["Confirmar se a missão fala de cobrança, recebível, account, deal ou referência processual.", "Abrir Financeiro em contexto para buscar o processo ou contrato relacionado.", "Se houver decisão humana pendente, mover o caso para Aprovações ou AI Task com resumo objetivo."],
    },
    agenda: {
      summary: "Cheque confirmação, preparação e handoff do compromisso antes de acionar qualquer automação.",
      steps: ["Validar nome, e-mail e horário do agendamento que motivou a conversa.", "Abrir Agenda para revisar status, follow-up e necessidade de preparo adicional.", "Se houver dependência processual ou comercial, encaminhar o compromisso com contexto concatenado."],
    },
    leads: {
      summary: "Qualifique origem, aderência e próximo passo comercial antes de movimentar o CRM.",
      steps: ["Conferir e-mail, origem e intenção comercial identificada na conversa.", "Abrir Leads em contexto para revisar triagem e possíveis vínculos com Contatos.", "Se o lead estiver maduro, preparar handoff para Agenda ou CRM com resumo de triagem."],
    },
    contatos: {
      summary: "Revise deduplicação, vínculo CRM e consistência cadastral antes de atualizar registros.",
      steps: ["Confirmar se a conversa trouxe e-mail, telefone ou identificador confiável do contato.", "Abrir Contatos para revisar duplicidade, enriquecimento e relacionamento com contas.", "Se houver conflito de dados, registrar a divergência e seguir com validação humana."],
    },
    jobs: {
      summary: "Olhe a fila e o gargalo antes de reexecutar jobs ou alterar lote em andamento.",
      steps: ["Identificar qual execução, fila ou backlog motivou a missão atual.", "Abrir Jobs para revisar estado, retries, volume e impacto operacional.", "Se a execução depender de módulo específico, fazer handoff com run, contexto e hipótese do gargalo."],
    },
    aprovacoes: {
      summary: "Avalie impacto, prioridade e dependências antes de decidir a fila de aprovação.",
      steps: ["Confirmar qual solicitação ou cadastro depende de decisão humana.", "Abrir Aprovações para revisar fila, risco e impacto da decisão pendente.", "Se houver dependência financeira ou cadastral, anexar resumo ao handoff correspondente."],
    },
  };
  return playbooks[moduleKey] || {
    summary: "Defina o módulo responsável, consolide o contexto e avance com o próximo passo mais curto.",
    steps: [`Contexto atual: ${context.projectLabel || "Geral"}.`, "Abrir o módulo mais próximo da missão e confirmar os identificadores operacionais.", "Se a execução exigir acompanhamento, encaminhar a missão ao AI Task com resumo do objetivo."],
  };
}

export function buildLocalFallbackResponse({ query, routePath, activeConversation, activeTask, globalContext, selectedSkillId, failureMode }) {
  const intent = detectIntent(String(query || ""));
  const uiContext = getCurrentContext({
    route: routePath || "/interno/copilot",
    entityId: activeConversation?.id || activeTask?.id,
    entityType: activeConversation?.projectKey || "conversation",
    recentActivity: Array.isArray(activeConversation?.messages) ? activeConversation.messages.slice(-3) : [],
    userRole: "admin",
  });
  const matchedModule = inferCopilotModuleFromRoute(routePath);
  const projectLabel = activeConversation?.projectLabel || matchedModule?.label || "Geral";
  const conversationTitle = activeConversation?.title || "Nova conversa";
  const nextRoute = matchedModule?.href || routePath || "/interno/copilot";
  const modulePlaybook = buildModuleFallbackPlaybook(activeConversation?.projectKey || matchedModule?.key || "geral", intent.intent, { projectLabel });
  const nextAction = intent.intent === "generate_document" ? "Reunir fatos, base legal e pedido antes de abrir a tarefa de documento." : intent.intent === "create_task" ? "Quebrar a missão em etapas curtas e encaminhar para execução assistida." : modulePlaybook.summary;
  const runtimeIssueLabel = failureMode === "memory" ? "por memória" : failureMode === "inference" ? "porque o runtime local falhou ao responder" : "temporariamente";
  const checklist = [`Contexto ativo: ${projectLabel} (${uiContext.route}).`, `Conversa base: ${conversationTitle}.`, activeTask?.query ? `Missão atual: ${activeTask.query}.` : null, globalContext?.moduleHistory ? "Há histórico operacional disponível para handoff entre módulos." : null, selectedSkillId ? `Skill sugerida: ${selectedSkillId}.` : null].filter(Boolean);

  return [
    "Modo contingência local",
    `O LLM local ficou indisponível ${runtimeIssueLabel}, então gerei um playbook operacional para não interromper o fluxo.`,
    "",
    `Leitura rápida: ${nextAction}`,
    "",
    "Próximos passos",
    ...checklist.map((item, index) => `${index + 1}. ${item}`),
    ...modulePlaybook.steps.map((item, index) => `${checklist.length + index + 1}. ${item}`),
    `${checklist.length + modulePlaybook.steps.length + 1}. Abrir o fluxo em ${nextRoute} se você quiser continuar com contexto já preparado.`,
    `${checklist.length + modulePlaybook.steps.length + 2}. Se precisar de execução assistida, envie esta mesma missão para o AI Task.`,
    "",
    `Intenção detectada: ${intent.intent}.`,
    "Se quiser, eu continuo em modo contingência e estruturo isso como checklist, handoff ou plano por etapas.",
  ].join("\n");
}

export function buildLocalFallbackActions({ routePath, activeConversation, activeTask }) {
  const matchedModule = inferCopilotModuleFromRoute(routePath) || MODULE_WORKSPACES.find((item) => item.key === activeConversation?.projectKey) || null;
  const projectLabel = activeConversation?.projectLabel || matchedModule?.label || "Geral";
  const entities = extractConversationEntities(activeConversation, activeTask);
  const routeTarget = matchedModule ? buildContextualModuleHref(matchedModule, { activeConversation, activeTask, routePath, projectLabel, entities }) : routePath || "/interno/copilot";
  const routeActionLabel = matchedModule?.label ? `Abrir ${matchedModule.label} em contexto` : "Abrir módulo em contexto";
  const missionText = String(activeTask?.query || activeTask?.title || activeTask?.mission || activeConversation?.title || activeConversation?.preview || "").toLowerCase();
  const copilotContext = encodeURIComponent(buildCopilotContextPayload({ module: matchedModule || { key: "agentlab" }, activeConversation, activeTask, routePath, projectLabel }));
  const agentLabTarget = missionText.match(/trein|score|avali|prompt|fallback|modelo/) ? `/interno/agentlab/training?copilotContext=${copilotContext}` : missionText.match(/conversa|mensagem|handoff|freshchat|cliente|thread/) ? `/interno/agentlab/conversations?copilotContext=${copilotContext}` : missionText.match(/workflow|intent|orquestra|playbook|agent/) ? `/interno/agentlab/orquestracao?copilotContext=${copilotContext}` : `/interno/agentlab/environment?copilotContext=${copilotContext}`;
  return [
    { id: "retry-runtime-local", label: "Tentar novamente", kind: "local_action", target: "retry_runtime_local" },
    { id: "open-context-route", label: routeActionLabel, kind: "route", target: routeTarget },
    { id: "open-ai-task", label: "Enviar ao AI Task", kind: "route", target: "/interno/ai-task" },
    { id: "open-agentlab", label: "Abrir trilha no AgentLab", kind: "route", target: agentLabTarget },
    { id: "open-runtime-config", label: "Editar runtime local", kind: "local_action", target: "open_runtime_config" },
    activeConversation?.id || activeTask?.id ? { id: "reuse-mission", label: "Reusar no composer", kind: "composer_seed", target: activeTask?.query || activeConversation?.title || "" } : null,
  ].filter(Boolean);
}

export function buildConversationConcatBlock(conversation) {
  const transcript = Array.isArray(conversation?.messages)
    ? conversation.messages.slice(-12).map((message) => `${message.role === "assistant" ? "Dotobot" : message.role === "system" ? "Sistema" : "Equipe"}: ${message.text}`).join("\n")
    : "";
  return [`Projeto: ${conversation?.projectLabel || "Geral"}`, `Conversa: ${conversation?.title || "Sem titulo"}`, transcript ? `Transcricao:\n${transcript}` : ""].filter(Boolean).join("\n\n");
}
