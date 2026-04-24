import { getSupabaseBaseUrl, getSupabaseServerKey } from "../../functions/lib/env.js";
import { executeWorkspaceOp } from "../../functions/lib/workspace-ops.js";

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeText(value) {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function formatNowInSaoPaulo() {
  const now = new Date();
  const dateLabel = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(now);
  const timeLabel = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(now);
  return { now, dateLabel, timeLabel };
}

function extractCnj(value) {
  const match = cleanText(value).match(/\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}|\d{20}/);
  return match ? match[0] : null;
}

function extractUuid(value) {
  const match = cleanText(value).match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i);
  return match ? match[0] : null;
}

function extractInteger(value) {
  const match = cleanText(value).match(/\b\d+\b/);
  return match ? Number(match[0]) : null;
}

function extractDate(value) {
  const match = cleanText(value).match(/\b\d{4}-\d{2}-\d{2}\b/);
  return match ? match[0] : null;
}

function extractFreshchatStatus(value) {
  const normalized = normalizeText(value);
  if (normalized.includes("resolvid")) return "resolved";
  if (normalized.includes("fechad")) return "closed";
  if (normalized.includes("penden")) return "pending";
  if (normalized.includes("abert")) return "open";
  return null;
}

function extractFreshchatPriority(value) {
  const normalized = normalizeText(value);
  if (normalized.includes("urgent")) return "urgent";
  if (normalized.includes("alta") || normalized.includes("high")) return "high";
  if (normalized.includes("media") || normalized.includes("medium")) return "medium";
  if (normalized.includes("baixa") || normalized.includes("low")) return "low";
  return null;
}

function buildDirectResponse(text, data = null, metadata = {}) {
  const message = cleanText(text) || "A acao foi realizada com sucesso.";
  return {
    status: "ok",
    sessionId: `direct-${Date.now()}`,
    resultText: message,
    result: {
      message,
      data,
    },
    steps: [
      {
        type: "tool",
        title: metadata.route || metadata.operation || metadata.functionName || "direct_tool_router",
        status: "ok",
        data,
      },
    ],
    logs: [],
    _metadata: {
      source: "direct_tool_router",
      ...metadata,
    },
  };
}

async function invokeSupabaseEdgeFunction(env, functionName, options = {}) {
  const baseUrl = getSupabaseBaseUrl(env);
  const apiKey = getSupabaseServerKey(env);
  if (!baseUrl || !apiKey) {
    throw new Error("Configuracao do Supabase incompleta para invocar Edge Functions.");
  }

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(options.searchParams || {})) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, String(value));
  }

  const url = `${baseUrl.replace(/\/+$/, "")}/functions/v1/${functionName}${search.size ? `?${search}` : ""}`;
  const method = options.method || (options.body ? "POST" : "GET");
  const response = await fetch(url, {
    method,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const raw = await response.text().catch(() => "");
  let data = raw;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
  }

  if (!response.ok) {
    const detail =
      (data && typeof data === "object" && (data.error || data.message || data.hint)) ||
      raw ||
      `Edge Function ${functionName} falhou com status ${response.status}.`;
    throw new Error(String(detail));
  }

  return data;
}

function summarizeEdgeResult(functionName, payload, context = {}) {
  const data = payload && typeof payload === "object" ? payload : {};
  switch (functionName) {
    case "datajud-search": {
      const numero = data.numero_cnj || data.numeroProcesso || context.numeroProcesso || "processo informado";
      const processoId = data.processo_id || data.processoId || null;
      const movimentos = Number(data.movimentos_persistidos ?? data.movimentos ?? 0);
      const parser = data.parser || data.parser_metadata?.adapter || null;
      return processoId
        ? `Consulta DataJud concluida para ${numero}. Processo persistido com ${movimentos.toLocaleString("pt-BR")} movimentacoes${parser ? ` via parser ${parser}` : ""}.`
        : `Consulta DataJud concluida para ${numero}.`;
    }
    case "processo-sync": {
      const action = context.action || "levantamento";
      if (action === "pipeline") return "Pipeline de sincronizacao de processos executado com sucesso.";
      if (action === "auditoria") return "Auditoria de sincronizacao de processos concluida.";
      if (action === "cron_advise") return "Cron de publicacoes para processos executado com sucesso.";
      if (action === "sync_bidirectional") return "Sincronizacao bidirecional de processos executada com sucesso.";
      if (action === "push_freshsales") return "Envio de processos ao Freshsales concluido com sucesso.";
      if (action === "enriquecer") return "Enriquecimento de processos concluido com sucesso.";
      return "Levantamento de processos executado com sucesso.";
    }
    case "advise-sync": {
      const action = context.action || "sync";
      if (action === "status") {
        return "Status do sincronismo do Advise consultado com sucesso.";
      }
      if (action === "sync_range") {
        return `Sincronizacao de publicacoes do Advise executada para o periodo ${context.data_inicio || "informado"} ate ${context.data_fim || "informado"}.`;
      }
      return "Sincronizacao incremental de publicacoes do Advise executada com sucesso.";
    }
    case "advise-ai-enricher": {
      const total = Number(data.processadas ?? data.total_processadas ?? data.total ?? 0);
      return total
        ? `Enriquecimento semantico do Advise concluido para ${total.toLocaleString("pt-BR")} publicacoes.`
        : "Enriquecimento semantico do Advise executado com sucesso.";
    }
    case "publicacoes-audiencias": {
      const action = context.action || "extract_batch";
      if (action === "status") return "Status da extracao de audiencias consultado com sucesso.";
      if (action === "sync_fs") return "Sincronizacao de audiencias com o Freshsales executada com sucesso.";
      if (action === "extract_one") return `Extracao de audiencia da publicacao ${context.publicacao_id} concluida com sucesso.`;
      return "Extracao de audiencias em lote executada com sucesso.";
    }
    case "publicacoes-prazos": {
      const action = context.action || "calcular_batch";
      if (action === "status") return "Status do calculo de prazos consultado com sucesso.";
      if (action === "alertas") return "Verificacao de alertas de prazos executada com sucesso.";
      if (action === "calcular_single") return `Calculo de prazo da publicacao ${context.publicacao_id} concluido com sucesso.`;
      if (action === "criar_tasks_pendentes") return "Criacao de tasks pendentes de prazos executada com sucesso.";
      return "Calculo de prazos em lote executado com sucesso.";
    }
    case "publicacoes-freshsales": {
      const syncCount = Number(data.processadas ?? data.ok ?? data.total ?? 0);
      return syncCount
        ? `Sincronizacao de publicacoes com o Freshsales concluida para ${syncCount.toLocaleString("pt-BR")} itens.`
        : "Sincronizacao de publicacoes com o Freshsales executada com sucesso.";
    }
    case "fc-ingest-conversations": {
      return "Ingestao de conversas do Freshchat executada com sucesso.";
    }
    case "fc-last-conversation": {
      return data.conversation_id
        ? `A ultima conversa encontrada foi ${data.conversation_id}, com status ${data.status || "n/d"}.`
        : "Consulta da ultima conversa do Freshchat concluida.";
    }
    case "fc-update-conversation": {
      return `Conversa ${data.conversation_id || context.conversation_id} atualizada com sucesso.`;
    }
    case "tpu-enricher": {
      const action = context.action || "enrich_batch";
      if (action === "status") return "Status do enriquecimento TPU consultado com sucesso.";
      if (action === "parse_cnj") return `Parse do CNJ ${context.numero_cnj} concluido com sucesso.`;
      if (action === "enrich_single") return `Enriquecimento TPU do processo ${context.processo_id} concluido com sucesso.`;
      return "Enriquecimento TPU em lote executado com sucesso.";
    }
    case "tpu-sync": {
      const action = context.action || "status";
      if (action === "enriquecer_processo") return `Sincronizacao TPU do processo ${context.processo_id} concluida com sucesso.`;
      if (action === "resolver_movimento_detalhado") return `Resolucao detalhada de movimento TPU ${context.codigo_cnj} concluida com sucesso.`;
      return `Sincronizacao TPU (${action}) executada com sucesso.`;
    }
    default:
      if (typeof payload === "string") return payload;
      return "A acao foi realizada com sucesso.";
  }
}

async function tryWorkspaceOperation(env, operation, args, route) {
  const result = await executeWorkspaceOp(env, operation, args);
  if (!result?.ok && !result?.text) return null;
  return buildDirectResponse(result.text, result.data || null, {
    route,
    operation,
    route_type: "workspace_op",
  });
}

async function tryEdgeFunctionRoute(env, functionName, invocation, route) {
  const data = await invokeSupabaseEdgeFunction(env, functionName, invocation);
  return buildDirectResponse(summarizeEdgeResult(functionName, data, invocation.body || invocation.searchParams || {}), data, {
    route,
    functionName,
    route_type: "edge_function",
  });
}

export async function routeDotobotDirectTool(env, payload = {}) {
  const query = cleanText(payload.query);
  const normalized = normalizeText(query);
  if (!normalized) return { handled: false };

  if (
    normalized.includes("que dia e hoje") ||
    normalized.includes("que dia eh hoje") ||
    normalized.includes("data de hoje") ||
    normalized.includes("hoje e que dia")
  ) {
    const { dateLabel } = formatNowInSaoPaulo();
    return {
      handled: true,
      response: buildDirectResponse(`Hoje e ${dateLabel}.`, { date: dateLabel }, {
        route: "current_date",
        route_type: "built_in",
      }),
    };
  }

  if (
    normalized.includes("que horas sao") ||
    normalized.includes("qual a hora agora") ||
    normalized.includes("hora atual") ||
    normalized.includes("agora sao que horas")
  ) {
    const { dateLabel, timeLabel } = formatNowInSaoPaulo();
    return {
      handled: true,
      response: buildDirectResponse(`Agora sao ${timeLabel} em ${dateLabel}.`, {
        date: dateLabel,
        time: timeLabel,
      }, {
        route: "current_time",
        route_type: "built_in",
      }),
    };
  }

  const cnj = extractCnj(query);
  const uuid = extractUuid(query);
  const date = extractDate(query);
  const numericId = extractInteger(query);

  if (/\bquantos?\b/.test(normalized) && normalized.includes("process")) {
    return { handled: true, response: await tryWorkspaceOperation(env, "count_processes", {}, "count_processes") };
  }
  if (/\bquantas?\b/.test(normalized) && normalized.includes("publica")) {
    return { handled: true, response: await tryWorkspaceOperation(env, "count_publications", {}, "count_publications") };
  }
  if (/\bquantas?\b/.test(normalized) && normalized.includes("movimenta")) {
    return { handled: true, response: await tryWorkspaceOperation(env, "count_movements", {}, "count_movements") };
  }
  if ((/\bquantas?\b/.test(normalized) && normalized.includes("audien")) || normalized.includes("proximas audiencias")) {
    const operation = /\bquantas?\b/.test(normalized) ? "count_appointments" : "upcoming_audiencias";
    return { handled: true, response: await tryWorkspaceOperation(env, operation, {}, operation) };
  }
  if ((/\bquantos?\b/.test(normalized) && normalized.includes("prazo")) || normalized.includes("prazos pendentes")) {
    const operation = /\bquantos?\b/.test(normalized) ? "count_deadlines" : "deadlines_list";
    return { handled: true, response: await tryWorkspaceOperation(env, operation, {}, operation) };
  }
  if (normalized.includes("ultimas publicac") || normalized.includes("ultimas intima")) {
    return { handled: true, response: await tryWorkspaceOperation(env, "recent_publications", {}, "recent_publications") };
  }
  if (cnj && (normalized.includes("resumo do processo") || normalized.includes("detalhes do processo") || normalized.includes("resumo processo"))) {
    return {
      handled: true,
      response: await tryWorkspaceOperation(env, "process_summary_by_cnj", { numero_cnj: cnj }, "process_summary_by_cnj"),
    };
  }
  if (cnj && (normalized.includes("ultimas moviment") || normalized.includes("movimentacoes do processo") || normalized.includes("movimentos do processo"))) {
    return {
      handled: true,
      response: await tryWorkspaceOperation(env, "recent_movements_by_cnj", { numero_cnj: cnj }, "recent_movements_by_cnj"),
    };
  }
  if (normalized.includes("resumo diario")) {
    return { handled: true, response: await tryWorkspaceOperation(env, "daily_summary", {}, "daily_summary") };
  }
  if (normalized.includes("listar deals") || normalized.includes("listar negocios") || normalized.includes("deals do freshsales")) {
    return { handled: true, response: await tryWorkspaceOperation(env, "deals_list", {}, "deals_list") };
  }
  if (normalized.includes("listar contas") || normalized.includes("accounts do freshsales")) {
    return { handled: true, response: await tryWorkspaceOperation(env, "accounts_list", {}, "accounts_list") };
  }
  if (normalized.includes("listar activities") || normalized.includes("listar atividades do freshsales")) {
    return { handled: true, response: await tryWorkspaceOperation(env, "activities_list", {}, "activities_list") };
  }
  if (normalized.includes("listar produtos") || normalized.includes("products do freshsales")) {
    return { handled: true, response: await tryWorkspaceOperation(env, "products_list", {}, "products_list") };
  }
  if (normalized.includes("fila do freshdesk") || normalized.includes("tickets do freshdesk")) {
    return { handled: true, response: await tryWorkspaceOperation(env, "freshdesk_queue", {}, "freshdesk_queue") };
  }
  if (normalized.includes("conversas do freshchat") || normalized.includes("listar conversas do freshchat")) {
    return {
      handled: true,
      response: await tryWorkspaceOperation(env, "freshchat_conversations_list", {}, "freshchat_conversations_list"),
    };
  }

  if ((normalized.includes("datajud") || normalized.includes("consultar cnj") || normalized.includes("buscar processo no datajud")) && cnj) {
    return {
      handled: true,
      response: await tryEdgeFunctionRoute(
        env,
        "datajud-search",
        {
          method: "POST",
          body: {
            numeroProcesso: cnj,
            persistir: true,
          },
        },
        "datajud_search"
      ),
    };
  }

  if ((normalized.includes("sincronizar advise") || normalized.includes("sync advise") || (normalized.includes("sincronizar publica") && normalized.includes("advise")))) {
    const dataInicio = extractDate(query);
    const allDates = cleanText(query).match(/\b\d{4}-\d{2}-\d{2}\b/g) || [];
    const dataFim = allDates.length > 1 ? allDates[1] : null;
    const action = dataInicio && dataFim ? "sync_range" : normalized.includes("status") ? "status" : "sync";
    return {
      handled: true,
      response: await tryEdgeFunctionRoute(
        env,
        "advise-sync",
        {
          method: "GET",
          searchParams: {
            action,
            ...(dataInicio && dataFim ? { data_inicio: dataInicio, data_fim: dataFim } : {}),
          },
        },
        "advise_sync"
      ),
    };
  }

  if (normalized.includes("enriquecer publicac") && normalized.includes("advise")) {
    return {
      handled: true,
      response: await tryEdgeFunctionRoute(
        env,
        "advise-ai-enricher",
        {
          method: "POST",
          body: {
            batch_size: numericId || 20,
          },
        },
        "advise_ai_enricher"
      ),
    };
  }

  if (normalized.includes("sincronizar processo") || normalized.includes("processo sync") || normalized.includes("pipeline de processos")) {
    let action = "levantamento";
    if (normalized.includes("pipeline")) action = "pipeline";
    else if (normalized.includes("auditoria")) action = "auditoria";
    else if (normalized.includes("bidirecional")) action = "sync_bidirectional";
    else if (normalized.includes("enriquec")) action = "enriquecer";
    else if (normalized.includes("freshsales")) action = "push_freshsales";
    else if (normalized.includes("cron advise")) action = "cron_advise";
    return {
      handled: true,
      response: await tryEdgeFunctionRoute(
        env,
        "processo-sync",
        {
          method: "GET",
          searchParams: { action },
        },
        "processo_sync"
      ),
    };
  }

  if (normalized.includes("audiencia") && (normalized.includes("extrair") || normalized.includes("sincronizar"))) {
    const action = normalized.includes("status")
      ? "status"
      : normalized.includes("freshsales")
        ? "sync_fs"
        : normalized.includes("publicacao") && numericId
          ? "extract_one"
          : "extract_batch";
    return {
      handled: true,
      response: await tryEdgeFunctionRoute(
        env,
        "publicacoes-audiencias",
        {
          method: "POST",
          body: {
            action,
            ...(action === "extract_one" ? { publicacao_id: String(numericId) } : {}),
          },
        },
        "publicacoes_audiencias"
      ),
    };
  }

  if (normalized.includes("prazo") && (normalized.includes("calcular") || normalized.includes("alerta") || normalized.includes("status"))) {
    const action = normalized.includes("status")
      ? "status"
      : normalized.includes("alerta")
        ? "alertas"
        : normalized.includes("task")
          ? "criar_tasks_pendentes"
          : normalized.includes("publicacao") && numericId
            ? "calcular_single"
            : "calcular_batch";
    return {
      handled: true,
      response: await tryEdgeFunctionRoute(
        env,
        "publicacoes-prazos",
        {
          method: "POST",
          body: {
            action,
            ...(action === "calcular_single" ? { publicacao_id: String(numericId) } : {}),
            ...(action === "calcular_batch" ? { batch_size: 50 } : {}),
          },
        },
        "publicacoes_prazos"
      ),
    };
  }

  if (normalized.includes("sincronizar publicacoes com freshsales") || normalized.includes("publicacoes freshsales")) {
    return {
      handled: true,
      response: await tryEdgeFunctionRoute(
        env,
        "publicacoes-freshsales",
        {
          method: "GET",
          searchParams: {
            action: "sync",
            batch: numericId || 25,
          },
        },
        "publicacoes_freshsales"
      ),
    };
  }

  if ((normalized.includes("ultima conversa") || normalized.includes("last conversation")) && uuid) {
    return {
      handled: true,
      response: await tryEdgeFunctionRoute(
        env,
        "fc-last-conversation",
        {
          method: "GET",
          searchParams: {
            contact_id: uuid,
          },
        },
        "fc_last_conversation"
      ),
    };
  }

  if ((normalized.includes("atualizar conversa") || normalized.includes("mudar status da conversa")) && uuid) {
    const status = extractFreshchatStatus(query);
    const priority = extractFreshchatPriority(query);
    return {
      handled: true,
      response: await tryEdgeFunctionRoute(
        env,
        "fc-update-conversation",
        {
          method: "POST",
          body: {
            conversation_id: uuid,
            ...(status ? { status } : {}),
            ...(priority ? { priority } : {}),
          },
        },
        "fc_update_conversation"
      ),
    };
  }

  if (normalized.includes("ingerir conversas") || normalized.includes("ingestar conversas") || normalized.includes("ingestao de conversas")) {
    return {
      handled: true,
      response: await tryEdgeFunctionRoute(
        env,
        "fc-ingest-conversations",
        {
          method: "POST",
          body: {},
        },
        "fc_ingest_conversations"
      ),
    };
  }

  if (normalized.includes("parse cnj") && cnj) {
    return {
      handled: true,
      response: await tryEdgeFunctionRoute(
        env,
        "tpu-enricher",
        {
          method: "POST",
          body: {
            action: "parse_cnj",
            numero_cnj: cnj,
          },
        },
        "tpu_enricher_parse_cnj"
      ),
    };
  }

  if (normalized.includes("enriquecer tpu") && numericId) {
    return {
      handled: true,
      response: await tryEdgeFunctionRoute(
        env,
        "tpu-enricher",
        {
          method: "POST",
          body: {
            action: "enrich_single",
            processo_id: String(numericId),
          },
        },
        "tpu_enricher_single"
      ),
    };
  }

  if (normalized.includes("status tpu")) {
    return {
      handled: true,
      response: await tryEdgeFunctionRoute(
        env,
        "tpu-enricher",
        {
          method: "POST",
          body: {
            action: "status",
          },
        },
        "tpu_enricher_status"
      ),
    };
  }

  if ((normalized.includes("sincronizar tpu") || normalized.includes("gateway tpu")) && (numericId || normalized.includes("status"))) {
    const action = normalized.includes("movimento")
      ? "resolver_movimento_detalhado"
      : normalized.includes("classe")
        ? "sync_classes_gateway"
        : normalized.includes("assunto")
          ? "sync_assuntos_gateway"
          : normalized.includes("documento")
            ? "sync_documentos_gateway"
            : normalized.includes("processo") && numericId
              ? "enriquecer_processo"
              : "status";
    return {
      handled: true,
      response: await tryEdgeFunctionRoute(
        env,
        "tpu-sync",
        {
          method: "GET",
          searchParams: {
            action,
            ...(action === "enriquecer_processo" ? { processo_id: String(numericId) } : {}),
            ...(action === "resolver_movimento_detalhado" || action.startsWith("sync_") ? { codigo_cnj: String(numericId) } : {}),
          },
        },
        "tpu_sync"
      ),
    };
  }

  if (normalized.includes("agenda google") && normalized.includes("dispon")) {
    const targetDate = date || new Date().toISOString().slice(0, 10);
    return {
      handled: true,
      response: await tryWorkspaceOperation(
        env,
        "google_calendar_check",
        {
          start: `${targetDate}T08:00:00-03:00`,
          end: `${targetDate}T18:00:00-03:00`,
        },
        "google_calendar_check"
      ),
    };
  }

  return { handled: false };
}
