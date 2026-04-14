export function getModulePlaybook(moduleKey) {
  const playbooks = {
    contacts: { pane: "crm", tag: "crm", checklist: ["Validar mapeamento Freshsales e IDs de contato/account antes de novo lote.", "Checar persistencia no portal e reconciliacao no Supabase."] },
    publicacoes: { pane: "jobs", tag: "jobs", checklist: ["Inspecionar fila, drain e reflexo no Freshsales antes de reenviar.", "Conferir edge functions de extracao e sync posteriores."] },
    processos: { pane: "functions", tag: "functions", checklist: ["Revisar processo-sync, datajud-worker e payload do lote.", "Confirmar IDs de processo e consistencia do espelho operacional."] },
    dotobot: { pane: "dotobot", tag: "dotobot", checklist: ["Checar contexto, tools acionadas e estado do copiloto.", "Confirmar se a falha veio do prompt, do backend ou de permissao."] },
    "ai-task": { pane: "ai-task", tag: "ai-task", checklist: ["Revisar run ativa, provider, embeddings e orchestration path.", "Conferir erros recorrentes antes de reexecutar automacoes."] },
  };
  return playbooks[moduleKey] || null;
}

export function getTagPlaybook(tagKey) {
  const playbooks = {
    webhook: { title: "Playbook webhook", checklist: ["Validar origem, assinatura e deduplicacao antes de reenviar o evento.", "Conferir payload recebido e resposta rapida do endpoint de entrada."] },
    supabase: { title: "Playbook supabase", checklist: ["Revisar RLS, schema, policy e funcoes chamadas pelo fluxo.", "Confirmar erro PostgREST/PGRST e impacto no cache de schema."] },
    functions: { title: "Playbook functions", checklist: ["Inspecionar payload, secrets, timeout e logs da edge/API function.", "Checar dependencia externa antes de reenfileirar ou repetir o lote."] },
    crm: { title: "Playbook CRM", checklist: ["Validar IDs Freshsales, rate limit e mapeamento de campos.", "Confirmar se o espelho no interno e portal bate com o CRM antes do retry."] },
    jobs: { title: "Playbook jobs", checklist: ["Verificar fila, itens presos, drain parcial e volume do lote.", "Checar se o job falhou por timeout, lock ou dado inconsistente."] },
  };
  return playbooks[tagKey] || null;
}

export function getBulkGuardrail(logPane, paneRisk, paneSla, paneEntries = []) {
  const eligible = new Set(["crm", "jobs", "functions"]);
  const moduleLike = new Set(["contacts", "publicacoes", "processos"]);
  if (!eligible.has(logPane) && !moduleLike.has(logPane)) return null;
  const total = paneEntries.length;
  const running = paneEntries.filter((entry) => entry?.status === "running").length;
  const errors = paneEntries.filter((entry) => entry?.severity === "error").length;
  const shouldThrottle = paneRisk.score >= 35 || paneSla.openRecurring > 0 || paneSla.buckets.acima_72h > 0;
  const shouldBlockRetry = paneRisk.score >= 70 || errors >= 4 || paneSla.buckets.acima_72h >= 2;
  return {
    title: shouldBlockRetry ? "Bloqueio preventivo de retry" : "Retry seguro para lotes",
    tone: shouldBlockRetry ? "error" : shouldThrottle ? "warn" : "info",
    summary: shouldBlockRetry
      ? "Existe reincidencia suficiente para evitar novo lote cheio ate revisar causa raiz."
      : shouldThrottle
        ? "O lote deve ser reduzido e reprocessado por fatias menores com observacao reforcada."
        : "Trilha sob controle, mas ainda vale repetir em lotes pequenos quando houver dependencias externas.",
    actions: shouldBlockRetry
      ? ["Nao repetir lote completo agora; priorizar fingerprints abertos e itens acima de 72h.", "Executar validacao de payload, IDs e dependencia externa antes de novo retry."]
      : shouldThrottle
        ? ["Reduzir o lote para uma janela menor e acompanhar no console a cada tentativa.", "Separar itens com erro recorrente antes de reenfileirar o restante."]
        : ["Preferir retry incremental e registrar o resultado no console logo apos a execucao.", "Manter filtros por modulo/tag para isolar regressao rapidamente."],
    metrics: { total, running, errors },
  };
}

export function getConsoleHeightLimits() {
  return { min: 180, max: 560, preferred: 260 };
}
