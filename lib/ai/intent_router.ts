import { detectSkillFromQuery, resolveExplicitSkill } from "../lawdesk/skill_registry.js";

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function hasTaskSignals(query: string): boolean {
  const lower = query.toLowerCase();
  return /(fa(c|ç)a|execute|executar|rodar|inicie|iniciar|crie|gerar|classifique|classificar|analise|analisar|processar|sincronizar|revisar|triagem|pipeline|backfill)/i.test(lower);
}

function hasMultiStepSignals(query: string): boolean {
  const lower = query.toLowerCase();
  return /(\be\b.+\b(depois|em seguida|ent[aã]o)\b|\bpasso\b|\betapa\b|\bworkflow\b|\bplano\b|\bchecklist\b|;)/i.test(lower);
}

function isSimpleChat(query: string): boolean {
  const words = countWords(query);
  const lower = query.toLowerCase();
  const chatSignals = /(oi|ol[áa]|bom dia|boa tarde|boa noite|obrigado|obrigada|pode explicar|o que|qual|como|por que|porque|resuma|resume)/i;
  return words <= 12 && chatSignals.test(lower) && !hasTaskSignals(lower) && !hasMultiStepSignals(lower);
}


export type IntentResult = {
  intent: "create_task" | "analyze_case" | "generate_document" | "query_data" | "chat" | "unknown",
  confidence: number,
  entities: Record<string, any>,
};

export type RoutedIntent = {
  type: "chat" | "skill" | "task";
  reason: string;
  skill?: {
    id: string;
    name: string;
    category?: string | null;
  } | null;
};
// Padrões de intenção operacional
const INTENT_PATTERNS: Array<{ intent: IntentResult["intent"], patterns: RegExp[] }> = [
  { intent: "create_task", patterns: [/criar tarefa/i, /nova tarefa/i, /adicionar tarefa/i] },
  { intent: "analyze_case", patterns: [/analisar processo/i, /análise do processo/i, /analisar caso/i] },
  { intent: "generate_document", patterns: [/gerar peti(c|ç)[aã]o/i, /criar documento/i, /elaborar documento/i] },
  { intent: "query_data", patterns: [/ver prazos/i, /consultar cliente/i, /buscar dados/i] },
  { intent: "chat", patterns: [/oi|ol[áa]|bom dia|boa tarde|boa noite|obrigado|obrigada|pode explicar|o que|qual|como|por que|porque|resuma|resume/i] },
];

export function detectIntent(message: string): IntentResult {
  for (const { intent, patterns } of INTENT_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(message)) {
        return { intent, confidence: 0.95, entities: {} };
      }
    }
  }
  return { intent: "unknown", confidence: 0.5, entities: {} };
}

function resolveModeBiasIntent(context: Record<string, any>, query: string, detectedSkill: any): RoutedIntent | null {
  const modeHint = normalizeText(context?.mode || context?.assistant?.mode).toLowerCase();
  if (!modeHint) return null;

  if (modeHint === "task" && !isSimpleChat(query)) {
    return {
      type: "task",
      reason: "ui_mode_task",
      skill: detectedSkill
        ? { id: detectedSkill.id, name: detectedSkill.name, category: detectedSkill.category }
        : null,
    };
  }

  if (modeHint === "analysis") {
    if (detectedSkill) {
      return {
        type: "skill",
        reason: "ui_mode_analysis_skill",
        skill: { id: detectedSkill.id, name: detectedSkill.name, category: detectedSkill.category },
      };
    }
    if (hasMultiStepSignals(query) || hasTaskSignals(query) || countWords(query) > 14) {
      return {
        type: "task",
        reason: "ui_mode_analysis_complex",
      };
    }
  }

  if (modeHint === "chat" && isSimpleChat(query)) {
    return {
      type: "chat",
      reason: "ui_mode_chat",
    };
  }

  return null;
}

export async function routeIntent(input: {
  query?: string;
  context?: Record<string, any>;
  features?: Record<string, any>;
}): Promise<RoutedIntent> {
  const query = normalizeText(input?.query);
  const context = input?.context || {};
  const features = input?.features || {};

  if (!query) {
    return { type: "chat", reason: "empty_query" };
  }

  if (context?.forceIntent === "chat" || context?.forceIntent === "skill" || context?.forceIntent === "task") {
    const forcedSkill = resolveExplicitSkill(context);
    return {
      type: context.forceIntent,
      reason: "forced_by_context",
      skill: forcedSkill
        ? { id: forcedSkill.id, name: forcedSkill.name, category: forcedSkill.category }
        : null,
    };
  }

  const skillDetectionEnabled = Boolean(features?.chat?.skillsDetection);
  const explicitSkill = resolveExplicitSkill(context);
  const detectedSkill = explicitSkill || (skillDetectionEnabled ? detectSkillFromQuery(query) : null);

  if (explicitSkill) {
    return {
      type: "skill",
      reason: "context_selected_skill",
      skill: { id: explicitSkill.id, name: explicitSkill.name, category: explicitSkill.category },
    };
  }

  const modeBias = resolveModeBiasIntent(context, query, detectedSkill);
  if (modeBias) {
    return modeBias;
  }

  if (hasMultiStepSignals(query) || (countWords(query) > 18 && hasTaskSignals(query))) {
    return {
      type: "task",
      reason: "multi_step_or_complex",
      skill: detectedSkill
        ? { id: detectedSkill.id, name: detectedSkill.name, category: detectedSkill.category }
        : null,
    };
  }

  if (detectedSkill && hasTaskSignals(query)) {
    return {
      type: "skill",
      reason: "domain_skill_detected",
      skill: { id: detectedSkill.id, name: detectedSkill.name, category: detectedSkill.category },
    };
  }

  if (isSimpleChat(query)) {
    return { type: "chat", reason: "simple_chat" };
  }

  if (detectedSkill) {
    return {
      type: "skill",
      reason: "skill_detected",
      skill: { id: detectedSkill.id, name: detectedSkill.name, category: detectedSkill.category },
    };
  }

  if (hasTaskSignals(query)) {
    return { type: "task", reason: "task_signal" };
  }

  return { type: "chat", reason: "default_chat" };
}
