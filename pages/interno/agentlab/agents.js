import { useEffect, useMemo, useState } from "react";
import InternoLayout from "../../../components/interno/InternoLayout";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import AgentLabModuleNav from "../../../components/interno/agentlab/AgentLabModuleNav";
import { adminFetch } from "../../../lib/admin/api";
import { useAgentLabData } from "../../../lib/agentlab/useAgentLabData";

function Panel({ title, children }) {
  return (
    <section className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
      <h3 className="font-serif text-2xl mb-4">{title}</h3>
      {children}
    </section>
  );
}

export default function AgentLabAgentsPage() {
  const state = useAgentLabData();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [queueMessage, setQueueMessage] = useState(null);

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="AgentLab · Agents"
          description="Centro de configuracao de persona, politicas de resposta, workflow strategy e fila viva de melhoria."
        >
          <AgentLabModuleNav />
          <AgentsContent
            state={state}
            saving={saving}
            setSaving={setSaving}
            message={message}
            setMessage={setMessage}
            queueMessage={queueMessage}
            setQueueMessage={setQueueMessage}
          />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

function AgentsContent({ state, saving, setSaving, message, setMessage, queueMessage, setQueueMessage }) {
  const profile = useMemo(() => state.data?.governance?.profiles?.[0] || null, [state.data]);
  const queue = state.data?.governance?.queue || [];
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (!form && profile) {
      setForm({
        id: profile.id,
        business_goal: profile.business_goal || "",
        persona_prompt: profile.persona_prompt || "",
        response_policy: profile.response_policy || "",
        knowledge_strategy: (profile.knowledge_strategy || []).join("\n"),
        workflow_strategy: (profile.workflow_strategy || []).join("\n"),
        handoff_rules: (profile.handoff_rules || []).join("\n"),
      });
    }
  }, [form, profile]);

  if (state.loading) {
    return <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">Carregando agentes...</div>;
  }

  if (state.error) {
    return <div className="border border-[#7f1d1d] bg-[rgba(127,29,29,0.22)] p-6 text-sm">{state.error}</div>;
  }

  async function handleSave() {
    if (!form) return;
    try {
      setSaving(true);
      setMessage(null);
      await adminFetch("/api/admin-agentlab-governance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_profile",
          ...form,
          knowledge_strategy: form.knowledge_strategy.split("\n").map((item) => item.trim()).filter(Boolean),
          workflow_strategy: form.workflow_strategy.split("\n").map((item) => item.trim()).filter(Boolean),
          handoff_rules: form.handoff_rules.split("\n").map((item) => item.trim()).filter(Boolean),
        }),
      });
      setMessage("Perfil do agente atualizado.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function updateQueue(item, patch) {
    try {
      setQueueMessage(null);
      await adminFetch("/api/admin-agentlab-governance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_queue_item",
          id: item.id,
          status: patch.status || item.status,
          priority: patch.priority || item.priority,
        }),
      });
      setQueueMessage("Fila de melhoria atualizada. Recarregue a pagina para ver o estado novo.");
    } catch (error) {
      setQueueMessage(error.message);
    }
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Panel title="Perfil do agente">
          {message ? <div className="mb-4 text-sm opacity-75">{message}</div> : null}
          {!form ? (
            <p className="text-sm opacity-70">Nenhum perfil carregado.</p>
          ) : (
            <div className="space-y-4">
              {[
                ["Objetivo de negocio", "business_goal"],
                ["Persona", "persona_prompt"],
                ["Response policy", "response_policy"],
                ["Knowledge strategy", "knowledge_strategy"],
                ["Workflow strategy", "workflow_strategy"],
                ["Handoff rules", "handoff_rules"],
              ].map(([label, key]) => (
                <label key={key} className="block">
                  <span className="block mb-2 text-xs font-semibold tracking-[0.15em] uppercase">{label}</span>
                  <textarea
                    value={form[key]}
                    onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                    className="min-h-[96px] w-full border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
                  />
                </label>
              ))}

              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="border border-[#C5A059] bg-[#C5A059] px-4 py-3 text-sm text-[#050706] disabled:opacity-60"
              >
                {saving ? "Salvando..." : "Salvar perfil"}
              </button>
            </div>
          )}
        </Panel>

        <Panel title="Catalogo de agentes">
          <div className="space-y-4 text-sm opacity-75">
            {(state.data?.agents || []).map((item) => (
              <div key={item.id} className="border border-[#2D2E2E] p-4">
                <p className="font-semibold">{item.name}</p>
                <p>Status: {item.status}</p>
                <p>Slug: {item.agent_slug || "n/a"}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Fila viva de melhoria">
        {queueMessage ? <div className="mb-4 text-sm opacity-75">{queueMessage}</div> : null}
        <div className="space-y-4">
          {queue.map((item) => (
            <div key={item.id} className="border border-[#2D2E2E] p-4">
              <div className="flex flex-wrap items-center gap-3 mb-2 text-xs uppercase tracking-[0.15em] opacity-50">
                <span>{item.category}</span>
                <span>{item.priority}</span>
                <span>{item.status}</span>
                <span>{item.sprint_bucket || "Sem sprint"}</span>
              </div>
              <p className="font-semibold mb-2">{item.title}</p>
              <p className="text-sm opacity-75 mb-4">{item.description}</p>
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => updateQueue(item, { status: "doing" })} className="border border-[#2D2E2E] px-3 py-2 text-xs">
                  Mover para doing
                </button>
                <button type="button" onClick={() => updateQueue(item, { status: "done" })} className="border border-[#2D2E2E] px-3 py-2 text-xs">
                  Marcar done
                </button>
                <button type="button" onClick={() => updateQueue(item, { priority: "alta" })} className="border border-[#2D2E2E] px-3 py-2 text-xs">
                  Prioridade alta
                </button>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
