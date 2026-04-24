/**
 * Skill Registry
 *
 * Centraliza o registro de habilidades/capacidades do Dotobot,
 * detecta skills por intencao de query e fornece prompts especializados.
 *
 * Skill = conjunto de tool groups + prompts contextualizados + permissoes
 */

export const SKILLS_CATALOG = {
  legal_analysis: {
    id: "legal_analysis",
    name: "Analise Juridica",
    category: "juridico",
    toolGroups: ["processos", "crm"],
    allowedActions: ["consultar", "ler_dados"],
    prompt: `Analise este caso sob otica de Direito do Consumidor, Superendividamento e Direito Civil.
    Estruture em: Fatos relevantes -> Questao juridica -> Fundamento legal -> Conclusao.
    Cite leis especificas quando houver. Recomende validacao humana em decisoes estrategicas.`,
    keywords: ["analisar", "analise", "caso", "juridico", "direito", "lei", "fundamento"],
    priority: 1,
  },

  legal_document: {
    id: "legal_document",
    name: "Elaboracao de Pecas Juridicas",
    category: "juridico",
    toolGroups: ["processos", "content"],
    allowedActions: ["consultar", "criar"],
    prompt: `Elabore peca juridica em portugues formal.
    Use estrutura padrao com cabecalho, exposicao, fundamento de direito, pedidos e conclusao.
    Inclua numero de processo, datas e partes somente quando os dados estiverem validados.`,
    keywords: ["peca", "peticao", "recurso", "parecer", "elabore", "crie", "escreva", "redija"],
    priority: 1,
  },

  case_triage: {
    id: "case_triage",
    name: "Triagem de Casos",
    category: "operacional",
    toolGroups: ["crm", "processos"],
    allowedActions: ["ler_dados", "sincronizar", "auditar"],
    prompt: `Triague o caso rapidamente: extraia partes, causa juridica, andamento e urgencia.
    Identifique prazo critico, acoes imediatas e responsavel. Resuma em no maximo 3 bullets.`,
    keywords: ["triagem", "novo", "triage", "case", "caso", "lead", "classificar"],
    priority: 2,
  },

  process_monitoring: {
    id: "process_monitoring",
    name: "Monitoramento de Processos",
    category: "operacional",
    toolGroups: ["processos", "publicacoes"],
    allowedActions: ["consultar", "monitorar"],
    prompt: `Monitore andamento processual: ultimo movimento, data, andamento esperado e atraso.
    Compare com historico, sinalize prazos criticos e recomende a acao mais util.`,
    keywords: ["andamento", "movimento", "procurando", "atualizacao", "status", "monitor"],
    priority: 2,
  },

  pipeline_operations: {
    id: "pipeline_operations",
    name: "Operacoes de Pipeline",
    category: "operacional",
    toolGroups: ["pipeline", "publicacoes", "processos"],
    allowedActions: ["monitorar", "executar", "auditar"],
    prompt: `Atue como operador interno do pipeline HMADV.
    Priorize status atual, gargalos, fila pendente, risco operacional e proximo passo seguro.
    Se houver acao automatizavel, proponha a execucao mais adequada entre Advise, DataJud, publicacoes e sincronizacao CRM.`,
    keywords: ["pipeline", "backfill", "sync", "sincronizacao", "fila", "datajud", "advise", "gargalo"],
    priority: 1,
  },

  freshworks_operations: {
    id: "freshworks_operations",
    name: "Operacoes Freshworks",
    category: "operacional",
    toolGroups: ["crm", "freshchat", "freshdesk", "oauth"],
    allowedActions: ["consultar", "sincronizar", "atualizar"],
    prompt: `Atue como operador de Freshsales, Freshchat e Freshdesk.
    Identifique se a solicitacao envolve contato, conta, deal, appointment, conversa, ticket, agente, grupo, usuario, note ou OAuth.
    Prefira tools deterministicas por entidade e acao antes de responder em modo generativo.
    Para Freshsales, priorize contato, conta, deal, task e appointment.
    Para Freshchat, priorize conversa, agente, grupo, usuario e atualizacao de conversa.
    Para Freshdesk, priorize ticket, contato, agente, grupo e nota interna.
    Responda de forma objetiva, deixando claro o que esta pronto, parcial ou pendente de integracao, sem prometer endpoints ainda nao cobertos.`,
    keywords: ["freshsales", "freshchat", "freshdesk", "ticket", "contato", "crm", "oauth", "atendimento"],
    priority: 1,
  },

  financial_operations: {
    id: "financial_operations",
    name: "Operacoes Financeiras",
    category: "operacional",
    toolGroups: ["financeiro", "crm"],
    allowedActions: ["listar", "sincronizar", "auditar"],
    prompt: `Trate a solicitacao com foco financeiro e operacional.
    Considere deals, recebiveis, fila de faturamento, status de cobranca e reflexo no CRM.
    Resuma em formato executivo: situacao atual, pendencias e proximo passo.`,
    keywords: ["faturamento", "deal", "financeiro", "cobranca", "recebivel", "honorario", "parcela"],
    priority: 2,
  },

  data_organization: {
    id: "data_organization",
    name: "Organizacao de Informacoes",
    category: "organizacao",
    toolGroups: ["crm", "processos"],
    allowedActions: ["ler_dados", "sincronizar"],
    prompt: `Organize as informacoes do caso com timeline, partes, documentos relevantes, status atual e proximos passos.
    Use formato limpo, com headers curtos e bullets.`,
    keywords: ["organize", "organiza", "resumo", "timeline", "estruture"],
    priority: 2,
  },

  conversational_memory: {
    id: "conversational_memory",
    name: "Memoria e Atendimento",
    category: "organizacao",
    toolGroups: ["freshchat", "agentlab"],
    allowedActions: ["consultar", "sync", "treinamento"],
    prompt: `Use historico de conversas e memoria operacional para responder com continuidade.
    Priorize contexto do cliente, threads anteriores, ultimo contato e proximos passos de atendimento.
    Evite repetir perguntas quando o contexto recente ja estiver disponivel.`,
    keywords: ["memoria", "conversa", "historico", "thread", "atendimento", "agente", "agentlab"],
    priority: 2,
  },

  superendividamento: {
    id: "superendividamento",
    name: "Superendividamento e Renegociacao",
    category: "juridico",
    toolGroups: ["processos", "crm"],
    allowedActions: ["consultar", "ler_dados", "criar"],
    prompt: `Voce e especialista em Superendividamento e Direito do Consumidor.
    Identifique perfil da divida, possibilidade de renegociacao judicial ou extrajudicial, minimo existencial e fundamento legal aplicavel.
    Entregue situacao atual, fundamento legal e recomendacao pratica.`,
    keywords: [
      "superendividamento", "superendividado", "endividamento", "divida",
      "renegociar", "renegociacao", "acordo", "parcela", "minimo existencial",
      "14181", "lei consumidor", "cdc",
    ],
    priority: 1,
  },

  client_summary: {
    id: "client_summary",
    name: "Resumo de Cliente",
    category: "operacional",
    toolGroups: ["crm", "processos"],
    allowedActions: ["ler_dados", "consultar"],
    prompt: `Gere um resumo completo do cliente com identificacao, situacao juridica, historico relevante, situacao financeira e proximos passos.
    Use apenas dados disponiveis no contexto.`,
    keywords: ["resumo cliente", "perfil cliente", "historico cliente", "situacao cliente", "relatorio cliente", "ficha"],
    priority: 2,
  },

  compliance_check: {
    id: "compliance_check",
    name: "Verificacao de Conformidade",
    category: "conformidade",
    toolGroups: ["processos", "crm"],
    allowedActions: ["consultar", "auditar"],
    prompt: `Verifique conformidade com prazos legais e acoes pendentes.
    Identifique prazos vencidos, proximos prazos criticos e recomende validacao humana imediata se houver risco de preclusao.`,
    keywords: ["prazo", "compliance", "conformidade", "vencido", "critico"],
    priority: 1,
  },
};

export function detectSkillFromQuery(query = "") {
  if (!query) return null;

  const queryLower = query.toLowerCase();
  let bestMatch = null;
  let bestScore = 0;

  for (const [_key, skill] of Object.entries(SKILLS_CATALOG)) {
    let score = 0;

    for (const keyword of skill.keywords) {
      if (queryLower.includes(String(keyword).toLowerCase())) {
        score += 10;
      }
    }

    if (skill.category === "juridico" && queryLower.match(/direito|lei|juridic|legal|artigo/i)) {
      score += 5;
    }
    if (skill.category === "operacional" && queryLower.match(/processo|andamento|status|proximo|pipeline|sync|fila|ticket|crm|fresh/i)) {
      score += 5;
    }
    if (skill.category === "organizacao" && queryLower.match(/organize|resume|estruture|timeline|memoria|historico|conversa|thread|atendimento/i)) {
      score += 5;
    }
    if (skill.category === "conformidade" && queryLower.match(/prazo|compliance|vencido|critico/i)) {
      score += 5;
    }

    if (score > bestScore && score > 0) {
      bestScore = score;
      bestMatch = skill;
    }
  }

  return bestMatch;
}

export function enrichContextWithSkill(baseContext = {}, skill) {
  if (!skill) return baseContext;

  return {
    ...baseContext,
    skill: {
      id: skill.id,
      name: skill.name,
      category: skill.category,
      toolGroups: skill.toolGroups,
      allowedActions: skill.allowedActions,
    },
    system_prompt_enhancement: skill.prompt,
  };
}

export function canExecuteSkill(userContext = {}, skill) {
  if (!skill) return false;
  if (!userContext) return true;

  const role = String(userContext.role || "").toLowerCase().trim();
  if (role === "admin" || role === "super" || role === "superadmin") return true;
  if (!role) return true;

  const legalRoles = ["advogado", "advogada", "estagiario", "estagiaria", "paralegal", "staff", "interno", "admin_user"];
  if (legalRoles.some((item) => role.includes(item))) return true;

  const userToolGroups = userContext.authorizedToolGroups || [];
  if (userToolGroups.length > 0) {
    return skill.toolGroups.every((toolGroup) =>
      userToolGroups.some((item) => (typeof item === "object" ? item.key === toolGroup : item === toolGroup))
    );
  }

  return true;
}

export function getSkillsByModule(moduleKey = "") {
  const moduleSkills = [];

  for (const [_key, skill] of Object.entries(SKILLS_CATALOG)) {
    if (skill.name.toLowerCase().includes(moduleKey) || skill.toolGroups.includes(moduleKey)) {
      moduleSkills.push(skill);
    }
  }

  return moduleSkills.sort((a, b) => b.priority - a.priority);
}

export function getSkillById(skillId = "") {
  return SKILLS_CATALOG[skillId] || null;
}

export function listSkills() {
  return Object.values(SKILLS_CATALOG).sort((a, b) => {
    if ((a.priority || 0) !== (b.priority || 0)) {
      return (a.priority || 0) - (b.priority || 0);
    }
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
}

export function resolveExplicitSkill(context = {}) {
  if (!context || typeof context !== "object") return null;

  const directId =
    (typeof context?.selectedSkillId === "string" && context.selectedSkillId.trim()) ||
    (typeof context?.skillId === "string" && context.skillId.trim()) ||
    (typeof context?.skill?.id === "string" && context.skill.id.trim()) ||
    (typeof context?.selectedSkill?.id === "string" && context.selectedSkill.id.trim()) ||
    null;

  if (!directId) return null;
  return getSkillById(directId) || null;
}

export function buildEnhancedSystemPrompt(baseSystemPrompt = "", skill) {
  if (!skill) return baseSystemPrompt;

  return [
    baseSystemPrompt,
    `\n\n---\nContexto de Skill Ativa: ${skill.name} (${skill.category})`,
    `Instrucoes especificas para esta solicitacao:\n${skill.prompt}`,
    `---`,
  ].join("\n");
}
