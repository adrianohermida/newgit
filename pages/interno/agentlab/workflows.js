import { useMemo, useState } from "react";
import InternoLayout from "../../../components/interno/InternoLayout";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import AgentLabModuleNav from "../../../components/interno/agentlab/AgentLabModuleNav";
import { useAgentLabData } from "../../../lib/agentlab/useAgentLabData";
import { adminFetch } from "../../../lib/admin/api";

function RuleCard({ rule, onSave }) {
  const [form, setForm] = useState({
    id: rule.id,
    event_key: rule.event_key || "",
    title: rule.title || "",
    description: rule.description || "",
    pipeline_stage: rule.pipeline_stage || "",
    lifecycle_stage: rule.lifecycle_stage || "",
    meeting_stage: rule.meeting_stage || "",
    negotiation_stage: rule.negotiation_stage || "",
    closing_stage: rule.closing_stage || "",
    client_stage: rule.client_stage || "",
    sequence_name: rule.sequence_name || "",
    journey_name: rule.journey_name || "",
    email_template: rule.email_template || "",
    whatsapp_template: rule.whatsapp_template || "",
    execution_mode: rule.execution_mode || "manual",
    notes: rule.notes || "",
    enabled: rule.enabled !== false,
  });
  const [state, setState] = useState({ loading: false, error: null, success: null });

  async function handleSave() {
    try {
      setState({ loading: true, error: null, success: null });
      await onSave(form);
      setState({ loading: false, error: null, success: "Regra salva com sucesso." });
    } catch (error) {
      setState({ loading: false, error: error.message, success: null });
    }
  }

  return (
    <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-5">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <span className="text-[10px] font-semibold tracking-[0.2em]" style={{ color: "#C5A059" }}>
          {form.event_key}
        </span>
        <span className="text-[10px] uppercase tracking-[0.15em] opacity-45">
          {form.enabled ? "ativo" : "desativado"}
        </span>
        <span className="text-[10px] uppercase tracking-[0.15em] opacity-45">
          {form.execution_mode}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="block mb-2 text-xs font-semibold tracking-[0.15em] uppercase opacity-60">Titulo</span>
          <input
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            className="w-full border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
          />
        </label>

        <label className="block">
          <span className="block mb-2 text-xs font-semibold tracking-[0.15em] uppercase opacity-60">Event key</span>
          <input
            value={form.event_key}
            onChange={(event) => setForm((current) => ({ ...current, event_key: event.target.value }))}
            className="w-full border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
          />
        </label>
      </div>

      <label className="block mt-4">
        <span className="block mb-2 text-xs font-semibold tracking-[0.15em] uppercase opacity-60">Descricao</span>
        <textarea
          value={form.description}
          onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
          rows={3}
          className="w-full border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
        />
      </label>

      <div className="grid gap-4 mt-4 md:grid-cols-3">
        {[
          ["pipeline_stage", "Pipeline"],
          ["lifecycle_stage", "Ciclo de vida"],
          ["meeting_stage", "Etapa de reuniao"],
          ["negotiation_stage", "Negociacao"],
          ["closing_stage", "Fechamento"],
          ["client_stage", "Cliente"],
        ].map(([field, label]) => (
          <label key={field} className="block">
            <span className="block mb-2 text-xs font-semibold tracking-[0.15em] uppercase opacity-60">{label}</span>
            <input
              value={form[field]}
              onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))}
              className="w-full border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
            />
          </label>
        ))}
      </div>

      <div className="grid gap-4 mt-4 md:grid-cols-2">
        <label className="block">
          <span className="block mb-2 text-xs font-semibold tracking-[0.15em] uppercase opacity-60">Sequencia</span>
          <input
            value={form.sequence_name}
            onChange={(event) => setForm((current) => ({ ...current, sequence_name: event.target.value }))}
            className="w-full border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
          />
        </label>
        <label className="block">
          <span className="block mb-2 text-xs font-semibold tracking-[0.15em] uppercase opacity-60">Jornada</span>
          <input
            value={form.journey_name}
            onChange={(event) => setForm((current) => ({ ...current, journey_name: event.target.value }))}
            className="w-full border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
          />
        </label>
        <label className="block">
          <span className="block mb-2 text-xs font-semibold tracking-[0.15em] uppercase opacity-60">Template de email</span>
          <input
            value={form.email_template}
            onChange={(event) => setForm((current) => ({ ...current, email_template: event.target.value }))}
            className="w-full border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
          />
        </label>
        <label className="block">
          <span className="block mb-2 text-xs font-semibold tracking-[0.15em] uppercase opacity-60">Template de WhatsApp</span>
          <input
            value={form.whatsapp_template}
            onChange={(event) => setForm((current) => ({ ...current, whatsapp_template: event.target.value }))}
            className="w-full border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
          />
        </label>
      </div>

      <div className="grid gap-4 mt-4 md:grid-cols-[220px,1fr]">
        <label className="block">
          <span className="block mb-2 text-xs font-semibold tracking-[0.15em] uppercase opacity-60">Modo de execucao</span>
          <select
            value={form.execution_mode}
            onChange={(event) => setForm((current) => ({ ...current, execution_mode: event.target.value }))}
            className="w-full border border-[#2D2E2E] bg-[#050706] px-4 py-3 outline-none focus:border-[#C5A059]"
          >
            <option value="manual">manual</option>
            <option value="semi_auto">semi_auto</option>
            <option value="auto">auto</option>
          </select>
        </label>

        <label className="block">
          <span className="block mb-2 text-xs font-semibold tracking-[0.15em] uppercase opacity-60">Notas operacionais</span>
          <textarea
            value={form.notes}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            rows={3}
            className="w-full border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
          />
        </label>
      </div>

      <label className="mt-4 inline-flex items-center gap-3 text-sm opacity-80">
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
        />
        Regra habilitada
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={state.loading}
          className="bg-[#C5A059] px-5 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-[#050706] disabled:opacity-60"
        >
          {state.loading ? "Salvando..." : "Salvar regra"}
        </button>
        {state.success ? <p className="text-sm text-emerald-400">{state.success}</p> : null}
        {state.error ? <p className="text-sm text-red-300">{state.error}</p> : null}
      </div>
    </div>
  );
}

export default function AgentLabWorkflowsPage() {
  const state = useAgentLabData();
  const rules = useMemo(() => state.data?.crm?.automationRules || [], [state.data]);
  const runs = useMemo(() => state.data?.crm?.automationRuns || [], [state.data]);
  const resourceMap = useMemo(() => state.data?.crm?.resourceMap || [], [state.data]);
  const dispatchRuns = useMemo(() => state.data?.crm?.dispatchRuns || [], [state.data]);
  const messageTemplates = useMemo(() => state.data?.crm?.messageTemplates || [], [state.data]);
  const actionQueue = useMemo(() => state.data?.crm?.actionQueue || [], [state.data]);
  const workflowLibrary = useMemo(() => state.data?.rollout?.workflowLibrary || [], [state.data]);
  const intents = useMemo(() => state.data?.rollout?.intents || [], [state.data]);
  const [catalogState, setCatalogState] = useState({
    loading: false,
    error: null,
    data: null,
  });
  const [resourceForm, setResourceForm] = useState({
    resource_key: "",
    resource_type: "sales_activity_type",
    resource_id: "",
    resource_name: "",
    provider: "freshsales",
    url: "",
    instructions: "",
    notes: "",
  });
  const [resourceSaveState, setResourceSaveState] = useState({
    loading: false,
    error: null,
    success: null,
  });
  const [templateForm, setTemplateForm] = useState({
    channel: "email",
    template_name: "",
    subject: "",
    body_html: "",
    body_text: "",
    notes: "",
    enabled: true,
  });
  const [templateSaveState, setTemplateSaveState] = useState({
    loading: false,
    error: null,
    success: null,
  });

  async function handleSaveRule(form) {
    await adminFetch("/api/admin-agentlab-governance", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "upsert_crm_rule",
        ...form,
      }),
    });
    state.refresh();
  }

  async function handleLoadCatalog() {
    try {
      setCatalogState({ loading: true, error: null, data: null });
      const payload = await adminFetch("/api/admin-freshsales-catalog");
      setCatalogState({ loading: false, error: null, data: payload.data || null });
    } catch (error) {
      setCatalogState({ loading: false, error: error.message, data: null });
    }
  }

  async function handleSaveResource() {
    try {
      setResourceSaveState({ loading: true, error: null, success: null });
      await adminFetch("/api/admin-agentlab-governance", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "upsert_crm_resource",
          ...resourceForm,
          metadata: {
            url: resourceForm.url || null,
            instructions: resourceForm.instructions || null,
          },
        }),
      });
      setResourceSaveState({ loading: false, error: null, success: "Mapa salvo com sucesso." });
      setResourceForm({
        resource_key: "",
        resource_type: "sales_activity_type",
        resource_id: "",
        resource_name: "",
        provider: "freshsales",
        url: "",
        instructions: "",
        notes: "",
      });
      state.refresh();
    } catch (error) {
      setResourceSaveState({ loading: false, error: error.message, success: null });
    }
  }

  async function handleSaveTemplate() {
    try {
      setTemplateSaveState({ loading: true, error: null, success: null });
      await adminFetch("/api/admin-agentlab-governance", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "upsert_message_template",
          ...templateForm,
        }),
      });
      setTemplateSaveState({ loading: false, error: null, success: "Template salvo com sucesso." });
      setTemplateForm({
        channel: "email",
        template_name: "",
        subject: "",
        body_html: "",
        body_text: "",
        notes: "",
        enabled: true,
      });
      state.refresh();
    } catch (error) {
      setTemplateSaveState({ loading: false, error: error.message, success: null });
    }
  }

  async function handleUpdateDispatch(run, status) {
    await adminFetch("/api/admin-agentlab-governance", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "update_dispatch_run",
        id: run.id,
        status,
        detail: status === "sent" ? "Marcado como enviado pela operacao." : `Marcado como ${status}.`,
      }),
    });
    state.refresh();
  }

  async function handleExecuteDispatch(run) {
    await adminFetch("/api/admin-agentlab-governance", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "execute_dispatch_run",
        id: run.id,
      }),
    });
    state.refresh();
  }

  async function handleUpdateActionQueueItem(item, status) {
    await adminFetch("/api/admin-agentlab-governance", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "update_action_queue_item",
        id: item.id,
        status,
        detail:
          status === "done"
            ? "Execucao operacional concluida no Freshsales."
            : status === "failed"
              ? "Execucao operacional falhou ou ficou pendente de revisao."
              : `Marcado como ${status}.`,
      }),
    });
    state.refresh();
  }

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="AgentLab · Workflows"
          description="Centro de regras operacionais entre evento de CRM, pipeline, sequencia, jornada, email e WhatsApp."
        >
          <AgentLabModuleNav />

          <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6 mb-6">
            <h3 className="font-serif text-2xl mb-4">Workflow backlog</h3>
            <div className="space-y-4 text-sm opacity-75">
              {(state.data?.rollout?.workflows || []).map((item) => (
                <div key={item.id} className="border border-[#2D2E2E] p-4">
                  <p className="font-semibold">{item.title}</p>
                  <p>{item.outcome}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-6 mb-6 xl:grid-cols-2">
            <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
              <h3 className="font-serif text-2xl mb-4">Workflow library sugerida</h3>
              <div className="space-y-4 text-sm opacity-75">
                {workflowLibrary.map((item) => (
                  <div key={item.id} className="border border-[#2D2E2E] p-4">
                    <div className="flex flex-wrap gap-3 mb-2 text-xs uppercase tracking-[0.15em] opacity-50">
                      <span>{item.type}</span>
                      <span>{item.status}</span>
                    </div>
                    <p className="font-semibold">{item.title}</p>
                    <p className="mt-2">{item.notes}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
              <h3 className="font-serif text-2xl mb-4">Catalogo de intents</h3>
              <div className="space-y-4 text-sm opacity-75">
                {intents.map((item) => (
                  <div key={item.id} className="border border-[#2D2E2E] p-4">
                    <p className="font-semibold">{item.label}</p>
                    <p className="mt-2">{item.policy}</p>
                    <div className="mt-3 space-y-1 text-xs opacity-60">
                      {(item.examples || []).map((example) => (
                        <p key={example}>• {example}</p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="font-serif text-2xl">Regras de automacao CRM</h3>
                <p className="text-sm opacity-65 mt-2">
                  Defina o que cada evento do funil deve disparar no Freshsales Suite.
                </p>
              </div>
              <div className="text-xs uppercase tracking-[0.15em] opacity-45">
                {rules.length} regras carregadas
              </div>
            </div>

            <div className="space-y-5">
              {rules.map((rule) => (
                <RuleCard key={rule.id} rule={rule} onSave={handleSaveRule} />
              ))}
            </div>
          </div>

          <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6 mt-6">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="font-serif text-2xl">Execucoes recentes</h3>
                <p className="text-sm opacity-65 mt-2">
                  Trilhas geradas pelos eventos do agendamento para operar sequencias, jornadas e campanhas.
                </p>
              </div>
              <div className="text-xs uppercase tracking-[0.15em] opacity-45">
                {runs.length} execucoes
              </div>
            </div>

            <div className="space-y-4">
              {runs.length ? runs.map((run) => (
                <div key={run.id} className="border border-[#2D2E2E] p-4">
                  <div className="flex flex-wrap items-center gap-3 mb-3">
                    <span className="text-[10px] font-semibold tracking-[0.2em]" style={{ color: "#C5A059" }}>
                      {run.event_key}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.15em] opacity-45">{run.status}</span>
                    <span className="text-[10px] uppercase tracking-[0.15em] opacity-45">{run.execution_mode}</span>
                  </div>
                  <p className="text-sm opacity-80 mb-2">
                    Referencia: {run.source_ref || "sem referencia"} | Criado em {run.created_at || "sem data"}
                  </p>
                  <div className="space-y-1 text-sm opacity-70">
                    {Array.isArray(run.planned_actions) && run.planned_actions.length ? run.planned_actions.map((action) => (
                      <p key={action}>• {action}</p>
                    )) : <p>Nenhuma acao planejada registrada.</p>}
                  </div>
                </div>
              )) : (
                <div className="border border-[#2D2E2E] p-4 text-sm opacity-70">
                  Ainda nao ha execucoes registradas. Elas aparecem quando eventos como `booked`, `confirmed`, `attended` e `no_show` passam pelo fluxo.
                </div>
              )}
            </div>
          </div>

          <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6 mt-6">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="font-serif text-2xl">Templates operacionais</h3>
                <p className="text-sm opacity-65 mt-2">
                  Edite o texto-base usado pelo dispatcher para email e WhatsApp.
                </p>
              </div>
              <div className="text-xs uppercase tracking-[0.15em] opacity-45">
                {messageTemplates.length} templates
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="block mb-2 text-xs font-semibold tracking-[0.15em] uppercase opacity-60">Canal</span>
                <select
                  value={templateForm.channel}
                  onChange={(event) => setTemplateForm((current) => ({ ...current, channel: event.target.value }))}
                  className="w-full border border-[#2D2E2E] bg-[#050706] px-4 py-3 outline-none focus:border-[#C5A059]"
                >
                  <option value="email">email</option>
                  <option value="whatsapp">whatsapp</option>
                </select>
              </label>
              <label className="block">
                <span className="block mb-2 text-xs font-semibold tracking-[0.15em] uppercase opacity-60">Template name</span>
                <input
                  value={templateForm.template_name}
                  onChange={(event) => setTemplateForm((current) => ({ ...current, template_name: event.target.value }))}
                  className="w-full border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="block mb-2 text-xs font-semibold tracking-[0.15em] uppercase opacity-60">Subject</span>
                <input
                  value={templateForm.subject}
                  onChange={(event) => setTemplateForm((current) => ({ ...current, subject: event.target.value }))}
                  className="w-full border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="block mb-2 text-xs font-semibold tracking-[0.15em] uppercase opacity-60">Body HTML</span>
                <textarea
                  value={templateForm.body_html}
                  onChange={(event) => setTemplateForm((current) => ({ ...current, body_html: event.target.value }))}
                  rows={6}
                  className="w-full border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
                  placeholder="<p>Olá, {{nome}}</p>"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="block mb-2 text-xs font-semibold tracking-[0.15em] uppercase opacity-60">Body text</span>
                <textarea
                  value={templateForm.body_text}
                  onChange={(event) => setTemplateForm((current) => ({ ...current, body_text: event.target.value }))}
                  rows={5}
                  className="w-full border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
                  placeholder="Ola, {{nome}}. Sua consulta esta marcada para {{data}}, as {{hora}}. {{zoom_link}}"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="block mb-2 text-xs font-semibold tracking-[0.15em] uppercase opacity-60">Notas</span>
                <textarea
                  value={templateForm.notes}
                  onChange={(event) => setTemplateForm((current) => ({ ...current, notes: event.target.value }))}
                  rows={3}
                  className="w-full border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleSaveTemplate}
                disabled={templateSaveState.loading}
                className="bg-[#C5A059] px-5 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-[#050706] disabled:opacity-60"
              >
                {templateSaveState.loading ? "Salvando..." : "Salvar template"}
              </button>
              {templateSaveState.success ? <p className="text-sm text-emerald-400">{templateSaveState.success}</p> : null}
              {templateSaveState.error ? <p className="text-sm text-red-300">{templateSaveState.error}</p> : null}
            </div>

            <div className="space-y-3 mt-6">
              {messageTemplates.length ? messageTemplates.map((item) => (
                <div key={item.id} className="border border-[#2D2E2E] p-4 text-sm">
                  <p className="font-semibold">{item.channel} · {item.template_name}</p>
                  <p className="opacity-75">{item.subject || "Sem subject"}</p>
                  {item.body_text ? <p className="opacity-70 mt-2 whitespace-pre-wrap">{item.body_text}</p> : null}
                  {item.notes ? <p className="opacity-60 mt-2">{item.notes}</p> : null}
                </div>
              )) : (
                <div className="border border-[#2D2E2E] p-4 text-sm opacity-70">
                  Ainda nao ha templates customizados. O dispatcher usa fallback padrao enquanto isso.
                </div>
              )}
            </div>
          </div>

          <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6 mt-6">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="font-serif text-2xl">Fila de sequences e journeys</h3>
                <p className="text-sm opacity-65 mt-2">
                  Como o Freshsales nem sempre expõe API pública para esses recursos, o AgentLab mantém uma fila guiada com rastreabilidade.
                </p>
              </div>
              <div className="text-xs uppercase tracking-[0.15em] opacity-45">
                {actionQueue.length} acoes
              </div>
            </div>

            <div className="space-y-4">
              {actionQueue.length ? actionQueue.map((item) => (
                <div key={item.id} className="border border-[#2D2E2E] p-4">
                  <div className="flex flex-wrap items-center gap-3 mb-3">
                    <span className="text-[10px] font-semibold tracking-[0.2em]" style={{ color: "#C5A059" }}>
                      {item.action_type}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.15em] opacity-45">{item.status}</span>
                    <span className="text-[10px] uppercase tracking-[0.15em] opacity-45">{item.event_key}</span>
                  </div>
                  <p className="text-sm opacity-80">
                    {item.resource_name || item.resource_key || "sem recurso"} {item.resource_id ? `· ID ${item.resource_id}` : "· sem ID mapeado"}
                  </p>
                  {item.detail ? <p className="text-sm opacity-60 mt-2">{item.detail}</p> : null}
                  {item.payload?.resource_metadata?.url ? (
                    <p className="text-sm mt-2">
                      <a
                        href={item.payload.resource_metadata.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#C5A059] underline underline-offset-4"
                      >
                        Abrir recurso no Freshsales
                      </a>
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-3">
                    {item.status !== "done" ? (
                      <button
                        type="button"
                        onClick={() => handleUpdateActionQueueItem(item, "done")}
                        className="border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059]"
                      >
                        Marcar concluida
                      </button>
                    ) : null}
                    {item.status !== "failed" ? (
                      <button
                        type="button"
                        onClick={() => handleUpdateActionQueueItem(item, "failed")}
                        className="border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059]"
                      >
                        Marcar falha
                      </button>
                    ) : null}
                    {item.status !== "pending" ? (
                      <button
                        type="button"
                        onClick={() => handleUpdateActionQueueItem(item, "pending")}
                        className="border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059]"
                      >
                        Voltar para fila
                      </button>
                    ) : null}
                  </div>
                </div>
              )) : (
                <div className="border border-[#2D2E2E] p-4 text-sm opacity-70">
                  Ainda nao ha sequences ou journeys na fila. Elas aparecem quando uma regra configurada usa esses recursos.
                </div>
              )}
            </div>
          </div>

          <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6 mt-6">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="font-serif text-2xl">Dispatch real</h3>
                <p className="text-sm opacity-65 mt-2">
                  E-mails operacionais enviados e fila de WhatsApp gerada a partir das regras.
                </p>
              </div>
              <div className="text-xs uppercase tracking-[0.15em] opacity-45">
                {dispatchRuns.length} dispatches
              </div>
            </div>

            <div className="space-y-4">
              {dispatchRuns.length ? dispatchRuns.map((run) => (
                <div key={run.id} className="border border-[#2D2E2E] p-4">
                  <div className="flex flex-wrap items-center gap-3 mb-3">
                    <span className="text-[10px] font-semibold tracking-[0.2em]" style={{ color: "#C5A059" }}>
                      {run.channel}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.15em] opacity-45">{run.status}</span>
                  </div>
                  <p className="text-sm opacity-80">{run.template_name || "sem template"} · {run.recipient_ref || "sem destinatario"}</p>
                  {run.detail ? <p className="text-sm opacity-60 mt-2">{run.detail}</p> : null}
                  {run.payload?.message_preview ? (
                    <div className="mt-3 border border-[#2D2E2E] bg-[rgba(255,255,255,0.02)] p-3 text-sm whitespace-pre-wrap opacity-80">
                      {run.payload.message_preview}
                    </div>
                  ) : null}
                  {run.channel === "whatsapp" ? (
                    <div className="mt-3 flex flex-wrap gap-3">
                      {run.status === "pending_approval" ? (
                        <button
                          type="button"
                          onClick={() => handleUpdateDispatch(run, "approved")}
                          className="border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059]"
                        >
                          Aprovar fila
                        </button>
                      ) : null}
                      {run.status === "approved" ? (
                        <button
                          type="button"
                          onClick={() => handleExecuteDispatch(run)}
                          className="bg-[#C5A059] px-3 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-[#050706]"
                        >
                          Enviar agora
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleUpdateDispatch(run, "sent")}
                        className="border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059]"
                      >
                        Marcar como enviado
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateDispatch(run, "failed")}
                        className="border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059]"
                      >
                        Marcar falha
                      </button>
                    </div>
                  ) : null}
                </div>
              )) : (
                <div className="border border-[#2D2E2E] p-4 text-sm opacity-70">
                  Ainda nao ha dispatches registrados. Eles passam a aparecer quando uma regra em modo `auto` ou `semi_auto` gerar envio real ou fila.
                </div>
              )}
            </div>
          </div>

          <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6 mt-6">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="font-serif text-2xl">Catalogo Freshsales</h3>
                <p className="text-sm opacity-65 mt-2">
                  Descubra IDs reais de campos, owners e activity types antes de ativar automacoes mais profundas.
                </p>
              </div>
              <button
                type="button"
                onClick={handleLoadCatalog}
                disabled={catalogState.loading}
                className="bg-[#C5A059] px-5 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-[#050706] disabled:opacity-60"
              >
                {catalogState.loading ? "Consultando..." : "Carregar catalogo"}
              </button>
            </div>

            {catalogState.error ? (
              <div className="border border-[#7f1d1d] bg-[rgba(127,29,29,0.22)] p-4 text-sm mb-4">{catalogState.error}</div>
            ) : null}

            {catalogState.data ? (
              <div className="grid gap-6 md:grid-cols-2">
                <div className="border border-[#2D2E2E] p-4">
                  <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-3 opacity-50">Sales activity types</p>
                  <div className="space-y-2 text-sm opacity-80 max-h-72 overflow-auto">
                    {(catalogState.data.sales_activity_types || []).map((item) => (
                      <p key={`sat-${item.id}`}>{item.id} · {item.name}</p>
                    ))}
                  </div>
                </div>
                <div className="border border-[#2D2E2E] p-4">
                  <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-3 opacity-50">Owners</p>
                  <div className="space-y-2 text-sm opacity-80 max-h-72 overflow-auto">
                    {(catalogState.data.owners || []).map((item) => (
                      <p key={`owner-${item.id}`}>{item.id} · {item.name}</p>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6 mt-6">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="font-serif text-2xl">Mapa de recursos CRM</h3>
                <p className="text-sm opacity-65 mt-2">
                  Salve os IDs reais do tenant por chave operacional, sem depender de variavel de ambiente para tudo.
                </p>
              </div>
              <div className="text-xs uppercase tracking-[0.15em] opacity-45">
                {resourceMap.length} mapeamentos
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="block">
                <span className="block mb-2 text-xs font-semibold tracking-[0.15em] uppercase opacity-60">Resource key</span>
                <input
                  value={resourceForm.resource_key}
                  onChange={(event) => setResourceForm((current) => ({ ...current, resource_key: event.target.value }))}
                  className="w-full border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
                  placeholder="crm.sequence.pre_consulta"
                />
              </label>
              <label className="block">
                <span className="block mb-2 text-xs font-semibold tracking-[0.15em] uppercase opacity-60">Tipo</span>
                <select
                  value={resourceForm.resource_type}
                  onChange={(event) => setResourceForm((current) => ({ ...current, resource_type: event.target.value }))}
                  className="w-full border border-[#2D2E2E] bg-[#050706] px-4 py-3 outline-none focus:border-[#C5A059]"
                >
                  <option value="sales_activity_type">sales_activity_type</option>
                  <option value="owner">owner</option>
                  <option value="email_template">email_template</option>
                  <option value="whatsapp_template">whatsapp_template</option>
                  <option value="sequence">sequence</option>
                  <option value="journey">journey</option>
                  <option value="field">field</option>
                </select>
              </label>
              <label className="block">
                <span className="block mb-2 text-xs font-semibold tracking-[0.15em] uppercase opacity-60">Resource id</span>
                <input
                  value={resourceForm.resource_id}
                  onChange={(event) => setResourceForm((current) => ({ ...current, resource_id: event.target.value }))}
                  className="w-full border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
                />
              </label>
              <label className="block">
                <span className="block mb-2 text-xs font-semibold tracking-[0.15em] uppercase opacity-60">Nome</span>
                <input
                  value={resourceForm.resource_name}
                  onChange={(event) => setResourceForm((current) => ({ ...current, resource_name: event.target.value }))}
                  className="w-full border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
                />
              </label>
              <label className="block">
                <span className="block mb-2 text-xs font-semibold tracking-[0.15em] uppercase opacity-60">Provider</span>
                <input
                  value={resourceForm.provider}
                  onChange={(event) => setResourceForm((current) => ({ ...current, provider: event.target.value }))}
                  className="w-full border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
                />
              </label>
              <label className="block md:col-span-3">
                <span className="block mb-2 text-xs font-semibold tracking-[0.15em] uppercase opacity-60">URL operacional</span>
                <input
                  value={resourceForm.url}
                  onChange={(event) => setResourceForm((current) => ({ ...current, url: event.target.value }))}
                  className="w-full border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
                  placeholder="https://hmadv-org.myfreshworks.com/..."
                />
              </label>
              <label className="block md:col-span-3">
                <span className="block mb-2 text-xs font-semibold tracking-[0.15em] uppercase opacity-60">Instrucoes operacionais</span>
                <textarea
                  value={resourceForm.instructions}
                  onChange={(event) => setResourceForm((current) => ({ ...current, instructions: event.target.value }))}
                  rows={3}
                  className="w-full border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
                  placeholder="Passos para executar este recurso no Freshsales."
                />
              </label>
              <label className="block md:col-span-3">
                <span className="block mb-2 text-xs font-semibold tracking-[0.15em] uppercase opacity-60">Notas</span>
                <textarea
                  value={resourceForm.notes}
                  onChange={(event) => setResourceForm((current) => ({ ...current, notes: event.target.value }))}
                  rows={3}
                  className="w-full border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleSaveResource}
                disabled={resourceSaveState.loading}
                className="bg-[#C5A059] px-5 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-[#050706] disabled:opacity-60"
              >
                {resourceSaveState.loading ? "Salvando..." : "Salvar mapeamento"}
              </button>
              {resourceSaveState.success ? <p className="text-sm text-emerald-400">{resourceSaveState.success}</p> : null}
              {resourceSaveState.error ? <p className="text-sm text-red-300">{resourceSaveState.error}</p> : null}
            </div>

            <div className="space-y-3 mt-6">
              {resourceMap.length ? resourceMap.map((item) => (
                <div key={item.id} className="border border-[#2D2E2E] p-4 text-sm">
                  <p className="font-semibold">{item.resource_key}</p>
                  <p className="opacity-75">{item.resource_type} · {item.resource_id} · {item.resource_name || "sem nome"}</p>
                  {item.metadata?.url ? (
                    <p className="mt-2">
                      <a
                        href={item.metadata.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#C5A059] underline underline-offset-4"
                      >
                        Abrir recurso
                      </a>
                    </p>
                  ) : null}
                  {item.metadata?.instructions ? <p className="opacity-70 mt-2 whitespace-pre-wrap">{item.metadata.instructions}</p> : null}
                  {item.notes ? <p className="opacity-60 mt-2">{item.notes}</p> : null}
                </div>
              )) : (
                <div className="border border-[#2D2E2E] p-4 text-sm opacity-70">
                  Ainda nao ha mapeamentos persistidos. Use o catalogo para descobrir os IDs reais e salve aqui.
                </div>
              )}
            </div>
          </div>
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}
