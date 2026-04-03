import InternoLayout from "../../../components/interno/InternoLayout";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import AgentLabModuleNav from "../../../components/interno/agentlab/AgentLabModuleNav";
import { useAgentLabData } from "../../../lib/agentlab/useAgentLabData";

function Panel({ title, children }) {
  return (
    <section className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
      <h3 className="mb-4 font-serif text-2xl">{title}</h3>
      {children}
    </section>
  );
}

export default function AgentLabEnvironmentPage() {
  const state = useAgentLabData();

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="AgentLab · Ambiente"
          description="Diagnostico do schema, bootstrap do Supabase e estado operacional do ambiente do AgentLab."
        >
          <AgentLabModuleNav />
          <EnvironmentContent state={state} />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

function EnvironmentContent({ state }) {
  if (state.loading) {
    return <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">Carregando ambiente...</div>;
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
  const dotobotRagReport = dotobotRagHealth.report || {};
  const dotobotSupabase = dotobotRagReport.supabase || {};
  const dotobotObsidian = dotobotRagReport.obsidian || {};
  const widgetEventSummary = state.data?.conversations?.widgetEventSummary || {};
  const readyCount = schemaChecklist.filter((item) => item.status === "ready").length;
  const missingCount = schemaChecklist.filter((item) => item.status !== "ready").length;

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-3">
        <Panel title={`Modo: ${environment.mode === "degraded" ? "Contingencia" : "Conectado"}`}>
          <p className="text-sm opacity-75">{environment.message}</p>
        </Panel>
        <Panel title={`Tabelas prontas: ${readyCount}`}>
          <p className="text-sm opacity-75">Tabelas do AgentLab encontradas no schema atual.</p>
        </Panel>
        <Panel title={`Tabelas ausentes: ${missingCount}`}>
          <p className="text-sm opacity-75">Tabelas que ainda precisam existir no projeto Supabase do Pages.</p>
        </Panel>
      </div>

      <Panel title="Bootstrap recomendado">
        <div className="space-y-3 text-sm opacity-75">
          <p>
            SQL consolidado:
            {" "}
            [agentlab-bootstrap-supabase.sql](/D:/Github/newgit/docs/agentlab-bootstrap-supabase.sql)
          </p>
          <p>
            Runbook:
            {" "}
            [agentlab-bootstrap-supabase.md](/D:/Github/newgit/docs/agentlab-bootstrap-supabase.md)
          </p>
          <p>Depois de aplicar o SQL no projeto correto, faca um hard refresh autenticado no painel.</p>
        </div>
      </Panel>

      <Panel title="Diagnostico Freshchat API">
        <div className="space-y-3 text-sm opacity-75">
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
        <div className="space-y-3 text-sm opacity-75">
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

      <Panel
        title={`Healthcheck Dotobot RAG: ${dotobotRagHealth.ok ? "OK" : "Falha"}`}
      >
        <div className="space-y-3 text-sm opacity-75">
          <p>
            Status:{" "}
            <span className={dotobotRagHealth.ok ? "text-emerald-400" : "text-amber-300"}>
              {dotobotRagHealth.ok ? "Operacional" : "Necessita atencao"}
            </span>
          </p>
          <p>Atualizado em: {dotobotRagReport.timestamp ? new Date(dotobotRagReport.timestamp).toLocaleString("pt-BR") : "nao informado"}</p>
          <p>
            Embedding:{" "}
            <span className={dotobotRagReport.embedding?.ok ? "text-emerald-400" : "text-amber-300"}>
              {dotobotRagReport.embedding?.ok ? `OK${dotobotRagReport.embedding?.dimensions ? ` (${dotobotRagReport.embedding.dimensions} dims)` : ""}` : "falhou"}
            </span>
          </p>
          <p>
            Consulta vetorial:{" "}
            <span className={dotobotRagReport.query?.ok ? "text-emerald-400" : "text-amber-300"}>
              {dotobotRagReport.query?.ok
                ? `OK${typeof dotobotRagReport.query?.matches === "number" ? ` (${dotobotRagReport.query.matches} matches)` : ""}`
                : "falhou"}
            </span>
          </p>
          <p>
            Supabase embeddings:{" "}
            <span className={dotobotRagReport.supabaseQuery?.ok ? "text-emerald-400" : "text-amber-300"}>
              {dotobotRagReport.supabaseQuery?.ok
                ? `OK${typeof dotobotRagReport.supabaseQuery?.matches === "number" ? ` (${dotobotRagReport.supabaseQuery.matches} matches)` : ""}`
                : "falhou"}
            </span>
          </p>
          <p>
            Upsert de memoria:{" "}
            <span className={dotobotRagReport.upsert?.skipped ? "text-slate-300" : dotobotRagReport.upsert?.ok ? "text-emerald-400" : "text-amber-300"}>
              {dotobotRagReport.upsert?.skipped ? "ignorado no dashboard" : dotobotRagReport.upsert?.ok ? "OK" : "falhou"}
            </span>
          </p>
          <p>
            Persistencia Supabase:{" "}
            <span className={dotobotRagReport.supabaseUpsert?.skipped ? "text-slate-300" : dotobotRagReport.supabaseUpsert?.ok ? "text-emerald-400" : "text-amber-300"}>
              {dotobotRagReport.supabaseUpsert?.skipped ? "ignorada no dashboard" : dotobotRagReport.supabaseUpsert?.ok ? "OK" : "falhou"}
            </span>
          </p>
          {dotobotSupabase?.enabled !== undefined ? (
            <p>
              Backend Supabase:{" "}
              <span className={dotobotSupabase.enabled ? "text-emerald-400" : "text-amber-300"}>
                {dotobotSupabase.enabled ? "habilitado" : "nao configurado"}
              </span>
            </p>
          ) : null}
          {dotobotSupabase?.memoryTable ? (
            <p>Table: {dotobotSupabase.memoryTable}</p>
          ) : null}
          {dotobotSupabase?.embeddingFunction ? (
            <p>Function: {dotobotSupabase.embeddingFunction}</p>
          ) : null}
          {dotobotSupabase?.embeddingModel ? (
            <p>Modelo: {dotobotSupabase.embeddingModel}</p>
          ) : null}
          {dotobotObsidian?.enabled !== undefined ? (
            <p>
              Obsidian fallback:{" "}
              <span className={dotobotObsidian.enabled ? "text-emerald-400" : "text-amber-300"}>
                {dotobotObsidian.enabled ? "habilitado" : "nao configurado"}
              </span>
            </p>
          ) : null}
          {dotobotObsidian?.memoryDir ? <p>Vault memory dir: {dotobotObsidian.memoryDir}</p> : null}
          <p className="text-xs uppercase tracking-[0.16em] opacity-50">
            Query: {dotobotRagReport.query?.ok ? "healthcheck dotobot memory retrieval" : "verifique as secrets do RAG"}
          </p>
          {dotobotRagHealth.error ? <p className="text-[#f2b2b2]">{dotobotRagHealth.error}</p> : null}
          {(dotobotRagReport.embedding?.error || dotobotRagReport.query?.error || dotobotRagReport.upsert?.error) ? (
            <div>
              <p className="font-semibold">Detalhe do erro:</p>
              <p>{dotobotRagReport.embedding?.error || dotobotRagReport.query?.error || dotobotRagReport.upsert?.error}</p>
            </div>
          ) : null}
        </div>
      </Panel>

      <Panel title="Saude do widget em producao">
        <div className="grid gap-3 md:grid-cols-4 text-sm opacity-75">
          <p>Eventos: {widgetEventSummary.total || 0}</p>
          <p>Aberturas: {widgetEventSummary.openedCount || 0}</p>
          <p>Auth: {widgetEventSummary.authCount || 0}</p>
          <p>Falhas: {widgetEventSummary.failureCount || 0}</p>
        </div>
        {(widgetEventSummary.byEvent || []).length ? (
          <div className="mt-4 space-y-2 text-sm opacity-75">
            {widgetEventSummary.byEvent.slice(0, 8).map((item) => (
              <p key={item.label}>{item.label}: {item.value}</p>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm opacity-75">
            Ainda nao existem eventos suficientes do widget para analise. Abra e autentique o chat no site para popular esta visao.
          </p>
        )}
      </Panel>

      <Panel title="Checklist do schema">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 text-sm opacity-75">
          {schemaChecklist.map((item) => (
            <div key={item.table} className="border border-[#2D2E2E] p-3">
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
          <div className="space-y-3 text-sm opacity-75">
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
