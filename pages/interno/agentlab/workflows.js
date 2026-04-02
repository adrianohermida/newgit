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
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}
