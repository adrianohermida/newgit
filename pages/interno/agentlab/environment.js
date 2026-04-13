import { useEffect } from "react";
import { useRouter } from "next/router";
import InternoLayout from "../../../components/interno/InternoLayout";
import { useInternalTheme } from "../../../components/interno/InternalThemeProvider";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import AgentLabModuleNav from "../../../components/interno/agentlab/AgentLabModuleNav";
import { useAgentLabData } from "../../../lib/agentlab/useAgentLabData";
import { setModuleHistory } from "../../../lib/admin/activity-log";
import { buildModuleSnapshot } from "../../../lib/admin/module-registry";

function Panel({ title, children }) {
  const { isLightTheme } = useInternalTheme();
  return (
    <section className={`border p-6 ${isLightTheme ? "border-[#d7d4cb] bg-[rgba(255,255,255,0.92)] text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(13,15,14,0.96)]"}`}>
      <h3 className="mb-4 font-serif text-2xl">{title}</h3>
      {children}
    </section>
  );
}

function getDotobotRagHealthStatus(health) {
  if (health?.status === "operational") {
    return {
      tone: "text-emerald-400",
      label: "Operacional",
      headline: "OK",
      summary: "Embedding e consulta vetorial estao funcionais em pelo menos um backend principal.",
    };
  }

  if (health?.status === "degraded") {
    return {
      tone: "text-amber-300",
      label: "Degradado",
      headline: "Degradado",
      summary: "O fallback local esta ativo, mas os provedores principais de embedding e busca vetorial nao estao saudaveis.",
    };
  }

  const report = health?.report || {};
  const cloudflareOk = Boolean(report.embedding?.ok && report.query?.ok);
  const supabaseOk = Boolean(report.supabaseEmbedding?.ok && report.supabaseQuery?.ok);
  const obsidianOk = Boolean(report.obsidian?.ok);

  if (cloudflareOk || supabaseOk) {
    return {
      tone: "text-emerald-400",
      label: "Operacional",
      headline: "OK",
      summary: "Embedding e consulta vetorial estao funcionais em pelo menos um backend principal.",
    };
  }

  if (obsidianOk) {
    return {
      tone: "text-amber-300",
      label: "Degradado",
      headline: "Degradado",
      summary: "O fallback local esta ativo, mas os provedores principais de embedding e busca vetorial nao estao saudaveis.",
    };
  }

  return {
    tone: "text-rose-300",
    label: "Falha",
    headline: "Falha",
    summary: "Nenhum backend de RAG esta operacional no momento.",
  };
}

function getProvidersHealthStatus(health) {
  if (health?.status === "operational") {
    return {
      tone: "text-emerald-400",
      label: "Operacional",
      headline: "OK",
      summary: "Existe ao menos um provider LLM operacional e pronto para uso.",
    };
  }

  if (health?.status === "degraded") {
    return {
      tone: "text-amber-300",
      label: "Degradado",
      headline: "Degradado",
      summary: "Ha providers configurados, mas nenhum deles esta integralmente saudavel.",
    };
  }

  return {
    tone: "text-rose-300",
    label: "Falha",
    headline: "Falha",
    summary: "Nenhum provider LLM utilizavel foi detectado.",
  };
}

function parseCopilotContext(rawValue) {
  if (!rawValue) return null;
  try {
    return JSON.parse(String(rawValue));
  } catch {
    return null;
  }
}

function StatusInline({ ok, yesLabel = "OK", noLabel = "Falhou" }) {
  return <span className={ok ? "text-emerald-400" : "text-amber-300"}>{ok ? yesLabel : noLabel}</span>;
}

export default function AgentLabEnvironmentPage() {
  const router = useRouter();
  const state = useAgentLabData();
  const copilotContext = parseCopilotContext(typeof router.query.copilotContext === "string" ? router.query.copilotContext : "");

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="AgentLab - Ambiente"
          description="Diagnostico do schema, bootstrap do Supabase e estado operacional do ambiente do AgentLab."
        >
          <AgentLabModuleNav />
          <EnvironmentContent state={state} copilotContext={copilotContext} />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

function EnvironmentContent({ state, copilotContext }) {
  const { isLightTheme } = useInternalTheme();

  if (state.loading) {
    return <div className={`border p-6 ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#4b5563]" : "border-[#2D2E2E] bg-[rgba(13,15,14,0.96)]"}`}>Carregando diagnostico do laboratorio...</div>;
  }

  if (state.error) {
    return <div className="border border-[#7f1d1d] bg-[rgba(127,29,29,0.22)] p-6 text-sm">{state.error}</div>;
  }

  const environment = state.data?.environment || {};
  const warnings = state.data?.warnings || [];
  const schemaChecklist = environment.schemaChecklist || [];
  const freshchatApi = environment.freshchatApi || {};
  const freshchatWeb = environment.freshchatWeb || {};
  const dotobotRagHealth = environment.dotobotRagHealth || {};
  const lawdeskProvidersHealth = environment.lawdeskProvidersHealth || {};
  const dotobotRagReport = dotobotRagHealth.report || {};
  const dotobotSupabase = dotobotRagReport.supabase || {};
  const dotobotObsidian = dotobotRagReport.obsidian || {};
  const dotobotRagStatus = getDotobotRagHealthStatus(dotobotRagHealth);
  const providersHealthStatus = getProvidersHealthStatus(lawdeskProvidersHealth);
  const dotobotSignals = dotobotRagHealth.signals || {};
  const widgetEventSummary = state.data?.conversations?.widgetEventSummary || {};
  const readyCount = schemaChecklist.filter((item) => item.status === "ready").length;
  const missingCount = schemaChecklist.filter((item) => item.status !== "ready").length;

  useEffect(() => {
    setModuleHistory(
      "agentlab-environment",
      buildModuleSnapshot("agentlab", {
        routePath: "/interno/agentlab/environment",
        loading: state.loading,
        error: state.error,
        section: "environment",
        mode: environment.mode || null,
        readyCount,
        missingCount,
        warnings: warnings.length,
        widgetEvents: widgetEventSummary.total || 0,
        ragStatus: dotobotRagHealth.status || null,
        providersStatus: lawdeskProvidersHealth.status || null,
        coverage: {
          routeTracked: true,
          consoleIntegrated: true,
          diagnosticsTracked: true,
        },
      }),
    );
  }, [
    dotobotRagHealth.status,
    environment.mode,
    lawdeskProvidersHealth.status,
    missingCount,
    readyCount,
    state.error,
    state.loading,
    warnings.length,
    widgetEventSummary.total,
  ]);

  const muted = isLightTheme ? "text-[#4b5563]" : "opacity-75";
  const subtle = isLightTheme ? "text-[#6b7280]" : "opacity-50";
  const cardTone = isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937]" : "border-[#2D2E2E]";

  return (
    <div className="space-y-8">
      {copilotContext ? (
        <Panel title="Contexto vindo do Copilot">
          <div className={`space-y-2 text-sm ${muted}`}>
            <p className="font-semibold">{copilotContext.conversationTitle || "Conversa ativa"}</p>
            {copilotContext.mission ? <p>{copilotContext.mission}</p> : null}
            <p>Use esta trilha para revisar runtime, schema, RAG e providers antes de retomar a operacao.</p>
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Panel title={`Modo: ${environment.mode === "degraded" ? "Contingencia" : "Conectado"}`}>
          <p className={`text-sm ${muted}`}>{environment.message}</p>
        </Panel>
        <Panel title={`Tabelas prontas: ${readyCount}`}>
          <p className={`text-sm ${muted}`}>Tabelas do AgentLab encontradas no schema atual e prontas para evolucao do laboratorio.</p>
        </Panel>
        <Panel title={`Tabelas ausentes: ${missingCount}`}>
          <p className={`text-sm ${muted}`}>Tabelas que ainda precisam existir no projeto Supabase do Pages.</p>
        </Panel>
      </div>

      <Panel title="Bootstrap recomendado">
        <div className={`space-y-3 text-sm ${muted}`}>
          <p>
            SQL consolidado:{" "}
            [agentlab-bootstrap-supabase.sql](/D:/Github/newgit/docs/agentlab-bootstrap-supabase.sql)
          </p>
          <p>
            Runbook:{" "}
            [agentlab-bootstrap-supabase.md](/D:/Github/newgit/docs/agentlab-bootstrap-supabase.md)
          </p>
          <p>Depois de aplicar o SQL no projeto correto, faca um hard refresh autenticado e valide o painel novamente.</p>
        </div>
      </Panel>

      <Panel title="Diagnostico Freshchat API">
        <div className={`space-y-3 text-sm ${muted}`}>
          <p>
            Status:{" "}
            <span className={freshchatApi.ok ? "text-emerald-400" : "text-amber-300"}>
              {freshchatApi.ok ? "Valido" : freshchatApi.configured ? "Configurado com ressalvas" : "Nao configurado"}
            </span>
          </p>
          <p>Base configurada: {freshchatApi.baseUrlPreview || "nao informada"}</p>
          <p>Tipo de token: {freshchatApi.tokenType || "missing"}</p>
          <p>{freshchatApi.message || "Sem diagnostico adicional."}</p>
          {(freshchatApi.issues || []).length ? (
            <div>
              <p className="font-semibold">Sinais detectados:</p>
              <ul className="mt-2 space-y-1">
                {freshchatApi.issues.map((issue) => (
                  <li key={issue}>- {issue}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Panel>

      <Panel title="Diagnostico Freshchat Web Messenger">
        <div className={`space-y-3 text-sm ${muted}`}>
          <p>
            Status:{" "}
            <span className={freshchatWeb.enabled ? "text-emerald-400" : "text-amber-300"}>
              {freshchatWeb.enabled ? "Widget habilitado" : "Widget desabilitado"}
            </span>
          </p>
          <p>Modo: {freshchatWeb.mode || "nao configurado"}</p>
          <p>Script embed: {freshchatWeb.scriptUrl || "nao informado"}</p>
          <p>Host do widget: {freshchatWeb.widgetHost || "nao informado"}</p>
          <p>Token do Web Messenger: {freshchatWeb.messengerTokenPresent ? "presente" : "ausente"}</p>
          <p>JWT: {freshchatWeb.jwtEnabled ? "habilitado" : "nao configurado"}</p>
          <p>Env do host em uso: {freshchatWeb.resolvedKeys?.host || "nenhuma detectada"}</p>
          <p>Env do token em uso: {freshchatWeb.resolvedKeys?.token || "nenhuma detectada"}</p>
          <p>Env do JWT em uso: {freshchatWeb.resolvedKeys?.jwtSecret || "nenhuma detectada"}</p>
          <p>{freshchatWeb.message || "Sem diagnostico adicional."}</p>
          {(freshchatWeb.issues || []).length ? (
            <div>
              <p className="font-semibold">Sinais detectados:</p>
              <ul className="mt-2 space-y-1">
                {freshchatWeb.issues.map((issue) => (
                  <li key={issue}>- {issue}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div>
            <p className="font-semibold">Nomes de env aceitos:</p>
            <ul className="mt-2 space-y-1">
              <li>Host: {(freshchatWeb.acceptedKeys?.host || []).join(", ") || "n/a"}</li>
              <li>Token: {(freshchatWeb.acceptedKeys?.token || []).join(", ") || "n/a"}</li>
              <li>JWT: {(freshchatWeb.acceptedKeys?.jwtSecret || []).join(", ") || "n/a"}</li>
            </ul>
          </div>
        </div>
      </Panel>

      <Panel title={`Healthcheck Dotobot RAG: ${dotobotRagStatus.headline}`}>
        <div className={`space-y-3 text-sm ${muted}`}>
          <p>Status: <span className={dotobotRagStatus.tone}>{dotobotRagStatus.label}</span></p>
          <p>{dotobotRagStatus.summary}</p>
          <p>Estado do backend: <span className={dotobotRagStatus.tone}>{dotobotRagHealth.status || "desconhecido"}</span></p>
          <p>Atualizado em: {dotobotRagReport.timestamp ? new Date(dotobotRagReport.timestamp).toLocaleString("pt-BR") : "nao informado"}</p>
          <p>Embedding Cloudflare: <StatusInline ok={dotobotRagReport.embedding?.ok} yesLabel={`OK${dotobotRagReport.embedding?.dimensions ? ` (${dotobotRagReport.embedding.dimensions} dims)` : ""}`} /></p>
          <p>
            Consulta vetorial Cloudflare:{" "}
            <span className={dotobotRagReport.query?.skipped ? "text-slate-300" : dotobotRagReport.query?.ok ? "text-emerald-400" : "text-amber-300"}>
              {dotobotRagReport.query?.skipped
                ? "ignorada"
                : dotobotRagReport.query?.ok
                ? `OK${typeof dotobotRagReport.query?.matches === "number" ? ` (${dotobotRagReport.query.matches} matches)` : ""}`
                : "falhou"}
            </span>
          </p>
          <p>Embedding Supabase: <StatusInline ok={dotobotRagReport.supabaseEmbedding?.ok} yesLabel={`OK${dotobotRagReport.supabaseEmbedding?.dimensions ? ` (${dotobotRagReport.supabaseEmbedding.dimensions} dims)` : ""}`} /></p>
          <p>
            Consulta vetorial Supabase:{" "}
            <span className={dotobotRagReport.supabaseQuery?.skipped ? "text-slate-300" : dotobotRagReport.supabaseQuery?.ok ? "text-emerald-400" : "text-amber-300"}>
              {dotobotRagReport.supabaseQuery?.skipped
                ? "ignorada"
                : dotobotRagReport.supabaseQuery?.ok
                ? `OK${typeof dotobotRagReport.supabaseQuery?.matches === "number" ? ` (${dotobotRagReport.supabaseQuery.matches} matches)` : ""}`
                : "falhou"}
            </span>
          </p>
          <p>
            Upsert Cloudflare:{" "}
            <span className={dotobotRagReport.upsert?.skipped ? "text-slate-300" : dotobotRagReport.upsert?.ok ? "text-emerald-400" : "text-amber-300"}>
              {dotobotRagReport.upsert?.skipped ? "ignorado" : dotobotRagReport.upsert?.ok ? "OK" : "falhou"}
            </span>
          </p>
          <p>
            Persistencia Supabase:{" "}
            <span className={dotobotRagReport.supabaseUpsert?.skipped ? "text-slate-300" : dotobotRagReport.supabaseUpsert?.ok ? "text-emerald-400" : "text-amber-300"}>
              {dotobotRagReport.supabaseUpsert?.skipped ? "ignorada" : dotobotRagReport.supabaseUpsert?.ok ? "OK" : "falhou"}
            </span>
          </p>
          {dotobotSupabase?.enabled !== undefined ? (
            <p>Backend Supabase: <span className={dotobotSupabase.enabled ? "text-emerald-400" : "text-amber-300"}>{dotobotSupabase.enabled ? "habilitado" : "nao configurado"}</span></p>
          ) : null}
          <p>SUPABASE_URL: {dotobotSupabase.baseUrlConfigured ? "configurado" : "ausente"}</p>
          {dotobotSupabase.baseUrlSource ? <p>Fonte SUPABASE_URL: {dotobotSupabase.baseUrlSource}</p> : null}
          <p>SUPABASE_SERVICE_ROLE_KEY: {dotobotSupabase.serviceKeyConfigured ? "configurado" : "ausente"}</p>
          {dotobotSupabase.serviceKeySource ? <p>Fonte service role: {dotobotSupabase.serviceKeySource}</p> : null}
          <p>DOTOBOT_SUPABASE_EMBED_SECRET: {dotobotSupabase.embedSecretConfigured ? "configurado" : "ausente"}</p>
          {dotobotSupabase.embedSecretSource ? <p>Fonte embed secret: {dotobotSupabase.embedSecretSource}</p> : null}
          {dotobotSignals.appEmbedSecretMissing ? <p className="text-amber-300">Sinal: o app que chama o healthcheck nao tem DOTOBOT_SUPABASE_EMBED_SECRET configurado.</p> : null}
          {dotobotSignals.supabaseAuthMismatch ? <p className="text-amber-300">Sinal: a autenticacao do dotobot-embed falhou; confira se o mesmo segredo esta presente no app e na Edge Function.</p> : null}
          {dotobotSupabase?.memoryTable ? <p>Tabela: {dotobotSupabase.memoryTable}</p> : null}
          {dotobotSupabase?.embeddingFunction ? <p>Function: {dotobotSupabase.embeddingFunction}</p> : null}
          {dotobotSupabase?.embeddingFunctionSource ? <p>Fonte function: {dotobotSupabase.embeddingFunctionSource}</p> : null}
          {dotobotSupabase?.embeddingModel ? <p>Modelo: {dotobotSupabase.embeddingModel}</p> : null}
          {dotobotSupabase?.embeddingModelSource ? <p>Fonte modelo: {dotobotSupabase.embeddingModelSource}</p> : null}
          {dotobotObsidian?.enabled !== undefined ? (
            <p>Obsidian fallback: <span className={dotobotObsidian.enabled ? "text-emerald-400" : "text-amber-300"}>{dotobotObsidian.enabled ? "habilitado" : "nao configurado"}</span></p>
          ) : null}
          {dotobotObsidian?.memoryDir ? <p>Vault memory dir: {dotobotObsidian.memoryDir}</p> : null}
          {(dotobotRagHealth.recommendations || []).length ? (
            <div>
              <p className="font-semibold">Recomendacoes:</p>
              <ul className="mt-2 space-y-1">
                {dotobotRagHealth.recommendations.map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className={`text-xs uppercase tracking-[0.16em] ${subtle}`}>
            Query: {dotobotRagReport.query?.skipped ? "healthcheck superficial sem upsert: rode o diagnostico profundo e verifique as secrets do RAG" : dotobotRagReport.query?.ok ? "healthcheck dotobot memory retrieval" : "verifique as secrets do RAG"}
          </p>
          {dotobotRagHealth.error ? <p className="text-[#f2b2b2]">{dotobotRagHealth.error}</p> : null}
          {(dotobotRagReport.embedding?.error || dotobotRagReport.query?.error || dotobotRagReport.supabaseEmbedding?.error || dotobotRagReport.supabaseQuery?.error || dotobotRagReport.upsert?.error || dotobotRagReport.supabaseUpsert?.error) ? (
            <div>
              <p className="font-semibold">Detalhe do erro:</p>
              <p>{dotobotRagReport.embedding?.error || dotobotRagReport.query?.error || dotobotRagReport.supabaseEmbedding?.error || dotobotRagReport.supabaseQuery?.error || dotobotRagReport.upsert?.error || dotobotRagReport.supabaseUpsert?.error}</p>
            </div>
          ) : null}
        </div>
      </Panel>

      <Panel title={`Healthcheck Providers LLM: ${providersHealthStatus.headline}`}>
        <div className={`space-y-3 text-sm ${muted}`}>
          <p>Status: <span className={providersHealthStatus.tone}>{providersHealthStatus.label}</span></p>
          <p>{providersHealthStatus.summary}</p>
          <p>Estado agregado: <span className={providersHealthStatus.tone}>{lawdeskProvidersHealth.status || "desconhecido"}</span></p>
          <p>Providers operacionais: {lawdeskProvidersHealth.summary?.operational ?? 0}</p>
          <p>Providers configurados: {lawdeskProvidersHealth.summary?.configured ?? 0}</p>
          <p>Provider padrao: {lawdeskProvidersHealth.summary?.defaultProvider || "gpt"}</p>
          {(lawdeskProvidersHealth.providers || []).length ? (
            <div className="space-y-3 pt-2">
              {lawdeskProvidersHealth.providers.map((provider) => (
                <div key={provider.id} className={`rounded-[18px] border p-4 ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(255,255,255,0.02)]"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className={`font-semibold ${isLightTheme ? "text-[#1f2937]" : "text-white"}`}>{provider.label || provider.id}</p>
                      <p className={`text-xs ${isLightTheme ? "text-[#6b7280]" : "text-white/60"}`}>{provider.transport || "n/a"}</p>
                    </div>
                    <span className={provider.status === "operational" ? "text-emerald-400" : provider.status === "degraded" ? "text-amber-300" : "text-rose-300"}>
                      {provider.status || "unknown"}
                    </span>
                  </div>
                  <p className="mt-2">Configurado: {provider.configured ? "sim" : "nao"}</p>
                  <p>Disponivel: {provider.available ? "sim" : "nao"}</p>
                  <p>Modelo: {provider.model || "n/a"}</p>
                  {provider.modelSource ? <p>Fonte modelo: {provider.modelSource}</p> : null}
                  {provider.baseUrlSource ? <p>Fonte base URL: {provider.baseUrlSource}</p> : null}
                  {provider.apiKeySource ? <p>Fonte API key: {provider.apiKeySource}</p> : null}
                  {provider.authTokenSource ? <p>Fonte auth token: {provider.authTokenSource}</p> : null}
                  {provider.sharedSecretSource ? <p>Fonte shared secret: {provider.sharedSecretSource}</p> : null}
                  <p>Diagnostico: {provider.reason || "Sem mensagem."}</p>
                </div>
              ))}
            </div>
          ) : (
            <p>Nenhum provider reportado.</p>
          )}
        </div>
      </Panel>

      <Panel title="Saude do widget em producao">
        <div className={`grid gap-3 text-sm md:grid-cols-4 ${muted}`}>
          <p>Eventos: {widgetEventSummary.total || 0}</p>
          <p>Aberturas: {widgetEventSummary.openedCount || 0}</p>
          <p>Auth: {widgetEventSummary.authCount || 0}</p>
          <p>Falhas: {widgetEventSummary.failureCount || 0}</p>
        </div>
        {(widgetEventSummary.byEvent || []).length ? (
          <div className={`mt-4 space-y-2 text-sm ${muted}`}>
            {widgetEventSummary.byEvent.slice(0, 8).map((item) => (
              <p key={item.label}>{item.label}: {item.value}</p>
            ))}
          </div>
        ) : (
          <p className={`mt-4 text-sm ${muted}`}>
            Ainda nao existem eventos suficientes do widget para analise. Abra e autentique o chat no site para popular esta visao.
          </p>
        )}
      </Panel>

      <Panel title="Checklist do schema">
        <div className={`grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-3 ${muted}`}>
          {schemaChecklist.map((item) => (
            <div key={item.table} className={`border p-3 ${cardTone}`}>
              <p className="font-semibold">{item.table}</p>
              <p className={item.status === "ready" ? "text-emerald-400" : "text-amber-300"}>
                {item.status === "ready" ? "Disponivel" : "Ausente"}
              </p>
            </div>
          ))}
        </div>
      </Panel>

      {warnings.length ? (
        <Panel title="Avisos recebidos neste ambiente">
          <div className={`space-y-3 text-sm ${muted}`}>
            {warnings.map((item) => (
              <p key={`${item.source}-${item.message}`}>
                <span className="font-semibold">{item.source}</span>
                <br />
                {item.message}
              </p>
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
