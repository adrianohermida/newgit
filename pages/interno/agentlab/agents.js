import { useEffect, useMemo, useState } from "react";
import InternoLayout from "../../../components/interno/InternoLayout";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import AgentLabModuleNav from "../../../components/interno/agentlab/AgentLabModuleNav";
import { adminFetch } from "../../../lib/admin/api";
import { useAgentLabData } from "../../../lib/agentlab/useAgentLabData";

function Panel({ title, children }) {
  return (
    <section className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
      <h3 className="mb-4 font-serif text-2xl">{title}</h3>
      {children}
    </section>
  );
}

export default function AgentLabAgentsPage() {
  const state = useAgentLabData();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [queueMessage, setQueueMessage] = useState(null);
  const [quickReplyMessage, setQuickReplyMessage] = useState(null);

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="AgentLab · Agentes"
          description="Centro de configuracao de persona, respostas rapidas, handoff e fila viva de melhoria dos agentes."
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
            quickReplyMessage={quickReplyMessage}
            setQuickReplyMessage={setQuickReplyMessage}
          />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

function AgentsContent({ state, saving, setSaving, message, setMessage, queueMessage, setQueueMessage, quickReplyMessage, setQuickReplyMessage }) {
  const profile = useMemo(() => state.data?.governance?.profiles?.[0] || null, [state.data]);
  const queue = state.data?.governance?.queue || [];
  const quickReplies = state.data?.governance?.quickReplies || [];
  const handoffPlaybooks = state.data?.governance?.handoffPlaybooks || [];
  const catalog = state.data?.agents || [];
  const [quickReplyForm, setQuickReplyForm] = useState({
    category: "financeiro",
    title: "",
    shortcut: "",
    body: "",
    status: "active",
  });
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
      state.refresh();
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
      setQueueMessage("Fila de melhoria atualizada.");
      state.refresh();
    } catch (error) {
      setQueueMessage(error.message);
    }
  }

  async function handleSaveQuickReply() {
    try {
      setQuickReplyMessage(null);
      await adminFetch("/api/admin-agentlab-governance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert_quick_reply",
          agent_ref: "dotobot-ai",
          ...quickReplyForm,
        }),
      });
      setQuickReplyMessage("Resposta rapida salva.");
      setQuickReplyForm({
        category: "financeiro",
        title: "",
        shortcut: "",
        body: "",
        status: "active",
      });
      state.refresh();
    } catch (error) {
      setQuickReplyMessage(error.message);
    }
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
        <Panel title="Perfil principal do agente">
          {message ? <div className="mb-4 text-sm opacity-75">{message}</div> : null}
          {!form ? (
            <p className="text-sm opacity-70">Nenhum perfil carregado.</p>
          ) : (
            <div className="space-y-4">
              {[
                ["Objetivo de negocio", "business_goal"],
                ["Persona", "persona_prompt"],
                ["Politica de resposta", "response_policy"],
                ["Estrategia de conhecimento", "knowledge_strategy"],
                ["Estrategia de workflow", "workflow_strategy"],
                ["Regras de handoff", "handoff_rules"],
              ].map(([label, key]) => (
                <label key={key} className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em]">{label}</span>
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
            {catalog.map((item) => (
              <div key={item.id} className="border border-[#2D2E2E] p-4">
                <div className="mb-2 flex flex-wrap gap-3 text-xs uppercase tracking-[0.15em] opacity-50">
                  <span>{item.status}</span>
                  <span>{item.agent_slug || "sem slug"}</span>
                </div>
                <p className="font-semibold">{item.name}</p>
                {item.profile?.business_goal ? <p className="mt-2 opacity-75">{item.profile.business_goal}</p> : null}
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Respostas rapidas prioritarias">
          {quickReplyMessage ? <div className="mb-4 text-sm opacity-75">{quickReplyMessage}</div> : null}
          <div className="grid gap-4 mb-6 md:grid-cols-2">
            <input
              value={quickReplyForm.title}
              onChange={(event) => setQuickReplyForm((current) => ({ ...current, title: event.target.value }))}
              className="border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
              placeholder="Titulo da resposta rapida"
            />
            <input
              value={quickReplyForm.shortcut}
              onChange={(event) => setQuickReplyForm((current) => ({ ...current, shortcut: event.target.value }))}
              className="border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
              placeholder="/atalho"
            />
            <input
              value={quickReplyForm.category}
              onChange={(event) => setQuickReplyForm((current) => ({ ...current, category: event.target.value }))}
              className="border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
              placeholder="Categoria"
            />
            <input
              value={quickReplyForm.status}
              onChange={(event) => setQuickReplyForm((current) => ({ ...current, status: event.target.value }))}
              className="border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
              placeholder="Status"
            />
            <textarea
              value={quickReplyForm.body}
              onChange={(event) => setQuickReplyForm((current) => ({ ...current, body: event.target.value }))}
              className="min-h-[100px] md:col-span-2 border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
              placeholder="Texto da resposta"
            />
            <div className="md:col-span-2">
              <button type="button" onClick={handleSaveQuickReply} className="border border-[#C5A059] px-4 py-3 text-sm">
                Salvar resposta rapida
              </button>
            </div>
          </div>
          <div className="space-y-4 text-sm opacity-75">
            {quickReplies.map((item) => (
              <div key={item.id} className="border border-[#2D2E2E] p-4">
                <div className="mb-2 flex flex-wrap gap-3 text-xs uppercase tracking-[0.15em] opacity-50">
                  <span>{item.category}</span>
                  <span>{item.shortcut}</span>
                </div>
                <p className="mb-2 font-semibold">{item.title}</p>
                <p>{item.body}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Playbooks de handoff">
          <div className="space-y-4 text-sm opacity-75">
            {handoffPlaybooks.map((item) => (
              <div key={item.id} className="border border-[#2D2E2E] p-4">
                <div className="mb-2 flex flex-wrap gap-3 text-xs uppercase tracking-[0.15em] opacity-50">
                  <span>trigger: {item.trigger}</span>
                  <span>destino: {item.destination}</span>
                </div>
                <p>{item.summary}</p>
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
              <div className="mb-2 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.15em] opacity-50">
                <span>{item.category}</span>
                <span>{item.priority}</span>
                <span>{item.status}</span>
                <span>{item.sprint_bucket || "Sem sprint"}</span>
              </div>
              <p className="mb-2 font-semibold">{item.title}</p>
              <p className="mb-4 text-sm opacity-75">{item.description}</p>
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
