import Link from "next/link";
import { useEffect, useState } from "react";
import InternoLayout from "../../components/interno/InternoLayout";
import RequireAdmin from "../../components/interno/RequireAdmin";
import { useInternalTheme } from "../../components/interno/InternalThemeProvider";
import { FALLBACK_BLOG_POSTS } from "../../lib/blog/fallback-posts";
import { adminFetch } from "../../lib/admin/api";

function StatCard({ label, value, helper, isLightTheme }) {
  return (
    <div className={`border p-6 ${isLightTheme ? "border-[#D4DEE8] bg-[rgba(255,255,255,0.9)]" : "border-[#2D2E2E] bg-[rgba(13,15,14,0.96)]"}`}>
      <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-3 opacity-50">{label}</p>
      <p className="font-serif text-4xl mb-2">{value}</p>
      <p className="text-sm opacity-55 leading-relaxed">{helper}</p>
    </div>
  );
}

function ModeBadge({ active, label, isLightTheme }) {
  return (
    <span className={`inline-flex items-center border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
      active
        ? `border-[#C5A059] bg-[rgba(197,160,89,0.12)] ${isLightTheme ? "text-[#9A6E2D]" : "text-[#E7C98C]"}`
        : `${isLightTheme ? "border-[#D4DEE8]" : "border-[#2D2E2E]"} opacity-65`
    }`}>
      {label}
    </span>
  );
}

function FocusLink({ href, title, helper, isLightTheme }) {
  return (
    <Link href={href} prefetch={false} className={`block border p-4 hover:border-[#C5A059] ${isLightTheme ? "border-[#D4DEE8] bg-[rgba(255,255,255,0.88)]" : "border-[#2D2E2E] bg-[rgba(10,12,11,0.82)]"}`}>
      <p className="text-sm font-semibold mb-1">{title}</p>
      <p className="text-sm opacity-65">{helper}</p>
    </Link>
  );
}

function RecentJobList({ title, items, isLightTheme }) {
  return (
    <div className={`border p-4 text-sm ${isLightTheme ? "border-[#D4DEE8] bg-[rgba(255,255,255,0.82)]" : "border-[#2D2E2E]"}`}>
      <p className="font-semibold mb-2">{title}</p>
      {items?.length ? (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className={`border p-3 ${isLightTheme ? "border-[#D4DEE8] bg-[#F7FAFC]" : "border-[#2D2E2E]"}`}>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="font-semibold">{item.acao || "acao"}</span>
                <ModeBadge active={true} label={String(item.status || "desconhecido")} isLightTheme={isLightTheme} />
              </div>
              <p className="opacity-65">
                {item.updated_at ? new Date(item.updated_at).toLocaleString("pt-BR") : "Sem horario"}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="opacity-65">Sem jobs recentes.</p>
      )}
    </div>
  );
}

function CycleCard({ title, cycle, isLightTheme }) {
  const perfClass =
    cycle?.performanceStatus === "good"
      ? "border-[#3A5E46] bg-[rgba(58,94,70,0.12)] text-[#A7D7B4]"
      : cycle?.performanceStatus === "partial"
        ? "border-[#7A6431] bg-[rgba(122,100,49,0.12)] text-[#E7C98C]"
        : "border-[#5B3535] bg-[rgba(91,53,53,0.12)] text-[#E7B3B3]";
  return (
    <div className={`border p-4 text-sm ${isLightTheme ? "border-[#D4DEE8] bg-[rgba(255,255,255,0.82)]" : "border-[#2D2E2E]"}`}>
      <p className="font-semibold mb-2">{title}</p>
      {cycle ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{cycle.acao || "acao"}</span>
            <ModeBadge active={true} label={String(cycle.status || "desconhecido")} isLightTheme={isLightTheme} />
            <span className={`inline-flex items-center border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${perfClass}`}>
              {cycle.performanceLabel || "Sem leitura"}
            </span>
          </div>
          <p className="opacity-65">
            {cycle.updatedAt ? new Date(cycle.updatedAt).toLocaleString("pt-BR") : "Sem horario"}
          </p>
          <div className="grid gap-2 sm:grid-cols-4">
            <div className={`border p-2 ${isLightTheme ? "border-[#D4DEE8] bg-[#F7FAFC]" : "border-[#2D2E2E]"}`}>
              <p className="text-[11px] uppercase tracking-[0.14em] opacity-55 mb-1">Solicitados</p>
              <p className="font-semibold">{cycle.requestedCount || 0}</p>
            </div>
            <div className={`border p-2 ${isLightTheme ? "border-[#D4DEE8] bg-[#F7FAFC]" : "border-[#2D2E2E]"}`}>
              <p className="text-[11px] uppercase tracking-[0.14em] opacity-55 mb-1">Processados</p>
              <p className="font-semibold">{cycle.processedCount || 0}</p>
            </div>
            <div className={`border p-2 ${isLightTheme ? "border-[#D4DEE8] bg-[#F7FAFC]" : "border-[#2D2E2E]"}`}>
              <p className="text-[11px] uppercase tracking-[0.14em] opacity-55 mb-1">Sucessos</p>
              <p className="font-semibold">{cycle.successCount || 0}</p>
            </div>
            <div className={`border p-2 ${isLightTheme ? "border-[#D4DEE8] bg-[#F7FAFC]" : "border-[#2D2E2E]"}`}>
              <p className="text-[11px] uppercase tracking-[0.14em] opacity-55 mb-1">Falhas</p>
              <p className="font-semibold">{cycle.errorCount || 0}</p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className={`border p-2 ${isLightTheme ? "border-[#D4DEE8] bg-[#F7FAFC]" : "border-[#2D2E2E]"}`}>
              <p className="text-[11px] uppercase tracking-[0.14em] opacity-55 mb-1">Taxa de sucesso</p>
              <p className="font-semibold">{cycle.successRate ?? 0}%</p>
            </div>
            <div className={`border p-2 ${isLightTheme ? "border-[#D4DEE8] bg-[#F7FAFC]" : "border-[#2D2E2E]"}`}>
              <p className="text-[11px] uppercase tracking-[0.14em] opacity-55 mb-1">Cobertura do lote</p>
              <p className="font-semibold">{cycle.coverageRate ?? 0}%</p>
            </div>
          </div>
        </div>
      ) : (
        <p className="opacity-65">Sem ciclo recente.</p>
      )}
    </div>
  );
}

function TrendCard({ title, trend, isLightTheme }) {
  const toneClass =
    trend?.label === "Melhorando"
      ? "border-[#3A5E46] bg-[rgba(58,94,70,0.12)] text-[#A7D7B4]"
      : trend?.label === "Piorando"
        ? "border-[#5B3535] bg-[rgba(91,53,53,0.12)] text-[#E7B3B3]"
        : "border-[#7A6431] bg-[rgba(122,100,49,0.12)] text-[#E7C98C]";
  return (
    <div className={`border p-4 text-sm ${isLightTheme ? "border-[#D4DEE8] bg-[rgba(255,255,255,0.82)]" : "border-[#2D2E2E]"}`}>
      <p className="font-semibold mb-2">{title}</p>
      {trend ? (
        <div className="space-y-2">
          <span className={`inline-flex items-center border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${toneClass}`}>
            {trend.label}
          </span>
          <p className="opacity-75">{trend.reason}</p>
        </div>
      ) : (
        <p className="opacity-65">Sem tendencia recente.</p>
      )}
    </div>
  );
}

function AlertCard({ alert, isLightTheme }) {
  const toneClass =
    alert?.level === "critico"
      ? "border-[#5B3535] bg-[rgba(91,53,53,0.12)]"
      : alert?.level === "atencao"
        ? "border-[#7A6431] bg-[rgba(122,100,49,0.12)]"
        : "border-[#2D4E63] bg-[rgba(45,78,99,0.12)]";
  return (
    <div className={`border p-4 text-sm ${toneClass} ${isLightTheme ? "text-[#13201D]" : ""}`}>
      <p className="text-[11px] uppercase tracking-[0.14em] opacity-55 mb-1">{alert?.level || "info"}</p>
      <p className="font-semibold mb-1">{alert?.title || "Alerta"}</p>
      <p className="opacity-75">{alert?.message || ""}</p>
    </div>
  );
}

function ModuleCommandCard({ module, isLightTheme }) {
  const urgencyClass =
    module?.urgency === "Critica"
      ? "border-[#5B3535] bg-[rgba(91,53,53,0.12)] text-[#E7B3B3]"
      : module?.urgency === "Alta"
        ? "border-[#7A6431] bg-[rgba(122,100,49,0.12)] text-[#E7C98C]"
        : module?.urgency === "Media"
          ? "border-[#2D4E63] bg-[rgba(45,78,99,0.12)] text-[#B8D9F0]"
          : "border-[#2D2E2E] opacity-75";
  return (
    <Link
      href={module?.href || "/interno"}
      prefetch={false}
      className={`block border p-4 text-sm hover:border-[#C5A059] ${
        module?.focused
          ? "border-[#C5A059] bg-[rgba(197,160,89,0.08)]"
          : isLightTheme
            ? "border-[#D4DEE8] bg-[rgba(255,255,255,0.88)]"
            : "border-[#2D2E2E] bg-[rgba(10,12,11,0.82)]"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <p className="font-semibold">{module?.label || "Modulo"}</p>
        {module?.focused ? <ModeBadge active={true} label="foco" isLightTheme={isLightTheme} /> : null}
        <span className={`inline-flex items-center border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${urgencyClass}`}>
          {module?.urgency || "Baixa"}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3 mb-3">
        <div className={`border p-2 ${isLightTheme ? "border-[#D4DEE8] bg-[#F7FAFC]" : "border-[#2D2E2E]"}`}>
          <p className="text-[11px] uppercase tracking-[0.14em] opacity-55 mb-1">Pendentes</p>
          <p className="font-semibold">{module?.pending || 0}</p>
        </div>
        <div className={`border p-2 ${isLightTheme ? "border-[#D4DEE8] bg-[#F7FAFC]" : "border-[#2D2E2E]"}`}>
          <p className="text-[11px] uppercase tracking-[0.14em] opacity-55 mb-1">Erros</p>
          <p className="font-semibold">{module?.errors || 0}</p>
        </div>
        <div className={`border p-2 ${isLightTheme ? "border-[#D4DEE8] bg-[#F7FAFC]" : "border-[#2D2E2E]"}`}>
          <p className="text-[11px] uppercase tracking-[0.14em] opacity-55 mb-1">Backlog</p>
          <p className="font-semibold">{module?.backlog || 0}</p>
        </div>
      </div>
      <p className="opacity-65 mb-1">Pressao operacional: {module?.pressure || 0}</p>
      <p className="opacity-65 mb-1">Lote sugerido: {module?.suggestedBatch || 5}</p>
      <p className="font-semibold">{module?.recommendedAction || "Abrir modulo"}</p>
    </Link>
  );
}

function formatPercent(value) {
  const numeric = Number(value || 0);
  return `${Math.max(0, Math.min(100, Math.round(numeric)))}%`;
}

export default function InternoHomePage() {
  const { isLightTheme } = useInternalTheme();
  const [hmadvOps, setHmadvOps] = useState({ loading: true, error: null, data: null });
  const [draining, setDraining] = useState(false);

  async function loadHmadvOps() {
    setHmadvOps((current) => ({ ...current, loading: true, error: null }));
    try {
      const [payload, auditPayload] = await Promise.all([
        adminFetch("/api/admin-hmadv-filas"),
        adminFetch("/api/admin-hmadv-processos?action=auditoria_completude&sampleSize=8"),
      ]);
      setHmadvOps({
        loading: false,
        error: null,
        data: {
          ...payload.data,
          completeness: auditPayload.data || null,
        },
      });
    } catch (error) {
      setHmadvOps({ loading: false, error: error.message || "Falha ao carregar controle HMADV.", data: null });
    }
  }

  async function handleDrainAll() {
    setDraining(true);
    try {
      await adminFetch("/api/admin-hmadv-filas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "drain_all", maxChunks: 8 }),
      }, { timeoutMs: 120000, maxRetries: 0 });
      await loadHmadvOps();
    } catch (error) {
      setHmadvOps((current) => ({ ...current, error: error.message || "Falha ao drenar filas." }));
    } finally {
      setDraining(false);
    }
  }

  useEffect(() => {
    loadHmadvOps();
  }, []);

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="Visao geral"
      description="Visao executiva do produto com indicadores, atalhos e prioridades mais claras para o dia."
        >
          <div className="grid gap-6 md:grid-cols-3 mb-8">
            <StatCard
              label="Posts base"
              value={FALLBACK_BLOG_POSTS.length}
              helper="Conteudo inicial pronto para migracao e publicacao estruturada no Supabase."
            />
            <StatCard
              label="Agendamento"
              value="Ativo"
              helper="O fluxo publico continua operando; a proxima etapa e trazer visibilidade interna e melhorias graduais."
            />
            <StatCard
              label="Perfil"
              value={profile.role}
              helper="Permissoes do dashboard serao expandidas por modulo conforme o rollout."
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6 lg:col-span-2">
              <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-3" style={{ color: "#C5A059" }}>
                Centro de operacao
              </p>
              {hmadvOps.loading ? <p className="text-sm opacity-70">Carregando panorama do produto...</p> : null}
              {hmadvOps.error ? <p className="text-sm text-red-300">{hmadvOps.error}</p> : null}
              {!hmadvOps.loading && hmadvOps.data ? (
                <div className="space-y-5">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <ModuleCommandCard module={hmadvOps.data.moduleCards?.processos} />
                    <ModuleCommandCard module={hmadvOps.data.moduleCards?.publicacoes} />
                  </div>
                  <div className="border border-[#2D2E2E] bg-[rgba(10,12,11,0.82)] p-4 text-sm">
                    <p className="text-[11px] uppercase tracking-[0.14em] opacity-55 mb-1">Resumo executivo</p>
                    <p className="text-base font-semibold">{hmadvOps.data.executiveSummary}</p>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-3">
                    {(hmadvOps.data.alerts || []).map((alert, index) => (
                      <AlertCard key={`${alert.level}-${index}`} alert={alert} />
                    ))}
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <StatCard label="Processos pendentes" value={(hmadvOps.data.processosJobs?.pending || 0) + (hmadvOps.data.processosJobs?.running || 0)} helper="Itens de processos aguardando a proxima rodada." />
                    <StatCard label="Publicações pendentes" value={(hmadvOps.data.publicacoesJobs?.pending || 0) + (hmadvOps.data.publicacoesJobs?.running || 0)} helper="Jobs de publicações aguardando drenagem." />
                    <StatCard label="Sem account" value={hmadvOps.data.processosOverview?.processosSemAccount || 0} helper="Processos órfãos ainda sem Sales Account." />
                    <StatCard label="Sem processo" value={hmadvOps.data.publicacoesOverview?.publicacoesSemProcesso || 0} helper="Publicações ainda sem processo vinculado." />
                  </div>
                  {hmadvOps.data.completeness ? (
                    <div className="border border-[#2D2E2E] bg-[rgba(10,12,11,0.82)] p-4 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.14em] opacity-55 mb-1">Cobertura da base e do CRM</p>
                          <p className="font-semibold">Cobertura real por processo, com base na auditoria local da operacao.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <ModeBadge active={true} label={`base ${formatPercent(((hmadvOps.data.completeness.processosBaseCompleta || 0) / Math.max(1, hmadvOps.data.completeness.processosTotal || 1)) * 100)}`} />
                          <ModeBadge active={true} label={`crm ${formatPercent((((hmadvOps.data.completeness.processosComAccount || 0) - (hmadvOps.data.completeness.processosComGapCrm || 0)) / Math.max(1, hmadvOps.data.completeness.processosTotal || 1)) * 100)}`} />
                        </div>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <StatCard label="Base completa" value={hmadvOps.data.completeness.processosBaseCompleta || 0} helper="Processos com account, sinais operacionais e base minimamente refletida." />
                        <StatCard label="Gap CRM" value={hmadvOps.data.completeness.processosComGapCrm || 0} helper="Processos ainda com campos/account fora de equilíbrio no Freshsales." />
                        <StatCard label="Publicações pendentes" value={hmadvOps.data.completeness.publicacoesPendentes || 0} helper="Publicações ainda sem sales_activity no CRM." />
                        <StatCard label="Movimentações pendentes" value={hmadvOps.data.completeness.movimentacoesPendentes || 0} helper="Andamentos ainda sem sales_activity no CRM." />
                      </div>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 mt-3">
                        <StatCard label="Partes sem contato" value={hmadvOps.data.completeness.partesSemContato || 0} helper="Partes ainda sem contato_freshsales_id resolvido." />
                        <StatCard label="Sem account" value={hmadvOps.data.completeness.processosSemAccount || 0} helper="Processos ainda fora do CRM." />
                        <StatCard label="Audiências pendentes" value={hmadvOps.data.completeness.audienciasPendentes || 0} helper="Audiências detectadas e ainda não refletidas." />
                      </div>
                    </div>
                  ) : null}
                  <div className="border border-[#2D2E2E] bg-[rgba(10,12,11,0.82)] p-4 text-sm">
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <p className="font-semibold">Automacao agendada</p>
                      <ModeBadge active={!hmadvOps.data.autoMode?.enabled} label="manual" />
                      <ModeBadge active={hmadvOps.data.autoMode?.enabled} label="automatico" />
                      <ModeBadge active={true} label={hmadvOps.data.autoMode?.healthLabel || "Saudavel"} />
                    </div>
                    <p className="opacity-75 mb-2">
                      {hmadvOps.data.runnerConfigured
                        ? "Automacao habilitada. Vale confirmar as ultimas execucoes para validar a continuidade."
                        : "Ainda falta liberar a automacao agendada fora da aba para manter as rodadas consistentes."}
                    </p>
                    {hmadvOps.data.autoMode?.runnerTokenKey ? (
                      <p className="opacity-55 mb-2">Chave detectada no ambiente: {hmadvOps.data.autoMode.runnerTokenKey}</p>
                    ) : null}
                    <div className="grid gap-3 md:grid-cols-3 mb-3">
                      <div className="border border-[#2D2E2E] p-3">
                        <p className="text-[11px] uppercase tracking-[0.14em] opacity-55 mb-1">Jobs pendentes</p>
                        <p className="text-lg font-semibold">{hmadvOps.data.autoMode?.totalPendingJobs || 0}</p>
                      </div>
                      <div className="border border-[#2D2E2E] p-3">
                        <p className="text-[11px] uppercase tracking-[0.14em] opacity-55 mb-1">Backlog base</p>
                        <p className="text-lg font-semibold">{hmadvOps.data.autoMode?.totalBacklogItems || 0}</p>
                      </div>
                      <div className="border border-[#2D2E2E] p-3">
                        <p className="text-[11px] uppercase tracking-[0.14em] opacity-55 mb-1">Ciclo sugerido</p>
                        <p className="text-lg font-semibold">{hmadvOps.data.autoMode?.recommendedIntervalMinutes || 5} min</p>
                      </div>
                    </div>
                      <div className="grid gap-3 md:grid-cols-2 mb-3">
                        <div className="border border-[#2D2E2E] p-3">
                          <p className="text-[11px] uppercase tracking-[0.14em] opacity-55 mb-1">Ultima atividade</p>
                          <p className="text-sm font-semibold">
                          {hmadvOps.data.autoMode?.lastActivityAt
                            ? `${new Date(hmadvOps.data.autoMode.lastActivityAt).toLocaleString("pt-BR")} (${hmadvOps.data.autoMode.lastActivityLabel || "atividade recente"})`
                            : "Sem atividade registrada"}
                        </p>
                        </div>
                        <div className="border border-[#2D2E2E] p-3">
                          <p className="text-[11px] uppercase tracking-[0.14em] opacity-55 mb-1">Saude do ciclo</p>
                          <p className="text-sm font-semibold">{hmadvOps.data.autoMode?.healthReason}</p>
                        </div>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2 mb-3">
                        <div className="border border-[#2D2E2E] p-3">
                          <p className="text-[11px] uppercase tracking-[0.14em] opacity-55 mb-1">Ultima execucao real</p>
                          <p className="text-sm font-semibold">
                            {hmadvOps.data.autoMode?.latestRunnerExecution?.created_at
                              ? `${new Date(hmadvOps.data.autoMode.latestRunnerExecution.created_at).toLocaleString("pt-BR")} (${hmadvOps.data.autoMode.lastActivityLabel || "atividade recente"})`
                              : "Nenhuma execucao real registrada ainda"}
                          </p>
                        </div>
                        <div className="border border-[#2D2E2E] p-3">
                          <p className="text-[11px] uppercase tracking-[0.14em] opacity-55 mb-1">Ultimo runner com sucesso</p>
                          <p className="text-sm font-semibold">
                            {hmadvOps.data.autoMode?.latestRunnerSuccess?.created_at
                              ? new Date(hmadvOps.data.autoMode.latestRunnerSuccess.created_at).toLocaleString("pt-BR")
                              : "Sem sucesso registrado no HMADV"}
                          </p>
                        </div>
                      </div>
                    <p className="opacity-75 mb-2">{hmadvOps.data.autoMode?.nextStep}</p>
                    <p className="opacity-55 break-all">POST /api/admin-hmadv-runner</p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button type="button" onClick={handleDrainAll} disabled={draining} className="border border-[#C5A059] bg-[#C5A059] px-4 py-3 text-sm font-semibold text-[#050706] disabled:opacity-50">
                      {draining ? "Drenando filas..." : "Drenar Processos + Publicações"}
                    </button>
                    <button type="button" onClick={loadHmadvOps} disabled={draining} className="border border-[#2D2E2E] px-4 py-3 text-sm hover:border-[#C5A059] disabled:opacity-50">
                      Atualizar leitura
                    </button>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="border border-[#2D2E2E] bg-[rgba(10,12,11,0.82)] p-4 text-sm">
                      <p className="font-semibold mb-2">Foco recomendado</p>
                      <p className="opacity-75 mb-2">{hmadvOps.data.moduleFocus?.reason}</p>
                      <div className="flex flex-wrap gap-2 mb-3">
                        <ModeBadge active={hmadvOps.data.moduleFocus?.target === "processos"} label="processos" />
                        <ModeBadge active={hmadvOps.data.moduleFocus?.target === "publicacoes"} label="publicacoes" />
                        <ModeBadge active={hmadvOps.data.moduleFocus?.target === "torre"} label="torre" />
                      </div>
                      <p className="opacity-55">
                        Pressao: processos {hmadvOps.data.moduleFocus?.processosPressure || 0} | publicacoes {hmadvOps.data.moduleFocus?.publicacoesPressure || 0}
                      </p>
                      <div className="mt-4">
                        <Link
                          href={hmadvOps.data.moduleFocus?.primaryHref || "/interno/processos"}
                          prefetch={false}
                          className="inline-flex border border-[#C5A059] bg-[#C5A059] px-4 py-2 text-sm font-semibold text-[#050706]"
                        >
                          {hmadvOps.data.moduleFocus?.primaryLabel || "Abrir processos"}
                        </Link>
                      </div>
                    </div>
                    <div className="grid gap-3">
                      <FocusLink
                        href="/interno/financeiro"
                        title="Abrir Financeiro"
                        helper="Receita, contratos e pendências organizadas em uma leitura mais executiva."
                      />
                      <FocusLink
                        href="/interno/processos"
                        title="Abrir Processos"
                        helper="Carteira processual com acompanhamento, atualização e ação guiada."
                      />
                      <FocusLink
                        href="/interno/publicacoes"
                        title="Abrir Publicacoes"
                        helper="Publicações organizadas para priorizar backlog e próximas ações."
                      />
                      <FocusLink
                        href="/interno/market-ads"
                        title="Abrir HMADV Market Ads"
                        helper="Campanhas jurídicas com posicionamento, copy e clareza comercial."
                      />
                    </div>
                  </div>
                  <div className="border border-[#2D2E2E] bg-[rgba(10,12,11,0.82)] p-4 text-sm">
                    <p className="font-semibold mb-2">Checklist do proximo ciclo</p>
                    <div className="grid gap-2 md:grid-cols-3">
                      {(hmadvOps.data.moduleFocus?.checklist || []).map((item, index) => (
                        <div key={`${index}-${item}`} className="border border-[#2D2E2E] p-3">
                          <p className="text-[11px] uppercase tracking-[0.14em] opacity-55 mb-1">Passo {index + 1}</p>
                          <p className="opacity-75">{item}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="border border-[#2D2E2E] bg-[rgba(10,12,11,0.82)] p-4 text-sm">
                    <p className="font-semibold mb-2">Bloqueio principal</p>
                    <p className="opacity-75 mb-2">{hmadvOps.data.blocker?.title}</p>
                    <p className="opacity-65 mb-4">{hmadvOps.data.blocker?.reason}</p>
                    <Link
                      href={hmadvOps.data.blocker?.href || "/interno"}
                      prefetch={false}
                      className="inline-flex border border-[#C5A059] px-4 py-2 text-sm hover:border-[#E7C98C]"
                    >
                      {hmadvOps.data.blocker?.cta || "Abrir torre"}
                    </Link>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="border border-[#2D2E2E] p-4 text-sm opacity-75">
                      <p className="font-semibold mb-2">Processos</p>
                      <p>Pendentes: {hmadvOps.data.processosJobs?.pending || 0}</p>
                      <p>Executando: {hmadvOps.data.processosJobs?.running || 0}</p>
                      <p>Último job ativo: {hmadvOps.data.processosJobs?.active?.acao || "nenhum"}</p>
                    </div>
                    <div className="border border-[#2D2E2E] p-4 text-sm opacity-75">
                      <p className="font-semibold mb-2">Publicações</p>
                      <p>Pendentes: {hmadvOps.data.publicacoesJobs?.pending || 0}</p>
                      <p>Executando: {hmadvOps.data.publicacoesJobs?.running || 0}</p>
                      <p>Último job ativo: {hmadvOps.data.publicacoesJobs?.active?.acao || "nenhum"}</p>
                    </div>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <RecentJobList
                      title="Ultimos jobs de processos"
                      items={hmadvOps.data.recentJobs?.processos || []}
                    />
                    <RecentJobList
                      title="Ultimos jobs de publicacoes"
                      items={hmadvOps.data.recentJobs?.publicacoes || []}
                    />
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <CycleCard
                      title="Resumo do ultimo ciclo de processos"
                      cycle={hmadvOps.data.recentCycle?.processos || null}
                    />
                    <CycleCard
                      title="Resumo do ultimo ciclo de publicacoes"
                      cycle={hmadvOps.data.recentCycle?.publicacoes || null}
                    />
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <TrendCard
                      title="Tendencia recente de processos"
                      trend={hmadvOps.data.recentTrend?.processos || null}
                    />
                    <TrendCard
                      title="Tendencia recente de publicacoes"
                      trend={hmadvOps.data.recentTrend?.publicacoes || null}
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
              <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-3" style={{ color: "#C5A059" }}>
                Proximos blocos
              </p>
              <ul className="space-y-3 text-sm opacity-70">
                <li>AgentLab para governanca de agentes, chatbot e espelho do Freshsales.</li>
                <li>Publicacao e edicao de posts do blog.</li>
                <li>Leitura administrativa de agendamentos com filtros.</li>
                <li>Consolidacao de leads vindos da calculadora e do contato.</li>
              </ul>
            </div>

            <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
              <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-3" style={{ color: "#C5A059" }}>
                Acessos rapidos
              </p>
              <div className="space-y-3">
                <Link href="/interno/agentlab" prefetch={false} className="block border border-[#2D2E2E] px-4 py-3 hover:border-[#C5A059]">
                  Abrir AgentLab
                </Link>
                <Link href="/interno/ai-task" prefetch={false} className="block border border-[#2D2E2E] px-4 py-3 hover:border-[#C5A059]">
                  Abrir AI Task
                </Link>
                <Link href="/interno/aprovacoes" prefetch={false} className="block border border-[#2D2E2E] px-4 py-3 hover:border-[#C5A059]">
                  Abrir aprovacoes
                </Link>
                <Link href="/interno/financeiro" prefetch={false} className="block border border-[#2D2E2E] px-4 py-3 hover:border-[#C5A059]">
                  Abrir financeiro
                </Link>
                <Link href="/interno/processos" prefetch={false} className="block border border-[#2D2E2E] px-4 py-3 hover:border-[#C5A059]">
                  Abrir gestao de processos
                </Link>
                <Link href="/interno/publicacoes" prefetch={false} className="block border border-[#2D2E2E] px-4 py-3 hover:border-[#C5A059]">
                  Abrir gestao de publicacoes
                </Link>
                <Link href="/interno/contacts" prefetch={false} className="block border border-[#2D2E2E] px-4 py-3 hover:border-[#C5A059]">
                  Abrir gestao de contacts
                </Link>
                <Link href="/interno/posts" prefetch={false} className="block border border-[#2D2E2E] px-4 py-3 hover:border-[#C5A059]">
                  Abrir modulo de posts
                </Link>
                <Link href="/interno/agendamentos" prefetch={false} className="block border border-[#2D2E2E] px-4 py-3 hover:border-[#C5A059]">
                  Abrir leitura de agendamentos
                </Link>
                <Link href="/interno/leads" prefetch={false} className="block border border-[#2D2E2E] px-4 py-3 hover:border-[#C5A059]">
                  Abrir leads e tickets
                </Link>
                <Link href="/interno/market-ads" prefetch={false} className="block border border-[#2D2E2E] px-4 py-3 hover:border-[#C5A059]">
                  Abrir HMADV Market Ads
                </Link>
              </div>
            </div>
          </div>
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}
