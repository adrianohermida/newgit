import { COVERAGE_VIEWS, GLOBAL_ERROR_TTL_MS, OPERATIONAL_VIEWS, QUEUE_ERROR_TTL_MS, QUEUE_LABELS, QUEUE_REFRESHERS } from "./constants";

export function useProcessosFetchers(args) {
  const pushQueueRefresh = (key) => args.setQueueRefreshLog((current) => [{ key, label: QUEUE_LABELS[key] || key, ts: new Date().toISOString() }, ...(current || []).filter((item) => item.key !== key)].slice(0, 6));
  const loadOverview = async () => {
    if (args.globalErrorUntil && Date.now() < args.globalErrorUntil) return args.setOverview((state) => ({ ...state, loading: false }));
    try { const payload = await args.adminFetch("/api/admin-hmadv-processos?action=overview"); args.setOverview({ loading: false, data: payload.data }); args.setGlobalError(null); args.setGlobalErrorUntil(null); } catch (error) { args.setOverview({ loading: false, data: null }); args.setGlobalError(error.message || "Falha ao carregar visao geral."); args.setGlobalErrorUntil(Date.now() + GLOBAL_ERROR_TTL_MS); }
  };
  const loadSchemaStatus = async () => {
    if (args.globalErrorUntil && Date.now() < args.globalErrorUntil) return args.setSchemaStatus((state) => ({ ...state, loading: false }));
    try { const payload = await args.adminFetch("/api/admin-hmadv-processos?action=schema_status"); args.setSchemaStatus({ loading: false, data: payload.data }); args.setGlobalError(null); args.setGlobalErrorUntil(null); } catch (error) { args.setSchemaStatus({ loading: false, data: null }); args.setGlobalError(error.message || "Falha ao ler schema."); args.setGlobalErrorUntil(Date.now() + GLOBAL_ERROR_TTL_MS); }
  };
  const loadRunnerMetrics = async () => {
    if (args.globalErrorUntil && Date.now() < args.globalErrorUntil) return args.setRunnerMetrics((state) => ({ ...state, loading: false }));
    try { const payload = await args.adminFetch("/api/admin-hmadv-processos?action=runner_metrics"); args.setRunnerMetrics({ loading: false, data: payload.data }); args.setGlobalError(null); args.setGlobalErrorUntil(null); } catch (error) { args.setRunnerMetrics({ loading: false, data: null }); args.setGlobalError(error.message || "Falha ao carregar runner."); args.setGlobalErrorUntil(Date.now() + GLOBAL_ERROR_TTL_MS); }
  };
  const loadCoverage = async (page = 1) => {
    if (args.schemaStatus?.data?.exists === false) { args.setProcessCoverage({ loading: false, items: [], totalRows: 0, page, pageSize: 20, unsupported: true, limited: false, error: null }); return pushQueueRefresh("cobertura"); }
    args.setProcessCoverage((state) => ({ ...state, loading: true }));
    try { const payload = await args.adminFetch(`/api/admin-hmadv-processos?action=cobertura_processos&page=${page}&pageSize=20`); args.setProcessCoverage({ loading: false, items: payload.data.items || [], totalRows: payload.data.totalRows || 0, page: payload.data.page || page, pageSize: payload.data.pageSize || 20, unsupported: false, limited: Boolean(payload.data.limited), error: payload.data?.error || null }); } catch (error) { args.setProcessCoverage((state) => ({ loading: false, items: state?.items || [], totalRows: state?.totalRows || 0, page, pageSize: state?.pageSize || 20, unsupported: false, limited: Boolean(state?.limited), error: error.message || "Falha ao carregar cobertura." })); } pushQueueRefresh("cobertura");
  };
  const loadQueue = async (action, setter, page) => {
    setter((state) => ({ ...state, loading: true, error: null }));
    setter((state) => state?.errorUntil && Date.now() < state.errorUntil ? { ...state, loading: false } : state);
    try { const payload = await args.adminFetch(`/api/admin-hmadv-processos?action=${action}&page=${page}&pageSize=20`); const payloadError = payload.data?.error || null; setter({ loading: false, items: (payload.data.items || []).map((item) => ({ ...item, key: item.numero_cnj || item.id })), totalRows: payload.data.totalRows || 0, page: payload.data.page || page, pageSize: payload.data.pageSize || 20, unsupported: Boolean(payload.data.unsupported), updatedAt: new Date().toISOString(), limited: Boolean(payload.data.limited), error: payloadError, errorUntil: payloadError ? Date.now() + QUEUE_ERROR_TTL_MS : null }); } catch (error) { setter((state) => ({ loading: false, items: state?.items || [], totalRows: state?.totalRows || 0, page, pageSize: 20, unsupported: Boolean(state?.unsupported), updatedAt: state?.updatedAt || new Date().toISOString(), limited: Boolean(state?.limited), error: error.message || "Falha ao carregar fila.", errorUntil: Date.now() + QUEUE_ERROR_TTL_MS })); } pushQueueRefresh(action);
  };
  const loadOrphans = async (page = 1) => {
    args.setOrphans((state) => ({ ...state, loading: true }));
    try { const payload = await args.adminFetch(`/api/admin-hmadv-processos?action=orfaos&page=${page}&pageSize=20`); args.setOrphans({ loading: false, items: (payload.data.items || []).map((item) => ({ ...item, key: item.numero_cnj || item.id })), totalRows: payload.data.totalRows || 0, page: payload.data.page || page, pageSize: payload.data.pageSize || 20, updatedAt: new Date().toISOString() }); } catch { args.setOrphans({ loading: false, items: [], totalRows: 0, page, pageSize: 20, updatedAt: new Date().toISOString() }); } pushQueueRefresh("orfaos");
  };
  const loadRelations = async (page = 1, query = "") => {
    args.setRelations((current) => ({ ...current, loading: true, error: null }));
    try { const payload = await args.adminFetch(`/api/admin-hmadv-processos?action=relacoes&page=${page}&pageSize=20&query=${encodeURIComponent(query || "")}`); args.setRelations({ loading: false, error: null, items: payload.data.items || [], totalRows: payload.data.totalRows || 0, page: payload.data.page || page, pageSize: payload.data.pageSize || 20 }); } catch (error) { args.setRelations({ loading: false, error: error.message || "Falha ao carregar relacoes.", items: [], totalRows: 0, page, pageSize: 20 }); }
  };
  const loadRelationSuggestions = async (page = 1, query = "", minScore = args.relationMinScore) => {
    args.setRelationSuggestions((current) => ({ ...current, loading: true, error: null }));
    try { const payload = await args.adminFetch(`/api/admin-hmadv-processos?action=sugestoes_relacoes&page=${page}&pageSize=20&query=${encodeURIComponent(query || "")}&minScore=${encodeURIComponent(minScore || "0.45")}`); args.setRelationSuggestions({ loading: false, error: null, items: payload.data.items || [], totalRows: payload.data.totalRows || 0, page: payload.data.page || page, pageSize: payload.data.pageSize || 20 }); } catch (error) { args.setRelationSuggestions({ loading: false, error: error.message || "Falha ao carregar sugestoes.", items: [], totalRows: 0, page, pageSize: 20 }); }
  };
  const loadRemoteHistory = async () => { if (!(args.globalErrorUntil && Date.now() < args.globalErrorUntil)) try { const payload = await args.adminFetch("/api/admin-hmadv-processos?action=historico&limit=20"); args.setRemoteHistory(payload.data.items || []); args.setGlobalError(null); args.setGlobalErrorUntil(null); } catch { args.setRemoteHistory([]); } };
  const loadJobs = async () => { if (!(args.globalErrorUntil && Date.now() < args.globalErrorUntil)) try { const payload = await args.adminFetch("/api/admin-hmadv-processos?action=jobs&limit=12"); args.setJobs(payload.data.items || []); args.setGlobalError(null); args.setGlobalErrorUntil(null); } catch { args.setJobs([]); } };
  const mergeJobIntoState = (job) => { if (!job?.id) return; args.setJobs((current) => { const next = Array.isArray(current) ? [...current] : []; const index = next.findIndex((item) => item.id === job.id); if (index >= 0) next[index] = { ...next[index], ...job }; else next.unshift(job); return next.slice(0, 12); }); };
  const buildRefreshPlan = (action, payload = {}) => {
    const intent = String(payload.intent || "").trim();
    const queues = new Set();
    let coverage = false, orphans = false;
    if (action === "push_orfaos") orphans = true;
    else if (action === "repair_freshsales_accounts") queues.add(QUEUE_REFRESHERS.campos_orfaos);
    else if (action === "sync_supabase_crm") { coverage = true; [QUEUE_REFRESHERS.movimentacoes_pendentes, QUEUE_REFRESHERS.publicacoes_pendentes, QUEUE_REFRESHERS.partes_sem_contato, QUEUE_REFRESHERS.campos_orfaos].forEach((item) => queues.add(item)); }
    else if (action === "sincronizar_movimentacoes_activity") queues.add(QUEUE_REFRESHERS.movimentacoes_pendentes);
    else if (action === "sincronizar_publicacoes_activity") queues.add(QUEUE_REFRESHERS.publicacoes_pendentes);
    else if (action === "reconciliar_partes_contatos") queues.add(QUEUE_REFRESHERS.partes_sem_contato);
    else if (action === "backfill_audiencias") queues.add(QUEUE_REFRESHERS.audiencias_pendentes);
    else if (action === "monitoramento_status") { queues.add(QUEUE_REFRESHERS.monitoramento_ativo); queues.add(QUEUE_REFRESHERS.monitoramento_inativo); }
    else if (action === "enriquecer_datajud") { if (intent === "sincronizar_monitorados") { queues.add(QUEUE_REFRESHERS.monitoramento_ativo); queues.add(QUEUE_REFRESHERS.monitoramento_inativo); } else if (intent === "reenriquecer_gaps") queues.add(QUEUE_REFRESHERS.campos_orfaos); else { queues.add(QUEUE_REFRESHERS.sem_movimentacoes); queues.add(QUEUE_REFRESHERS.movimentacoes_pendentes); } }
    return { queues: [...queues], coverage, orphans };
  };
  const refreshOperationalQueues = async ({ forceAll = false } = {}) => {
    const calls = [loadOverview()];
    if (forceAll || COVERAGE_VIEWS.has(args.view)) calls.push(loadCoverage(args.covPage));
    if (forceAll || OPERATIONAL_VIEWS.has(args.view)) calls.push(loadQueue("sem_movimentacoes", args.setWithoutMovements, args.wmPage), loadQueue("movimentacoes_pendentes", args.setMovementBacklog, args.movPage), loadQueue("publicacoes_pendentes", args.setPublicationBacklog, args.pubPage), loadQueue("partes_sem_contato", args.setPartesBacklog, args.partesPage), loadQueue("audiencias_pendentes", args.setAudienciaCandidates, args.audPage), loadQueue("monitoramento_ativo", args.setMonitoringActive, args.maPage), loadQueue("monitoramento_inativo", args.setMonitoringInactive, args.miPage), loadQueue("campos_orfaos", args.setFieldGaps, args.fgPage), loadOrphans(args.orphanPage));
    await Promise.all(calls);
  };
  const refreshAfterAction = async (action, payload = {}) => {
    const plan = buildRefreshPlan(action, payload);
    const calls = [loadOverview()];
    if (plan.coverage) calls.push(loadCoverage(args.covPage));
    if (plan.orphans) calls.push(loadOrphans(args.orphanPage));
    plan.queues.forEach((queue) => { if (queue === QUEUE_REFRESHERS.sem_movimentacoes) calls.push(loadQueue("sem_movimentacoes", args.setWithoutMovements, args.wmPage)); if (queue === QUEUE_REFRESHERS.movimentacoes_pendentes) calls.push(loadQueue("movimentacoes_pendentes", args.setMovementBacklog, args.movPage)); if (queue === QUEUE_REFRESHERS.publicacoes_pendentes) calls.push(loadQueue("publicacoes_pendentes", args.setPublicationBacklog, args.pubPage)); if (queue === QUEUE_REFRESHERS.partes_sem_contato) calls.push(loadQueue("partes_sem_contato", args.setPartesBacklog, args.partesPage)); if (queue === QUEUE_REFRESHERS.audiencias_pendentes) calls.push(loadQueue("audiencias_pendentes", args.setAudienciaCandidates, args.audPage)); if (queue === QUEUE_REFRESHERS.monitoramento_ativo) calls.push(loadQueue("monitoramento_ativo", args.setMonitoringActive, args.maPage)); if (queue === QUEUE_REFRESHERS.monitoramento_inativo) calls.push(loadQueue("monitoramento_inativo", args.setMonitoringInactive, args.miPage)); if (queue === QUEUE_REFRESHERS.campos_orfaos) calls.push(loadQueue("campos_orfaos", args.setFieldGaps, args.fgPage)); });
    await Promise.all([...calls, loadRemoteHistory(), loadJobs()]);
  };
  const refreshOperationalContext = async (options = {}) => Promise.all([refreshOperationalQueues(options), loadRemoteHistory(), loadJobs()]);

  return { buildRefreshPlan, loadCoverage, loadJobs, loadOrphans, loadOverview, loadQueue, loadRelationSuggestions, loadRelations, loadRemoteHistory, loadRunnerMetrics, loadSchemaStatus, mergeJobIntoState, pushQueueRefresh, refreshAfterAction, refreshOperationalContext, refreshOperationalQueues };
}
