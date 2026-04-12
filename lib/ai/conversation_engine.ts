// Função simples de similaridade (baseada em caracteres)
function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  const s1 = str1.toLowerCase().replace(/\s+/g, "");
  const s2 = str2.toLowerCase().replace(/\s+/g, "");
  let matches = 0;
  for (let i = 0; i < Math.min(s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) matches++;
  }
  return matches / Math.max(s1.length, s2.length);
}

function isRepeatedAssistantResponse(conversation: any, newText: string, threshold = 0.9): boolean {
  const turns = conversation?.turns || [];
  const lastAssistant = [...turns].reverse().find((t) => t.role === "assistant" && typeof t.text === "string");
  if (!lastAssistant) return false;
  return calculateSimilarity(lastAssistant.text, newText) >= threshold;
}
import { runLawdeskChat } from "../lawdesk/chat.js";
import { buildDotobotRepositoryContext } from "../lawdesk/capabilities.js";
import { canExecuteSkill, detectSkillFromQuery, enrichContextWithSkill, resolveExplicitSkill } from "../lawdesk/skill_registry.js";
import { startTaskRun } from "../lawdesk/task_runs.js";
import { routeIntent } from "./intent_router";

const CONVERSATION_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_TURNS = 24;

function nowIso() {
  return new Date().toISOString();
}

function createConversationId() {
  return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getStore(): Map<string, any> {
  if (!(globalThis as any).__HMDAV_CONVERSATIONS__) {
    (globalThis as any).__HMDAV_CONVERSATIONS__ = new Map();
  }
  const store = (globalThis as any).__HMDAV_CONVERSATIONS__ as Map<string, any>;
  const cutoff = Date.now() - CONVERSATION_TTL_MS;
  for (const [id, convo] of store.entries()) {
    const updated = Date.parse(convo?.updated_at || convo?.created_at || 0);
    if (!Number.isFinite(updated) || updated < cutoff) {
      store.delete(id);
    }
  }
  return store;
}

function ensureConversation(conversationId: string, context: Record<string, any>) {
  const store = getStore();
  const existing = store.get(conversationId);
  if (existing) return existing;
  const created = {
    id: conversationId,
    created_at: nowIso(),
    updated_at: nowIso(),
    topic: null,
    intents: [],
    turns: [],
    contextSnapshot: {
      route: context?.route || "/interno/ai-task",
      profile: context?.profile || null,
    },
  };
  store.set(conversationId, created);
  return created;
}

function appendTurn(conversation: any, turn: any) {
  const nextTurns = [...(conversation.turns || []), turn].slice(-MAX_TURNS);
  conversation.turns = nextTurns;
  conversation.updated_at = nowIso();
  return conversation;
}

function appendIntent(conversation: any, intent: any) {
  conversation.intents = [...(conversation.intents || []), { ...intent, ts: nowIso() }].slice(-MAX_TURNS);
  conversation.updated_at = nowIso();
  return conversation;
}

function buildHistoryTurns(conversation: any) {
  return (conversation?.turns || []).slice(-12).map((turn: any) => ({
    role: turn.role,
    text: turn.text,
    createdAt: turn.created_at,
  }));
}

function toApiResponse(status: number, data: Record<string, any>) {
  return {
    ok: status >= 200 && status < 300,
    status,
    data,
  };
}

export async function processConversationTurn(
  env: Record<string, any>,
  payload: Record<string, any> = {},
  features: Record<string, any> = {},
  options: Record<string, any> = {}
) {
  const query = typeof payload?.query === "string" ? payload.query.trim() : "";
  const context = payload?.context || {};
  const mode = typeof payload?.mode === "string" ? payload.mode : "assisted";
  const provider = typeof payload?.provider === "string" ? payload.provider : "gpt";
  const conversationId =
    (typeof payload?.conversationId === "string" && payload.conversationId.trim()) ||
    (typeof context?.conversationId === "string" && context.conversationId.trim()) ||
    createConversationId();

  if (!query) {
    return toApiResponse(400, {
      conversationId,
      intent: { type: "chat", reason: "empty_query" },
      resultText: "Campo query obrigatorio.",
      uiState: "responding",
    });
  }

  const conversation = ensureConversation(conversationId, context);
  appendTurn(conversation, {
    id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    role: "user",
    text: query,
    created_at: nowIso(),
  });

  const routedIntent = await routeIntent({ query, context, features });
  appendIntent(conversation, routedIntent);

  const repositoryContext = buildDotobotRepositoryContext(context);
  const sharedContext = {
    ...context,
    conversationId,
    history: buildHistoryTurns(conversation),
    repositoryContext,
    features,
  };

  if (routedIntent.type === "chat") {
    const chatData = await runLawdeskChat(env, {
      query,
      context: {
        ...sharedContext,
        assistant: {
          ...(sharedContext.assistant || {}),
          mode: "conversation",
        },
      },
    });

    const resultText =
      typeof chatData?.resultText === "string"
        ? chatData.resultText
        : typeof chatData?.result === "string"
          ? chatData.result
          : "Sem resposta do assistente.";

    // Anti-loop: evitar resposta repetida
    let finalResultText = resultText;
    if (isRepeatedAssistantResponse(conversation, resultText)) {
      finalResultText = "(⚠️ Resposta semelhante à anterior detectada. Por favor, refine sua pergunta ou aguarde nova informação/contexto.)";
    }
    appendTurn(conversation, {
      id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      role: "assistant",
      text: finalResultText,
      created_at: nowIso(),
      meta: { intent: "chat" },
    });

    return toApiResponse(200, {
      ...chatData,
      conversationId,
      intent: routedIntent,
      resultText: finalResultText,
      uiState: "responding",
      mode: "chat",
    });
  }

  if (routedIntent.type === "skill") {
    const detectedSkill = resolveExplicitSkill(sharedContext) || detectSkillFromQuery(query);
    if (!detectedSkill) {
      return toApiResponse(200, {
        conversationId,
        intent: routedIntent,
        mode: "chat",
        uiState: "responding",
        resultText: "Não identifiquei uma skill específica. Vou responder em modo conversacional.",
      });
    }

    const userContext = {
      role: repositoryContext?.actor?.role || context?.profile?.role || null,
      authorizedToolGroups: repositoryContext?.authorizedToolGroups || [],
    };

    if (!canExecuteSkill(userContext, detectedSkill)) {
      return toApiResponse(403, {
        conversationId,
        intent: routedIntent,
        mode: "skill",
        uiState: "responding",
        resultText: "Seu perfil não possui permissão para executar essa skill.",
        errorType: "forbidden",
      });
    }

    const enhancedContext = enrichContextWithSkill(repositoryContext, detectedSkill);
    const skillData = await runLawdeskChat(env, {
      query,
      context: {
        ...sharedContext,
        ...enhancedContext,
        repositoryContext: enhancedContext,
      },
    });

    const resultText =
      typeof skillData?.resultText === "string"
        ? skillData.resultText
        : typeof skillData?.result === "string"
          ? skillData.result
          : "Skill executada sem texto de saída.";

    appendTurn(conversation, {
      id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      role: "assistant",
      text: resultText,
      created_at: nowIso(),
      meta: { intent: "skill", skill: detectedSkill.id },
    });

    return toApiResponse(200, {
      ...skillData,
      conversationId,
      intent: {
        ...routedIntent,
        skill: {
          id: detectedSkill.id,
          name: detectedSkill.name,
          category: detectedSkill.category,
        },
      },
      resultText,
      uiState: "planning",
      mode: "skill",
    });
  }

  try {
    const taskResult: any = await startTaskRun(
      env,
      {
        query,
        mode,
        provider,
        context: {
          ...sharedContext,
          conversationId,
        },
        waitForCompletion: false,
      },
      features,
      options
    );

    const taskData = taskResult && typeof taskResult === "object" && "data" in taskResult ? taskResult.data : null;
    const runId = taskData?.run?.id || null;
    const ackText = runId
      ? `Entendido. Iniciei uma execução estruturada (run ${runId}) e vou te mantendo atualizado.`
      : "Entendido. Iniciei uma execução estruturada e vou te mantendo atualizado.";

    appendTurn(conversation, {
      id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      role: "assistant",
      text: ackText,
      created_at: nowIso(),
      meta: { intent: "task", runId },
    });

    return toApiResponse(taskResult?.status || 202, {
      ...(taskData || {}),
      conversationId,
      intent: routedIntent,
      resultText: ackText,
      uiState: "executing",
      mode: "task",
      taskRun: taskData?.run || null,
    });
  } catch (error: any) {
    const fallbackText =
      `Não consegui iniciar a execução agora (${error?.message || "erro interno"}). ` +
      "Posso te orientar em modo conversacional enquanto estabilizamos a execução.";

    appendTurn(conversation, {
      id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      role: "assistant",
      text: fallbackText,
      created_at: nowIso(),
      meta: { intent: "task_fallback" },
    });

    return toApiResponse(200, {
      conversationId,
      intent: routedIntent,
      resultText: fallbackText,
      uiState: "responding",
      mode: "chat",
      fallback: true,
    });
  }
}
