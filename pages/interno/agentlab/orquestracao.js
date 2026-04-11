import { useEffect, useMemo, useState } from "react";
import InternoLayout from "../../../components/interno/InternoLayout";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import AgentLabModuleNav from "../../../components/interno/agentlab/AgentLabModuleNav";
import { adminFetch } from "../../../lib/admin/api";
import { useAgentLabData } from "../../../lib/agentlab/useAgentLabData";
import { setModuleHistory } from "../../../lib/admin/activity-log";
import { buildModuleSnapshot } from "../../../lib/admin/module-registry";

function Panel({ title, children }) {
  return (
    <section className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
      <h3 className="mb-4 font-serif text-2xl">{title}</h3>
      {children}
    </section>
  );
}

function SaveState({ state }) {
  if (!state) return null;
  if (state.error) return <p className="mt-3 text-sm text-red-300">{state.error}</p>;
  if (state.success) return <p className="mt-3 text-sm text-emerald-400">{state.success}</p>;
  return null;
}

export default function AgentLabOrquestracaoPage() {
  const state = useAgentLabData();
  const [selectedAgent, setSelectedAgent] = useState("dotobot-chatbot");
  const [replyForm, setReplyForm] = useState({
    title: "",
    shortcut: "",
    category: "geral",
    body: "",
    status: "active",
  });
  const [intentForm, setIntentForm] = useState({
    label: "",
    examples: "",
    policy: "",
    status: "active",
  });
  const [knowledgeForm, setKnowledgeForm] = useState({
    source_type: "faq",
    title: "",
    status: "draft",
    notes: "",
  });
  const [workflowForm, setWorkflowForm] = useState({
    title: "",
    type: "workflow",
    status: "backlog",
    notes: "",
  });
  const [replyState, setReplyState] = useState(null);
  const [intentState, setIntentState] = useState(null);
  const [knowledgeState, setKnowledgeState] = useState(null);
  const [workflowState, setWorkflowState] = useState(null);

  const agents = state.data?.agents || [];
  const selectedCatalogItem = useMemo(
    () => agents.find((item) => (item.agent_slug || item.agent_ref) === selectedAgent) || null,
    [agents, selectedAgent]
  );
  const quickReplies = (state.data?.governance?.quickReplies || []).filter(
    (item) => item.agent_ref === selectedAgent
  );
  const intents = (state.data?.rollout?.intents || []).filter(
    (item) => (item.agent_ref || "dotobot-ai") === selectedAgent
  );
  const knowledgeSources = (state.data?.rollout?.knowledgeSources || []).filter(
    (item) => (item.agent_ref || "dotobot-ai") === selectedAgent
  );
  const workflowLibrary = (state.data?.rollout?.workflowLibrary || []).filter(
    (item) => (item.agent_ref || "dotobot-ai") === selectedAgent
  );
  const handoffPlaybooks = (state.data?.governance?.handoffPlaybooks || []).filter(
    (item) => !item.agent_ref || item.agent_ref === selectedAgent
  );

  useEffect(() => {
    setModuleHistory(
      "agentlab-orquestracao",
      buildModuleSnapshot("agentlab", {
        routePath: "/interno/agentlab/orquestracao",
        loading: state.loading,
        error: state.error,
        section: "orquestracao",
        selectedAgent,
        quickReplies: quickReplies.length,
        intents: intents.length,
        knowledgeSources: knowledgeSources.length,
        workflowLibrary: workflowLibrary.length,
        handoffPlaybooks: handoffPlaybooks.length,
        saving: Boolean(replyState?.loading || intentState?.loading || knowledgeState?.loading || workflowState?.loading),
        coverage: {
          routeTracked: true,
          consoleIntegrated: true,
          actionsTracked: true,
        },
      }),
    );
  }, [
    handoffPlaybooks.length,
    intentState?.loading,
    intents.length,
    knowledgeSources.length,
    knowledgeState?.loading,
    quickReplies.length,
    replyState?.loading,
    selectedAgent,
    state.error,
    state.loading,
    workflowLibrary.length,
    workflowState?.loading,
  ]);

  async function saveQuickReply() {
    try {
      setReplyState({ loading: true, error: null, success: null });
      await adminFetch("/api/admin-agentlab-governance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert_quick_reply",
          agent_ref: selectedAgent,
          ...replyForm,
        }),
      });
      setReplyState({ loading: false, error: null, success: "Resposta rapida salva." });
      setReplyForm({ title: "", shortcut: "", category: "geral", body: "", status: "active" });
      state.refresh();
    } catch (error) {
      setReplyState({ loading: false, error: error.message, success: null });
    }
  }

  async function saveIntent() {
    try {
      setIntentState({ loading: true, error: null, success: null });
      await adminFetch("/api/admin-agentlab-governance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert_intent",
          agent_ref: selectedAgent,
          label: intentForm.label,
          examples: intentForm.examples,
          policy: intentForm.policy,
          status: intentForm.status,
        }),
      });
      setIntentState({ loading: false, error: null, success: "Intent salva." });
      setIntentForm({ label: "", examples: "", policy: "", status: "active" });
      state.refresh();
    } catch (error) {
      setIntentState({ loading: false, error: error.message, success: null });
    }
  }

  async function saveKnowledgeSource() {
    try {
      setKnowledgeState({ loading: true, error: null, success: null });
      await adminFetch("/api/admin-agentlab-governance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert_knowledge_source",
          agent_ref: selectedAgent,
          ...knowledgeForm,
        }),
      });
      setKnowledgeState({ loading: false, error: null, success: "Fonte de conhecimento salva." });
      setKnowledgeForm({ source_type: "faq", title: "", status: "draft", notes: "" });
      state.refresh();
    } catch (error) {
      setKnowledgeState({ loading: false, error: error.message, success: null });
    }
  }

  async function saveWorkflowLibraryItem() {
    try {
      setWorkflowState({ loading: true, error: null, success: null });
      await adminFetch("/api/admin-agentlab-governance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert_workflow_library_item",
          agent_ref: selectedAgent,
          ...workflowForm,
        }),
      });
      setWorkflowState({ loading: false, error: null, success: "Item da workflow library salvo." });
      setWorkflowForm({ title: "", type: "workflow", status: "backlog", notes: "" });
      state.refresh();
    } catch (error) {
      setWorkflowState({ loading: false, error: error.message, success: null });
    }
  }

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="AgentLab | Experimentos"
          description="Centro operacional para separar chatbot e agente de IA, com controle de intents, conhecimento, respostas rapidas, workflow library e testes de comportamento por agente."
        >
          <AgentLabModuleNav />
          {state.loading ? (
            <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">Carregando experimentos...</div>
          ) : state.error ? (
            <div className="border border-[#7f1d1d] bg-[rgba(127,29,29,0.22)] p-6 text-sm">{state.error}</div>
          ) : (
            <div className="space-y-8">
              <Panel title="Escopo de experimentos">
                <div className="grid gap-4 md:grid-cols-[260px_1fr]">
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em]">Agente</span>
                    <select
                      value={selectedAgent}
                      onChange={(event) => setSelectedAgent(event.target.value)}
                      className="w-full border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
                    >
                      {agents.map((item) => (
                        <option key={item.id} value={item.agent_slug || item.agent_ref}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="border border-[#2D2E2E] p-4 text-sm opacity-75">
                    <p className="font-semibold">{selectedCatalogItem?.name || "Agente"}</p>
                    <p className="mt-2">
                      Tipo: {selectedCatalogItem?.agent_kind || "agent"} | Canal principal:{" "}
                      {selectedCatalogItem?.primary_channel || "n/a"}
                    </p>
                    {selectedCatalogItem?.profile?.business_goal ? (
                      <p className="mt-2">{selectedCatalogItem.profile.business_goal}</p>
                    ) : null}
                  </div>
                </div>
              </Panel>

              <div className="grid gap-6 xl:grid-cols-2">
                <Panel title={`Respostas rapidas (${quickReplies.length})`}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <input value={replyForm.title} onChange={(e) => setReplyForm((c) => ({ ...c, title: e.target.value }))} className="border border-[#2D2E2E] bg-transparent px-4 py-3" placeholder="Titulo" />
                    <input value={replyForm.shortcut} onChange={(e) => setReplyForm((c) => ({ ...c, shortcut: e.target.value }))} className="border border-[#2D2E2E] bg-transparent px-4 py-3" placeholder="/atalho" />
                    <input value={replyForm.category} onChange={(e) => setReplyForm((c) => ({ ...c, category: e.target.value }))} className="border border-[#2D2E2E] bg-transparent px-4 py-3" placeholder="Categoria" />
                    <input value={replyForm.status} onChange={(e) => setReplyForm((c) => ({ ...c, status: e.target.value }))} className="border border-[#2D2E2E] bg-transparent px-4 py-3" placeholder="Status" />
                    <textarea value={replyForm.body} onChange={(e) => setReplyForm((c) => ({ ...c, body: e.target.value }))} className="min-h-[100px] border border-[#2D2E2E] bg-transparent px-4 py-3 md:col-span-2" placeholder="Texto da resposta" />
                    <div className="md:col-span-2">
                      <button type="button" onClick={saveQuickReply} className="border border-[#C5A059] px-4 py-3 text-sm">Salvar resposta rapida</button>
                      <SaveState state={replyState} />
                    </div>
                  </div>
                  <div className="mt-6 space-y-3 text-sm opacity-75">
                    {quickReplies.map((item) => (
                      <div key={item.id} className="border border-[#2D2E2E] p-4">
                        <p className="font-semibold">{item.title}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.15em] opacity-50">{item.category} | {item.shortcut}</p>
                        <p className="mt-2">{item.body}</p>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel title={`Intents (${intents.length})`}>
                  <div className="grid gap-4">
                    <input value={intentForm.label} onChange={(e) => setIntentForm((c) => ({ ...c, label: e.target.value }))} className="border border-[#2D2E2E] bg-transparent px-4 py-3" placeholder="Rotulo da intent" />
                    <textarea value={intentForm.examples} onChange={(e) => setIntentForm((c) => ({ ...c, examples: e.target.value }))} className="min-h-[100px] border border-[#2D2E2E] bg-transparent px-4 py-3" placeholder="Um exemplo por linha" />
                    <textarea value={intentForm.policy} onChange={(e) => setIntentForm((c) => ({ ...c, policy: e.target.value }))} className="min-h-[90px] border border-[#2D2E2E] bg-transparent px-4 py-3" placeholder="Politica operacional da intent" />
                    <input value={intentForm.status} onChange={(e) => setIntentForm((c) => ({ ...c, status: e.target.value }))} className="border border-[#2D2E2E] bg-transparent px-4 py-3" placeholder="Status" />
                    <div>
                      <button type="button" onClick={saveIntent} className="border border-[#C5A059] px-4 py-3 text-sm">Salvar intent</button>
                      <SaveState state={intentState} />
                    </div>
                  </div>
                  <div className="mt-6 space-y-3 text-sm opacity-75">
                    {intents.map((item) => (
                      <div key={item.id} className="border border-[#2D2E2E] p-4">
                        <p className="font-semibold">{item.label}</p>
                        <p className="mt-2">{item.policy}</p>
                        <p className="mt-2 text-xs opacity-50">{(item.examples || []).join(" | ")}</p>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <Panel title={`Fontes de conhecimento (${knowledgeSources.length})`}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <input value={knowledgeForm.title} onChange={(e) => setKnowledgeForm((c) => ({ ...c, title: e.target.value }))} className="border border-[#2D2E2E] bg-transparent px-4 py-3" placeholder="Titulo" />
                    <input value={knowledgeForm.source_type} onChange={(e) => setKnowledgeForm((c) => ({ ...c, source_type: e.target.value }))} className="border border-[#2D2E2E] bg-transparent px-4 py-3" placeholder="faq, url, pdf..." />
                    <input value={knowledgeForm.status} onChange={(e) => setKnowledgeForm((c) => ({ ...c, status: e.target.value }))} className="border border-[#2D2E2E] bg-transparent px-4 py-3" placeholder="Status" />
                    <div />
                    <textarea value={knowledgeForm.notes} onChange={(e) => setKnowledgeForm((c) => ({ ...c, notes: e.target.value }))} className="min-h-[100px] border border-[#2D2E2E] bg-transparent px-4 py-3 md:col-span-2" placeholder="Notas, URL, ownership, restricoes eticas..." />
                    <div className="md:col-span-2">
                      <button type="button" onClick={saveKnowledgeSource} className="border border-[#C5A059] px-4 py-3 text-sm">Salvar fonte</button>
                      <SaveState state={knowledgeState} />
                    </div>
                  </div>
                  <div className="mt-6 space-y-3 text-sm opacity-75">
                    {knowledgeSources.map((item) => (
                      <div key={item.id} className="border border-[#2D2E2E] p-4">
                        <p className="font-semibold">{item.title}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.15em] opacity-50">{item.source_type} | {item.status}</p>
                        <p className="mt-2">{item.notes}</p>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel title={`Workflow library (${workflowLibrary.length})`}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <input value={workflowForm.title} onChange={(e) => setWorkflowForm((c) => ({ ...c, title: e.target.value }))} className="border border-[#2D2E2E] bg-transparent px-4 py-3" placeholder="Titulo do item" />
                    <input value={workflowForm.type} onChange={(e) => setWorkflowForm((c) => ({ ...c, type: e.target.value }))} className="border border-[#2D2E2E] bg-transparent px-4 py-3" placeholder="workflow, handoff_first..." />
                    <input value={workflowForm.status} onChange={(e) => setWorkflowForm((c) => ({ ...c, status: e.target.value }))} className="border border-[#2D2E2E] bg-transparent px-4 py-3" placeholder="Status" />
                    <div />
                    <textarea value={workflowForm.notes} onChange={(e) => setWorkflowForm((c) => ({ ...c, notes: e.target.value }))} className="min-h-[100px] border border-[#2D2E2E] bg-transparent px-4 py-3 md:col-span-2" placeholder="Descricao operacional do workflow" />
                    <div className="md:col-span-2">
                      <button type="button" onClick={saveWorkflowLibraryItem} className="border border-[#C5A059] px-4 py-3 text-sm">Salvar item</button>
                      <SaveState state={workflowState} />
                    </div>
                  </div>
                  <div className="mt-6 space-y-3 text-sm opacity-75">
                    {workflowLibrary.map((item) => (
                      <div key={item.id} className="border border-[#2D2E2E] p-4">
                        <p className="font-semibold">{item.title}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.15em] opacity-50">{item.type} | {item.status}</p>
                        <p className="mt-2">{item.notes}</p>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>

              <Panel title={`Playbooks de handoff (${handoffPlaybooks.length})`}>
                <div className="space-y-4 text-sm opacity-75">
                  {handoffPlaybooks.map((item) => (
                    <div key={item.id} className="border border-[#2D2E2E] p-4">
                      <p className="font-semibold">{item.trigger}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.15em] opacity-50">
                        Destino: {item.destination}
                      </p>
                      <p className="mt-2">{item.summary}</p>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          )}
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}
