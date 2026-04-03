/**
 * Skill Registry
 * 
 * Centraliza o registro de habilidades/capacidades do Dotobot,
 * detecta skills por intenção de query e fornece prompts especializados.
 * 
 * Skill = conjunto de tool groups + prompts contextualizados + permissões
 */

export const SKILLS_CATALOG = {
  // Habilidades jurídicas
  legal_analysis: {
    id: "legal_analysis",
    name: "Análise Jurídica",
    category: "juridico",
    toolGroups: ["processos", "crm"],
    allowedActions: ["consultar", "ler_dados"],
    prompt: `Analise este caso sob ótica de Direito do Consumidor, Superendividamento e Direito Civil.
    Estruture em: Fatos relevantes → Questão jurídica → Fundamento legal → Conclusão.
    Cite leis específicas quando houver. Recomende validação humana em decisões estratégicas.`,
    keywords: ["analisar", "analisa", "análise", "caso", "jurídico", "direito", "lei", "fundamento"],
    priority: 1,
  },

  legal_document: {
    id: "legal_document",
    name: "Elaboração de Peças Jurídicas",
    category: "juridico",
    toolGroups: ["processos", "content"],
    allowedActions: ["consultar", "criar"],
    prompt: `Elabore peça jurídica (petição, recurso, parecer) em português formal.
    Use estrutura padrão com: Cabeçalho → Exposição de motivos → Fundamento de direito → Pedidos → Conclusão.
    Inclua números de processo, datas e partes envolvidas. Valide dados antes de gerar documento.`,
    keywords: ["peça", "petição", "recurso", "parecer", "elabore", "crie", "escreva", "redija"],
    priority: 1,
  },

  // Habilidades operacionais
  case_triage: {
    id: "case_triage",
    name: "Triagem de Casos",
    category: "operacional",
    toolGroups: ["crm", "processos"],
    allowedActions: ["ler_dados", "sincronizar", "auditar"],
    prompt: `Triague o novo caso rapidamente: extraia partes, causa jurídica, andamento, urgência.
    Identifique: prazo crítico, ações imediatas, responsável. Classifique urgência (baixa/média/alta/crítica).
    Sumarize em máx 3 bullets. Vincule ao processo existente se houver.`,
    keywords: ["triagem", "novo", "triage", "case", "caso", "lead", "classificar"],
    priority: 2,
  },

  process_monitoring: {
    id: "process_monitoring",
    name: "Monitoramento de Processos",
    category: "operacional",
    toolGroups: ["processos", "publicacoes"],
    allowedActions: ["consultar", "monitorar"],
    prompt: `Monitore andamento processual: último movimento, data, andamento esperado, atraso.
    Compare com histórico: há variação? Riscos? Próximo passo esperado?
    Sinalize prazos críticos e recomende ação se houver atraso anormal.`,
    keywords: ["andamento", "movimento", "procurando", "atualização", "status", "monitor"],
    priority: 2,
  },

  // Habilidades de organização
  data_organization: {
    id: "data_organization",
    name: "Organização de Informações",
    category: "organizacao",
    toolGroups: ["crm", "processos"],
    allowedActions: ["ler_dados", "sincronizar"],
    prompt: `Organize informações do caso de forma estruturada:
    - Timeline de eventos (com datas exatas)
    - Partes envolvidas e papéis
    - Documentos relevantes (lista só disponíveis)
    - Status atual e próximos passos
    Use formato limpo, com headers claros e bullets.`,
    keywords: ["organize", "organiza", "resumo", "timeline", "organize", "estruture"],
    priority: 2,
  },

  // Habilidades de conformidade
  compliance_check: {
    id: "compliance_check",
    name: "Verificação de Conformidade",
    category: "conformidade",
    toolGroups: ["processos", "crm"],
    allowedActions: ["consultar", "auditar"],
    prompt: `Verifique conformidade com prazos legais: Lei 14.181/2021, CPC, código consumidor.
    Identifique: prazos vencidos, próximos prazos críticos, ações pendentes.
    Recomende validação humana imediata se houver risco de preclusão.`,
    keywords: ["prazo", "compliance", "conformidade", "vencido", "crítico"],
    priority: 1,
  },
};

/**
 * Detecta skill baseado em tokens e semântica da query
 */
export function detectSkillFromQuery(query = "") {
  if (!query) return null;

  const queryLower = query.toLowerCase();
  let bestMatch = null;
  let bestScore = 0;

  for (const [_key, skill] of Object.entries(SKILLS_CATALOG)) {
    let score = 0;

    // Match por keywords (high weight)
    for (const keyword of skill.keywords) {
      if (queryLower.includes(keyword.toLowerCase())) {
        score += 10;
      }
    }

    // Match por padrões comuns (medium weight)
    if (skill.category === "juridico" && queryLower.match(/direito|lei|jurídic|legal|artigo/i)) {
      score += 5;
    }
    if (skill.category === "operacional" && queryLower.match(/processo|andamento|status|próximo/i)) {
      score += 5;
    }
    if (skill.category === "organizacao" && queryLower.match(/organize|resume|estruture|timeline/i)) {
      score += 5;
    }
    if (skill.category === "conformidade" && queryLower.match(/prazo|compliance|vencido|crítico/i)) {
      score += 5;
    }

    if (score > bestScore && score > 0) {
      bestScore = score;
      bestMatch = skill;
    }
  }

  return bestMatch;
}

/**
 * Enriquece contexto do chat com prompt e metadados da skill
 */
export function enrichContextWithSkill(baseContext = {}, skill) {
  if (!skill) return baseContext;

  const skillContext = {
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

  return skillContext;
}

/**
 * Validação de permissão: usuário pode executar skill?
 */
export function canExecuteSkill(userContext = {}, skill, toolGroups = []) {
  if (!skill || !userContext) return false;

  // Se tem role "admin" ou "super", permite tudo
  if (userContext.role?.toLowerCase?.() === "admin" || userContext.role?.toLowerCase?.() === "super") {
    return true;
  }

  // Valida se tool groups da skill estão habilitadas para o usuário
  const userToolGroups = userContext.authorizedToolGroups || [];
  const hasAllRequiredTools = skill.toolGroups.every((toolGroup) =>
    userToolGroups.some((u) => u.key === toolGroup || u === toolGroup)
  );

  return hasAllRequiredTools;
}

/**
 * Lista skills disponíveis por módulo/contexto
 */
export function getSkillsByModule(moduleKey = "") {
  const moduleSkills = [];

  for (const [_key, skill] of Object.entries(SKILLS_CATALOG)) {
    // Match skill com módulo por nome ou tool groups
    if (skill.name.toLowerCase().includes(moduleKey) || skill.toolGroups.includes(moduleKey)) {
      moduleSkills.push(skill);
    }
  }

  return moduleSkills.sort((a, b) => b.priority - a.priority);
}

/**
 * Busca skill por ID
 */
export function getSkillById(skillId = "") {
  return SKILLS_CATALOG[skillId] || null;
}

/**
 * Retorna sistema de prompts enriquecido (legacy + skill-specific)
 */
export function buildEnhancedSystemPrompt(baseSystemPrompt = "", skill) {
  if (!skill) return baseSystemPrompt;

  const lines = [baseSystemPrompt, `\n\nContext Skill: ${skill.name}\n${skill.prompt}`];

  return lines.join("\n");
}
