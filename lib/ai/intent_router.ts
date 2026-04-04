import { detectSkillFromQuery } from "../lawdesk/skill_registry.js";

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

export type IntentType = "chat" | "skill" | "task";

export type RoutedIntent = {
  type: IntentType;
  reason: string;
  skill?: {
    id: string;
    name: string;
    category?: string;
  } | null;
};

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
    return { type: context.forceIntent, reason: "forced_by_context" };
  }

  const skillDetectionEnabled = Boolean(features?.chat?.skillsDetection);
  const detectedSkill = skillDetectionEnabled ? detectSkillFromQuery(query) : null;

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
