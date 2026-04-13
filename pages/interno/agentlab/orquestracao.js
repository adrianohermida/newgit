import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import InternoLayout from "../../../components/interno/InternoLayout";
import { useInternalTheme } from "../../../components/interno/InternalThemeProvider";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import AgentLabModuleNav from "../../../components/interno/agentlab/AgentLabModuleNav";
import { adminFetch } from "../../../lib/admin/api";
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

function SaveState({ state }) {
  const { isLightTheme } = useInternalTheme();
  if (!state) return null;
  if (state.error) return <p className="mt-3 text-sm text-red-300">{state.error}</p>;
  if (state.success) return <p className={`mt-3 text-sm ${isLightTheme ? "text-emerald-700" : "text-emerald-400"}`}>{state.success}</p>;
  return null;
}

function parseCopilotContext(rawValue) {
  if (!rawValue) return null;
  try {
    return JSON.parse(String(rawValue));
  } catch {
    return null;
  }
}

export default function AgentLabOrquestracaoPage() {
  const router = useRouter();
  const state = useAgentLabData();
  const [selectedAgent, setSelectedAgent] = useState("dotobot-chatbot");
  const copilotContext = parseCopilotContext(typeof router.query.copilotContext === "string" ? router.query.copilotContext : "");
  const copilotAgentSeedAppliedRef = useRef(false);
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
    if (copilotAgentSeedAppliedRef.current) return;
    const mission = String(copilotContext?.mission || "").toLowerCase();
    if (!mission) return;
    if (mission.match(/workflow|intent|orquestra|playbook|agent/)) {
      copilotAgentSeedAppliedRef.current = true;
      setSelectedAgent("dotobot-ai");
    }
  }, [copilotContext]);

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
          <OrquestracaoContent
            state={state}
            selectedAgent={selectedAgent}
            setSelectedAgent={setSelectedAgent}
            selectedCatalogItem={selectedCatalogItem}
            agents={agents}
            quickReplies={quickReplies}
            intents={intents}
            knowledgeSources={knowledgeSources}
            workflowLibrary={workflowLibrary}
            handoffPlaybooks={handoffPlaybooks}
            replyForm={replyForm}
            setReplyForm={setReplyForm}
            intentForm={intentForm}
            setIntentForm={setIntentForm}
            knowledgeForm={knowledgeForm}
            setKnowledgeForm={setKnowledgeForm}
            workflowForm={workflowForm}
            setWorkflowForm={setWorkflowForm}
            replyState={replyState}
            intentState={intentState}
            knowledgeState={knowledgeState}
            workflowState={workflowState}
            saveQuickReply={saveQuickReply}
            saveIntent={saveIntent}
            saveKnowledgeSource={saveKnowledgeSource}
            saveWorkflowLibraryItem={saveWorkflowLibraryItem}
            copilotContext={copilotContext}
          />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

function OrquestracaoContent(props) {
  const { isLightTheme } = useInternalTheme();
  const {
    state,
    selectedAgent,
    setSelectedAgent,
    selectedCatalogItem,
    agents,
    quickReplies,
    intents,
    knowledgeSources,
    workflowLibrary,
    handoffPlaybooks,
    replyForm,
    setReplyForm,
    intentForm,
    setIntentForm,
    knowledgeForm,
    setKnowledgeForm,
    workflowForm,
    setWorkflowForm,
    replyState,
    intentState,
    knowledgeState,
    workflowState,
    saveQuickReply,
    saveIntent,
    saveKnowledgeSource,
    saveWorkflowLibraryItem,
    copilotContext,
  } = props;

  if (state.loading) {
    return <div className={`border p-6 ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#4b5563]" : "border-[#2D2E2E] bg-[rgba(13,15,14,0.96)]"}`}>Carregando experimentos...</div>;
  }

  if (state.error) {
    return <div className="border border-[#7f1d1d] bg-[rgba(127,29,29,0.22)] p-6 text-sm">{state.error}</div>;
  }

  const muted = isLightTheme ? "text-[#4b5563]" : "opacity-75";
  const subtle = isLightTheme ? "text-[#6b7280]" : "opacity-50";
  const boxTone = isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937]" : "border-[#2D2E2E]";
  const inputTone = isLightTheme
    ? "border-[#d7d4cb] bg-white text-[#1f2937] focus:border-[#9a6d14]"
    : "border-[#2D2E2E] bg-transparent focus:border-[#C5A059]";

  return (
    <div className="space-y-8">
      {copilotContext ? (
        <Panel title="Contexto vindo do Copilot">
          <div className={`space-y-2 text-sm ${muted}`}>
            <p className="font-semibold">{copilotContext.conversationTitle || "Conversa ativa"}</p>
            {copilotContext.mission ? <p>{copilotContext.mission}</p> : null}
            <p>Use esta trilha para revisar intents, playbooks, workflow library e governanca do agente.</p>
          </div>
        </Panel>
      ) : null}

      <Panel title="Escopo de experimentos">
        <div className="grid gap-4 md:grid-cols-[260px_1fr]">
          <label className="block">
            <span className={`mb-2 block text-xs font-semibold uppercase tracking-[0.15em] ${subtle}`}>Agente</span>
            <select
              value={selectedAgent}
              onChange={(event) => setSelectedAgent(event.target.value)}
              className={`w-full border px-4 py-3 outline-none transition ${inputTone}`}
            >
              {agents.map((item) => (
                <option key={item.id} value={item.agent_slug || item.agent_ref}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <div className={`border p-4 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#4b5563]" : "border-[#2D2E2E] opacity-75"}`}>
            <p className="font-semibold">{selectedCatalogItem?.name || "Agente"}</p>
            <p className="mt-2">
              Tipo: {selectedCatalogItem?.agent_kind || "agent"} | Canal principal: {selectedCatalogItem?.primary_channel || "n/a"}
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
            <input value={replyForm.title} onChange={(e) => setReplyForm((c) => ({ ...c, title: e.target.value }))} className={`border px-4 py-3 outline-none transition ${inputTone}`} placeholder="Titulo" />
            <input value={replyForm.shortcut} onChange={(e) => setReplyForm((c) => ({ ...c, shortcut: e.target.value }))} className={`border px-4 py-3 outline-none transition ${inputTone}`} placeholder="/atalho" />
            <input value={replyForm.category} onChange={(e) => setReplyForm((c) => ({ ...c, category: e.target.value }))} className={`border px-4 py-3 outline-none transition ${inputTone}`} placeholder="Categoria" />
            <input value={replyForm.status} onChange={(e) => setReplyForm((c) => ({ ...c, status: e.target.value }))} className={`border px-4 py-3 outline-none transition ${inputTone}`} placeholder="Status" />
            <textarea value={replyForm.body} onChange={(e) => setReplyForm((c) => ({ ...c, body: e.target.value }))} className={`min-h-[100px] border px-4 py-3 outline-none transition md:col-span-2 ${inputTone}`} placeholder="Texto da resposta" />
            <div className="md:col-span-2">
              <button type="button" onClick={saveQuickReply} className={`border px-4 py-3 text-sm transition ${isLightTheme ? "border-[#9a6d14] text-[#9a6d14] hover:bg-[#9a6d14] hover:text-white" : "border-[#C5A059]"}`}>Salvar resposta rapida</button>
              <SaveState state={replyState} />
            </div>
          </div>
          <div className={`mt-6 space-y-3 text-sm ${muted}`}>
            {quickReplies.map((item) => (
              <div key={item.id} className={`border p-4 ${boxTone}`}>
                <p className="font-semibold">{item.title}</p>
                <p className={`mt-1 text-xs uppercase tracking-[0.15em] ${subtle}`}>{item.category} | {item.shortcut}</p>
                <p className="mt-2">{item.body}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title={`Intents (${intents.length})`}>
          <div className="grid gap-4">
            <input value={intentForm.label} onChange={(e) => setIntentForm((c) => ({ ...c, label: e.target.value }))} className={`border px-4 py-3 outline-none transition ${inputTone}`} placeholder="Rotulo da intent" />
            <textarea value={intentForm.examples} onChange={(e) => setIntentForm((c) => ({ ...c, examples: e.target.value }))} className={`min-h-[100px] border px-4 py-3 outline-none transition ${inputTone}`} placeholder="Um exemplo por linha" />
            <textarea value={intentForm.policy} onChange={(e) => setIntentForm((c) => ({ ...c, policy: e.target.value }))} className={`min-h-[90px] border px-4 py-3 outline-none transition ${inputTone}`} placeholder="Politica operacional da intent" />
            <input value={intentForm.status} onChange={(e) => setIntentForm((c) => ({ ...c, status: e.target.value }))} className={`border px-4 py-3 outline-none transition ${inputTone}`} placeholder="Status" />
            <div>
              <button type="button" onClick={saveIntent} className={`border px-4 py-3 text-sm transition ${isLightTheme ? "border-[#9a6d14] text-[#9a6d14] hover:bg-[#9a6d14] hover:text-white" : "border-[#C5A059]"}`}>Salvar intent</button>
              <SaveState state={intentState} />
            </div>
          </div>
          <div className={`mt-6 space-y-3 text-sm ${muted}`}>
            {intents.map((item) => (
              <div key={item.id} className={`border p-4 ${boxTone}`}>
                <p className="font-semibold">{item.label}</p>
                <p className="mt-2">{item.policy}</p>
                <p className={`mt-2 text-xs ${subtle}`}>{(item.examples || []).join(" | ")}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title={`Fontes de conhecimento (${knowledgeSources.length})`}>
          <div className="grid gap-4 md:grid-cols-2">
            <input value={knowledgeForm.title} onChange={(e) => setKnowledgeForm((c) => ({ ...c, title: e.target.value }))} className={`border px-4 py-3 outline-none transition ${inputTone}`} placeholder="Titulo" />
            <input value={knowledgeForm.source_type} onChange={(e) => setKnowledgeForm((c) => ({ ...c, source_type: e.target.value }))} className={`border px-4 py-3 outline-none transition ${inputTone}`} placeholder="faq, url, pdf..." />
            <input value={knowledgeForm.status} onChange={(e) => setKnowledgeForm((c) => ({ ...c, status: e.target.value }))} className={`border px-4 py-3 outline-none transition ${inputTone}`} placeholder="Status" />
            <div />
            <textarea value={knowledgeForm.notes} onChange={(e) => setKnowledgeForm((c) => ({ ...c, notes: e.target.value }))} className={`min-h-[100px] border px-4 py-3 outline-none transition md:col-span-2 ${inputTone}`} placeholder="Notas, URL, ownership, restricoes eticas..." />
            <div className="md:col-span-2">
              <button type="button" onClick={saveKnowledgeSource} className={`border px-4 py-3 text-sm transition ${isLightTheme ? "border-[#9a6d14] text-[#9a6d14] hover:bg-[#9a6d14] hover:text-white" : "border-[#C5A059]"}`}>Salvar fonte</button>
              <SaveState state={knowledgeState} />
            </div>
          </div>
          <div className={`mt-6 space-y-3 text-sm ${muted}`}>
            {knowledgeSources.map((item) => (
              <div key={item.id} className={`border p-4 ${boxTone}`}>
                <p className="font-semibold">{item.title}</p>
                <p className={`mt-1 text-xs uppercase tracking-[0.15em] ${subtle}`}>{item.source_type} | {item.status}</p>
                <p className="mt-2">{item.notes}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title={`Workflow library (${workflowLibrary.length})`}>
          <div className="grid gap-4 md:grid-cols-2">
            <input value={workflowForm.title} onChange={(e) => setWorkflowForm((c) => ({ ...c, title: e.target.value }))} className={`border px-4 py-3 outline-none transition ${inputTone}`} placeholder="Titulo do item" />
            <input value={workflowForm.type} onChange={(e) => setWorkflowForm((c) => ({ ...c, type: e.target.value }))} className={`border px-4 py-3 outline-none transition ${inputTone}`} placeholder="workflow, handoff_first..." />
            <input value={workflowForm.status} onChange={(e) => setWorkflowForm((c) => ({ ...c, status: e.target.value }))} className={`border px-4 py-3 outline-none transition ${inputTone}`} placeholder="Status" />
            <div />
            <textarea value={workflowForm.notes} onChange={(e) => setWorkflowForm((c) => ({ ...c, notes: e.target.value }))} className={`min-h-[100px] border px-4 py-3 outline-none transition md:col-span-2 ${inputTone}`} placeholder="Descricao operacional do workflow" />
            <div className="md:col-span-2">
              <button type="button" onClick={saveWorkflowLibraryItem} className={`border px-4 py-3 text-sm transition ${isLightTheme ? "border-[#9a6d14] text-[#9a6d14] hover:bg-[#9a6d14] hover:text-white" : "border-[#C5A059]"}`}>Salvar item</button>
              <SaveState state={workflowState} />
            </div>
          </div>
          <div className={`mt-6 space-y-3 text-sm ${muted}`}>
            {workflowLibrary.map((item) => (
              <div key={item.id} className={`border p-4 ${boxTone}`}>
                <p className="font-semibold">{item.title}</p>
                <p className={`mt-1 text-xs uppercase tracking-[0.15em] ${subtle}`}>{item.type} | {item.status}</p>
                <p className="mt-2">{item.notes}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title={`Playbooks de handoff (${handoffPlaybooks.length})`}>
        <div className={`space-y-4 text-sm ${muted}`}>
          {handoffPlaybooks.map((item) => (
            <div key={item.id} className={`border p-4 ${boxTone}`}>
              <p className="font-semibold">{item.trigger}</p>
              <p className={`mt-1 text-xs uppercase tracking-[0.15em] ${subtle}`}>Destino: {item.destination}</p>
              <p className="mt-2">{item.summary}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
