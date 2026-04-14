import { useEffect } from "react";
import { COVERAGE_VIEWS, OPERATIONAL_VIEWS, RELATION_VIEWS } from "./constants";

export function useProcessosBootstrap(args) {
  useEffect(() => {
    if (!args.uiHydrated) return undefined;
    let cancelled = false;
    args.bootstrappedRef.current = false;
    async function bootstrap() {
      const baseCalls = [args.loadOverview(), args.loadSchemaStatus(), args.loadRunnerMetrics(), args.loadRemoteHistory(), args.loadJobs()];
      const queueCalls = OPERATIONAL_VIEWS.has(args.view) ? [args.loadQueue("sem_movimentacoes", args.setWithoutMovements, args.wmPage), args.loadQueue("movimentacoes_pendentes", args.setMovementBacklog, args.movPage), args.loadQueue("publicacoes_pendentes", args.setPublicationBacklog, args.pubPage), args.loadQueue("partes_sem_contato", args.setPartesBacklog, args.partesPage), args.loadQueue("audiencias_pendentes", args.setAudienciaCandidates, args.audPage), args.loadQueue("monitoramento_ativo", args.setMonitoringActive, args.maPage), args.loadQueue("monitoramento_inativo", args.setMonitoringInactive, args.miPage), args.loadQueue("campos_orfaos", args.setFieldGaps, args.fgPage), args.loadOrphans(args.orphanPage)] : [];
      const coverageCalls = COVERAGE_VIEWS.has(args.view) ? [args.loadCoverage(args.covPage)] : [];
      const relationCalls = RELATION_VIEWS.has(args.view) ? [args.loadRelations(1, args.search), args.loadRelationSuggestions(1, args.search, args.relationMinScore)] : [];
      await Promise.all([...baseCalls, ...queueCalls, ...coverageCalls, ...relationCalls]);
      if (!cancelled) args.bootstrappedRef.current = true;
    }
    bootstrap();
    return () => { cancelled = true; };
  }, [args]);

  useEffect(() => { if (args.bootstrappedRef.current && OPERATIONAL_VIEWS.has(args.view)) args.loadQueue("sem_movimentacoes", args.setWithoutMovements, args.wmPage); }, [args.wmPage, args.view]);
  useEffect(() => { if (args.bootstrappedRef.current && OPERATIONAL_VIEWS.has(args.view)) args.loadQueue("movimentacoes_pendentes", args.setMovementBacklog, args.movPage); }, [args.movPage, args.view]);
  useEffect(() => { if (args.bootstrappedRef.current && OPERATIONAL_VIEWS.has(args.view)) args.loadQueue("publicacoes_pendentes", args.setPublicationBacklog, args.pubPage); }, [args.pubPage, args.view]);
  useEffect(() => { if (args.bootstrappedRef.current && OPERATIONAL_VIEWS.has(args.view)) args.loadQueue("partes_sem_contato", args.setPartesBacklog, args.partesPage); }, [args.partesPage, args.view]);
  useEffect(() => { if (args.bootstrappedRef.current && OPERATIONAL_VIEWS.has(args.view)) args.loadQueue("audiencias_pendentes", args.setAudienciaCandidates, args.audPage); }, [args.audPage, args.view]);
  useEffect(() => { if (args.bootstrappedRef.current && OPERATIONAL_VIEWS.has(args.view)) args.loadQueue("monitoramento_ativo", args.setMonitoringActive, args.maPage); }, [args.maPage, args.view]);
  useEffect(() => { if (args.bootstrappedRef.current && OPERATIONAL_VIEWS.has(args.view)) args.loadQueue("monitoramento_inativo", args.setMonitoringInactive, args.miPage); }, [args.miPage, args.view]);
  useEffect(() => { if (args.bootstrappedRef.current && OPERATIONAL_VIEWS.has(args.view)) args.loadQueue("campos_orfaos", args.setFieldGaps, args.fgPage); }, [args.fgPage, args.view]);
  useEffect(() => { if (args.bootstrappedRef.current && OPERATIONAL_VIEWS.has(args.view)) args.loadOrphans(args.orphanPage); }, [args.orphanPage, args.view]);
  useEffect(() => { if (args.bootstrappedRef.current && RELATION_VIEWS.has(args.view)) args.loadRelations(1, args.search); }, [args.search, args.view]);
  useEffect(() => { if (args.bootstrappedRef.current && RELATION_VIEWS.has(args.view)) args.loadRelationSuggestions(1, args.search, args.relationMinScore); }, [args.search, args.relationMinScore, args.view]);
  useEffect(() => { if (args.uiHydrated && COVERAGE_VIEWS.has(args.view)) args.loadCoverage(args.covPage); }, [args.covPage, args.view, args.uiHydrated]);
  useEffect(() => { const term = args.lookupTerm.trim(); if (!term) return args.setLookup({ loading: false, items: [] }); let cancelled = false; const timeoutId = setTimeout(async () => { args.setLookup((current) => ({ ...current, loading: true })); try { const payload = await args.adminFetch(`/api/admin-hmadv-processos?action=buscar_processos&query=${encodeURIComponent(term)}&limit=8`); if (!cancelled) args.setLookup({ loading: false, items: payload.data.items || [] }); } catch { if (!cancelled) args.setLookup({ loading: false, items: [] }); } }, 250); return () => { cancelled = true; clearTimeout(timeoutId); }; }, [args.lookupTerm]);
  useEffect(() => { args.setAllMatchingRelationsSelected(false); }, [args.search, args.relations.page]);
  useEffect(() => { args.setAllMatchingSuggestionsSelected(false); }, [args.search, args.relationSuggestions.page, args.relationMinScore]);
}
