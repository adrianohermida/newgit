import { useEffect, useMemo, useState } from "react";
import InternoLayout from "../../../components/interno/InternoLayout";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import AgentLabModuleNav from "../../../components/interno/agentlab/AgentLabModuleNav";
import { adminFetch } from "../../../lib/admin/api";
import { useAgentLabData } from "../../../lib/agentlab/useAgentLabData";
<<<<<<< HEAD
import { setModuleHistory } from "../../../lib/admin/activity-log";
import { buildModuleSnapshot } from "../../../lib/admin/module-registry";

function Panel({ title, children }) {
  return (
    <section className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
      <h3 className="mb-4 font-serif text-2xl">{title}</h3>
      {children}
=======

function LoadingBlock({ children }) {
  return <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6 text-sm">{children}</div>;
}

function Metric({ label, value, helper }) {
  return (
    <div className="border border-[#2D2E2E] bg-[linear-gradient(180deg,rgba(18,20,19,0.98),rgba(10,12,11,0.98))] p-5">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] opacity-45">{label}</p>
      <p className="font-serif text-4xl leading-none">{value}</p>
      <p className="mt-3 text-sm leading-relaxed opacity-60">{helper}</p>
    </div>
  );
}

function Meta({ label, value }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.18em] opacity-45">{label}</p>
      <p className="mt-1 break-all opacity-75">{value}</p>
    </div>
  );
}

function Panel({ title, description, items }) {
  return (
    <section className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
      <h3 className="font-serif text-3xl">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed opacity-60">{description}</p>
      <div className="mt-5 space-y-3 text-sm opacity-70">
        {items.map((item) => (
          <div key={item} className="border-t border-[#202321] pt-3 first:border-t-0 first:pt-0">
            {item}
          </div>
        ))}
      </div>
>>>>>>> codex/hmadv-tpu-fase53
    </section>
  );
}

<<<<<<< HEAD
export default function AgentLabAgentsPage() {
  const state = useAgentLabData();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [queueMessage, setQueueMessage] = useState(null);
  const [quickReplyMessage, setQuickReplyMessage] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState("dotobot-chatbot");
=======
function normalizeForm(profile, fallbackAgent) {
  return {
    agentRef: profile?.agent_ref || fallbackAgent?.slug || "dotobot-ai",
    agentName: profile?.agent_name || fallbackAgent?.name || "DotoBot AI",
    ownerName: profile?.owner_name || "AgentLab",
    businessGoal: profile?.business_goal || "",
    personaPrompt: profile?.persona_prompt || "",
    responsePolicy: profile?.response_policy || "",
    knowledgeStrategy: Array.isArray(profile?.knowledge_strategy) ? profile.knowledge_strategy.join(", ") : "",
    workflowStrategy: Array.isArray(profile?.workflow_strategy) ? profile.workflow_strategy.join(", ") : "",
    handoffRules: Array.isArray(profile?.handoff_rules) ? profile.handoff_rules.join(", ") : "",
    status: profile?.status || "active",
  };
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] uppercase tracking-[0.18em] opacity-45">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full border border-[#2D2E2E] bg-[#0B0D0C] px-3 py-3 text-sm outline-none transition-colors focus:border-[#C5A059]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextField({ label, value, onChange, multiline = false, rows = 4, placeholder = "" }) {
  const Component = multiline ? "textarea" : "input";
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] uppercase tracking-[0.18em] opacity-45">{label}</span>
      <Component
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={multiline ? rows : undefined}
        placeholder={placeholder}
        className="w-full border border-[#2D2E2E] bg-[#0B0D0C] px-3 py-3 text-sm outline-none transition-colors focus:border-[#C5A059]"
      />
    </label>
  );
}

export default function AgentLabAgentsPage() {
  const state = useAgentLabData();
>>>>>>> codex/hmadv-tpu-fase53

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
<<<<<<< HEAD
          title="AgentLab | Agentes"
          description="Centro de projeto dos agentes, com perfil, voz, escopo de conhecimento, handoff e fila de evolucao continua."
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
            selectedAgent={selectedAgent}
            setSelectedAgent={setSelectedAgent}
          />
=======
          title="AgentLab Agents"
          description="Catalogo operacional dos agentes conectados ao workspace, com foco em ownership, configuracao, treinamento e gaps para rollout no Freddy."
        >
          <AgentLabModuleNav />
          <AgentsContent state={state} />
>>>>>>> codex/hmadv-tpu-fase53
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

<<<<<<< HEAD
function AgentsContent({
  state,
  saving,
  setSaving,
  message,
  setMessage,
  queueMessage,
  setQueueMessage,
  quickReplyMessage,
  setQuickReplyMessage,
  selectedAgent,
  setSelectedAgent,
}) {
  const catalog = state.data?.agents || [];
  const profiles = state.data?.governance?.profiles || [];
  const queue = state.data?.governance?.queue || [];
  const quickReplies = state.data?.governance?.quickReplies || [];
  const handoffPlaybooks = state.data?.governance?.handoffPlaybooks || [];

  const selectedProfile = useMemo(
    () => profiles.find((item) => item.agent_ref === selectedAgent) || null,
    [profiles, selectedAgent]
  );
  const selectedCatalogItem = useMemo(
    () => catalog.find((item) => (item.agent_slug || item.agent_ref) === selectedAgent) || null,
    [catalog, selectedAgent]
  );
  const visibleQueue = queue.filter((item) => item.agent_ref === selectedAgent);
  const visibleQuickReplies = quickReplies.filter((item) => item.agent_ref === selectedAgent);
  const visiblePlaybooks = handoffPlaybooks.filter(
    (item) => !item.agent_ref || item.agent_ref === selectedAgent
  );

  const [form, setForm] = useState(null);
  const [quickReplyForm, setQuickReplyForm] = useState({
    category: "financeiro",
    title: "",
    shortcut: "",
    body: "",
    status: "active",
  });

  useEffect(() => {
    if (!selectedProfile) {
      setForm(null);
      return;
    }
    setForm({
      id: selectedProfile.id,
      business_goal: selectedProfile.business_goal || "",
      persona_prompt: selectedProfile.persona_prompt || "",
      response_policy: selectedProfile.response_policy || "",
      knowledge_strategy: (selectedProfile.knowledge_strategy || []).join("\n"),
      workflow_strategy: (selectedProfile.workflow_strategy || []).join("\n"),
      handoff_rules: (selectedProfile.handoff_rules || []).join("\n"),
    });
  }, [selectedProfile]);

  if (state.loading) {
    return (
      <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
        Carregando agentes...
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="border border-[#7f1d1d] bg-[rgba(127,29,29,0.22)] p-6 text-sm">
        {state.error}
      </div>
    );
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
          knowledge_strategy: form.knowledge_strategy
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean),
          workflow_strategy: form.workflow_strategy
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean),
          handoff_rules: form.handoff_rules
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean),
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
          agent_ref: selectedAgent,
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

  useEffect(() => {
    setModuleHistory(
      "agentlab-agents",
      buildModuleSnapshot("agentlab", {
        routePath: "/interno/agentlab/agents",
        loading: state.loading,
        error: state.error,
        section: "agents",
        selectedAgent,
        catalogCount: catalog.length,
        profileLoaded: Boolean(selectedProfile),
        queueCount: visibleQueue.length,
        quickRepliesCount: visibleQuickReplies.length,
        playbooksCount: visiblePlaybooks.length,
        saving,
        coverage: {
          routeTracked: true,
          consoleIntegrated: true,
          actionsTracked: true,
        },
      }),
    );
  }, [
    catalog.length,
    saving,
    selectedAgent,
    selectedProfile,
    state.error,
    state.loading,
    visiblePlaybooks.length,
    visibleQueue.length,
    visibleQuickReplies.length,
  ]);

  return (
    <div className="space-y-8">
      <Panel title="Escopo do agente">
        <div className="grid gap-4 md:grid-cols-[260px_1fr]">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em]">
              Agente
            </span>
            <select
              value={selectedAgent}
              onChange={(event) => setSelectedAgent(event.target.value)}
              className="w-full border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
            >
              {catalog.map((item) => (
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

      <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
        <Panel title="Perfil principal do agente">
          {message ? <div className="mb-4 text-sm opacity-75">{message}</div> : null}
          {!form ? (
            <p className="text-sm opacity-70">Nenhum perfil carregado. Selecione um agente para editar sua voz e seu escopo.</p>
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
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em]">
                    {label}
                  </span>
                  <textarea
                    value={form[key]}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, [key]: event.target.value }))
                    }
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
                  <span>{item.agent_kind || "agent"}</span>
                </div>
                <p className="font-semibold">{item.name}</p>
                {item.profile?.business_goal ? (
                  <p className="mt-2 opacity-75">{item.profile.business_goal}</p>
                ) : null}
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Respostas rapidas prioritarias">
          {quickReplyMessage ? <div className="mb-4 text-sm opacity-75">{quickReplyMessage}</div> : null}
          <div className="mb-6 grid gap-4 md:grid-cols-2">
            <input
              value={quickReplyForm.title}
              onChange={(event) =>
                setQuickReplyForm((current) => ({ ...current, title: event.target.value }))
              }
              className="border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
              placeholder="Titulo da resposta rapida"
            />
            <input
              value={quickReplyForm.shortcut}
              onChange={(event) =>
                setQuickReplyForm((current) => ({ ...current, shortcut: event.target.value }))
              }
              className="border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
              placeholder="/atalho"
            />
            <input
              value={quickReplyForm.category}
              onChange={(event) =>
                setQuickReplyForm((current) => ({ ...current, category: event.target.value }))
              }
              className="border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
              placeholder="Categoria"
            />
            <input
              value={quickReplyForm.status}
              onChange={(event) =>
                setQuickReplyForm((current) => ({ ...current, status: event.target.value }))
              }
              className="border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
              placeholder="Status"
            />
            <textarea
              value={quickReplyForm.body}
              onChange={(event) =>
                setQuickReplyForm((current) => ({ ...current, body: event.target.value }))
              }
              className="min-h-[100px] border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059] md:col-span-2"
              placeholder="Texto da resposta"
            />
            <div className="md:col-span-2">
              <button
                type="button"
                onClick={handleSaveQuickReply}
                className="border border-[#C5A059] px-4 py-3 text-sm"
              >
                Salvar resposta rapida
              </button>
            </div>
          </div>
          <div className="space-y-4 text-sm opacity-75">
            {visibleQuickReplies.map((item) => (
              <div key={item.id} className="border border-[#2D2E2E] p-4">
                <div className="mb-2 flex flex-wrap gap-3 text-xs uppercase tracking-[0.15em] opacity-50">
                  <span>{item.category}</span>
                  <span>{item.shortcut}</span>
                  <span>{item.status}</span>
                </div>
                <p className="mb-2 font-semibold">{item.title}</p>
                <p>{item.body}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Playbooks de handoff">
          <div className="space-y-4 text-sm opacity-75">
            {visiblePlaybooks.map((item) => (
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
          {visibleQueue.map((item) => (
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
                <button
                  type="button"
                  onClick={() => updateQueue(item, { status: "doing" })}
                  className="border border-[#2D2E2E] px-3 py-2 text-xs"
                >
                  Mover para doing
                </button>
                <button
                  type="button"
                  onClick={() => updateQueue(item, { status: "done" })}
                  className="border border-[#2D2E2E] px-3 py-2 text-xs"
                >
                  Marcar done
                </button>
                <button
                  type="button"
                  onClick={() => updateQueue(item, { priority: "alta" })}
                  className="border border-[#2D2E2E] px-3 py-2 text-xs"
                >
                  Prioridade alta
                </button>
              </div>
            </div>
          ))}
        </div>
      </Panel>
=======
function AgentsContent({ state }) {
  const agents = state.data?.agents || [];
  const planning = state.data?.planning || {};
  const governanceProfiles = state.data?.governance?.profiles || [];
  const queueItems = state.data?.governance?.queue || [];

  const [profiles, setProfiles] = useState(governanceProfiles);
  const [queue, setQueue] = useState(queueItems);
  const [selectedAgentRef, setSelectedAgentRef] = useState("");
  const [form, setForm] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [queueSavingId, setQueueSavingId] = useState(null);
  const [flashMessage, setFlashMessage] = useState("");
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    setProfiles(governanceProfiles);
  }, [governanceProfiles]);

  useEffect(() => {
    setQueue(queueItems);
  }, [queueItems]);

  const agentOptions = useMemo(() => {
    return agents.map((agent) => ({
      value: agent.slug || agent.name,
      label: agent.name,
      agent,
    }));
  }, [agents]);

  const defaultAgentRef = selectedAgentRef || profiles[0]?.agent_ref || agentOptions[0]?.value || "dotobot-ai";

  useEffect(() => {
    if (!selectedAgentRef && defaultAgentRef) {
      setSelectedAgentRef(defaultAgentRef);
    }
  }, [defaultAgentRef, selectedAgentRef]);

  useEffect(() => {
    const currentProfile = profiles.find((item) => item.agent_ref === defaultAgentRef) || null;
    const fallbackAgent = agentOptions.find((item) => item.value === defaultAgentRef)?.agent || null;
    setForm(normalizeForm(currentProfile, fallbackAgent));
  }, [defaultAgentRef, profiles, agentOptions]);

  if (state.loading) {
    return <LoadingBlock>Carregando catalogo de agentes...</LoadingBlock>;
  }

  if (state.error) {
    return <LoadingBlock>{state.error}</LoadingBlock>;
  }

  const activeAgents = agents.filter((agent) => agent.active);
  const selectedAgent = agentOptions.find((item) => item.value === defaultAgentRef)?.agent || null;
  const selectedQueue = queue.filter((item) => item.agent_ref === defaultAgentRef);

  async function saveProfile() {
    if (!form) return;

    setSavingProfile(true);
    setLocalError("");
    setFlashMessage("");

    try {
      const payload = await adminFetch("/api/admin-agentlab-governance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "update_profile",
          ...form,
          settings: {
            collect_user_details: true,
            collect_progressively: true,
            target_channel_mix: ["freshchat", "crm", "whatsapp-fallback"],
          },
          metrics: {
            target_pass_rate: 85,
            target_handoff_quality: 90,
          },
        }),
      });

      const nextProfiles = [payload.profile, ...profiles.filter((item) => item.agent_ref !== payload.profile.agent_ref)];
      setProfiles(nextProfiles);
      setFlashMessage("Perfil do agente atualizado. Agora o AgentLab tem uma estrategia editavel para persona, conhecimento, workflow e handoff.");
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Falha ao salvar o perfil do agente.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function updateQueueItem(item, patch) {
    setQueueSavingId(item.id);
    setLocalError("");
    setFlashMessage("");

    try {
      const payload = await adminFetch("/api/admin-agentlab-governance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "update_queue_item",
          id: item.id,
          ...patch,
        }),
      });

      setQueue((current) => current.map((entry) => (entry.id === payload.item.id ? { ...entry, ...payload.item } : entry)));
      setFlashMessage("Fila viva atualizada. O time pode usar o AgentLab como cockpit de sprint real.");
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Falha ao atualizar a fila viva.");
    } finally {
      setQueueSavingId(null);
    }
  }

  return (
    <div className="space-y-8">
      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="Agentes catalogados" value={agents.length} helper="Base interna para governanca, treinamento e rollout por ownership." />
        <Metric label="Agentes ativos" value={activeAgents.length} helper="Ja aptos a receber tuning, scorecards e telemetria." />
        <Metric label="Perfis configurados" value={profiles.length} helper="Agentes com persona, estrategia e regras persistidas no AgentLab." />
        <Metric label="Fila viva" value={queue.length} helper="Melhorias em aberto que aumentam utilidade, seguranca e conversao." />
      </section>

      {flashMessage ? (
        <section className="border border-[#355E3B] bg-[rgba(28,63,36,0.25)] p-5 text-sm text-[#CDE7D1]">{flashMessage}</section>
      ) : null}

      {localError ? (
        <section className="border border-[#6E5630] bg-[rgba(76,57,26,0.22)] p-5 text-sm text-[#F2DEB5]">{localError}</section>
      ) : null}

      <section className="grid gap-8 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-4">
          {agents.map((agent) => (
            <article key={agent.id} className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <span className={`border px-3 py-1 text-[10px] uppercase tracking-[0.18em] ${agent.active ? "border-[#355E3B] text-[#CDE7D1]" : "border-[#6E5630] text-[#F2DEB5]"}`}>
                  {agent.status}
                </span>
                <span className="text-[10px] uppercase tracking-[0.18em] opacity-45">{agent.type}</span>
              </div>

              <h3 className="font-serif text-3xl">{agent.name}</h3>
              <p className="mt-2 text-sm leading-relaxed opacity-60">
                {agent.description || "Agente mapeado no workspace interno, pronto para ganhar persona, knowledge packs, workflows criticos e trilhas de treino."}
              </p>

              <div className="mt-5 grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-3">
                <Meta label="Slug" value={agent.slug || "Nao definido"} />
                <Meta label="Provider" value={agent.provider_id || "Nao definido"} />
                <Meta label="Capacidades" value={String(agent.capabilities_count || 0)} />
                <Meta label="Uso" value={String(agent.usage_count || 0)} />
                <Meta label="Workspace" value={agent.workspace_id || "Nao identificado"} />
                <Meta label="Ultima atualizacao" value={agent.updated_at || "Sem data"} />
              </div>
            </article>
          ))}
        </div>

        <div className="space-y-8">
          <Panel
            title="Padrao de configuracao"
            description="Todo agente de alta performance no escritorio precisa sair daqui com esse pacote minimo de operacao."
            items={[
              "Persona curta, segura, comercial e juridicamente responsavel",
              "Knowledge packs por tema e intencao, nao por FAQ monolitico",
              "Workflow strategy alinhada com Freshsales, atendimento e financeiro",
              "Handoff rules claras para processo sensivel, reclamacao, agendamento e pagamento",
            ]}
          />

          <Panel
            title="Critérios de performance"
            description="O foco nao e parecer inteligente. O foco e resolver melhor, com seguranca e proximo passo util."
            items={[
              "Responder com clareza e baixo atrito",
              "Nao inventar andamento, documento ou promessa juridica",
              "Qualificar melhor o lead antes do handoff",
              "Transferir com contexto quando a IA nao deve insistir",
            ]}
          />
        </div>
      </section>

      <section className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="font-serif text-3xl">Configurar agente</h3>
              <p className="mt-2 text-sm leading-relaxed opacity-60">
                Essa camada vira o centro de treinamento do agente: prompt, estrategia de conhecimento, estrategia de workflow e regras de handoff.
              </p>
            </div>
            <div className="min-w-[220px]">
              <SelectField
                label="Agente"
                value={defaultAgentRef}
                onChange={setSelectedAgentRef}
                options={agentOptions.map((item) => ({ value: item.value, label: item.label }))}
              />
            </div>
          </div>

          {form ? (
            <div className="mt-6 grid gap-5">
              <div className="grid gap-5 md:grid-cols-2">
                <TextField label="Agent ref" value={form.agentRef} onChange={(value) => setForm((current) => ({ ...current, agentRef: value }))} />
                <TextField label="Nome do agente" value={form.agentName} onChange={(value) => setForm((current) => ({ ...current, agentName: value }))} />
                <TextField label="Owner" value={form.ownerName} onChange={(value) => setForm((current) => ({ ...current, ownerName: value }))} />
                <SelectField
                  label="Status"
                  value={form.status}
                  onChange={(value) => setForm((current) => ({ ...current, status: value }))}
                  options={[
                    { value: "active", label: "Ativo" },
                    { value: "paused", label: "Pausado" },
                    { value: "draft", label: "Rascunho" },
                  ]}
                />
              </div>

              <TextField
                label="Business goal"
                multiline
                rows={3}
                value={form.businessGoal}
                onChange={(value) => setForm((current) => ({ ...current, businessGoal: value }))}
                placeholder="Ex.: qualificar leads, reduzir handoff desnecessario e orientar clientes com seguranca juridica."
              />

              <TextField
                label="Persona prompt"
                multiline
                rows={6}
                value={form.personaPrompt}
                onChange={(value) => setForm((current) => ({ ...current, personaPrompt: value }))}
                placeholder="Especialista em superendividamento, acolhedor, objetivo, sem inventar fatos processuais..."
              />

              <TextField
                label="Response policy"
                multiline
                rows={5}
                value={form.responsePolicy}
                onChange={(value) => setForm((current) => ({ ...current, responsePolicy: value }))}
                placeholder="Regras de seguranca e estilo da resposta."
              />

              <div className="grid gap-5 md:grid-cols-3">
                <TextField
                  label="Knowledge strategy"
                  multiline
                  rows={4}
                  value={form.knowledgeStrategy}
                  onChange={(value) => setForm((current) => ({ ...current, knowledgeStrategy: value }))}
                  placeholder="honorarios e pagamentos, consulta e agendamento..."
                />
                <TextField
                  label="Workflow strategy"
                  multiline
                  rows={4}
                  value={form.workflowStrategy}
                  onChange={(value) => setForm((current) => ({ ...current, workflowStrategy: value }))}
                  placeholder="qualificacao, status do processo, 2a via..."
                />
                <TextField
                  label="Handoff rules"
                  multiline
                  rows={4}
                  value={form.handoffRules}
                  onChange={(value) => setForm((current) => ({ ...current, handoffRules: value }))}
                  placeholder="financeiro, agendamento, processo sensivel..."
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#202321] pt-5">
                <div className="text-sm opacity-60">
                  {selectedAgent ? `Configurando ${selectedAgent.name} para melhorar resposta, intencao, fluxo e transferencia.` : "Nenhum agente selecionado."}
                </div>
                <button
                  type="button"
                  onClick={saveProfile}
                  disabled={savingProfile}
                  className="border border-[#C5A059] px-5 py-3 text-sm transition-colors hover:bg-[#C5A059] hover:text-[#050706] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {savingProfile ? "Salvando..." : "Salvar configuracao"}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-5 text-sm opacity-60">Nenhum perfil encontrado para edicao ainda.</div>
          )}
        </section>

        <section className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
          <h3 className="font-serif text-3xl">Fila viva por agente</h3>
          <p className="mt-2 text-sm leading-relaxed opacity-60">
            Aqui o time move os itens entre backlog, doing e done para transformar os piores cenarios em melhoria real do agente.
          </p>

          <div className="mt-5 space-y-4">
            {selectedQueue.length ? (
              selectedQueue.map((item) => (
                <article key={item.id} className="border border-[#202321] p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <span className="border border-[#6E5630] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[#F2DEB5]">
                      {item.priority}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.18em] opacity-45">{item.category}</span>
                    <span className="text-[10px] uppercase tracking-[0.18em] opacity-45">{item.sprint_bucket}</span>
                  </div>

                  <h4 className="font-serif text-2xl">{item.title}</h4>
                  <p className="mt-2 text-sm leading-relaxed opacity-65">{item.description}</p>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <SelectField
                      label="Status"
                      value={item.status}
                      onChange={(value) => updateQueueItem(item, { status: value })}
                      options={[
                        { value: "backlog", label: "Backlog" },
                        { value: "doing", label: "Doing" },
                        { value: "done", label: "Done" },
                      ]}
                    />
                    <SelectField
                      label="Prioridade"
                      value={item.priority}
                      onChange={(value) => updateQueueItem(item, { priority: value })}
                      options={[
                        { value: "alta", label: "Alta" },
                        { value: "media", label: "Media" },
                        { value: "baixa", label: "Baixa" },
                      ]}
                    />
                  </div>

                  {queueSavingId === item.id ? <p className="mt-3 text-sm opacity-55">Atualizando item...</p> : null}
                </article>
              ))
            ) : (
              <div className="text-sm opacity-60">Nao ha itens na fila viva para este agente ainda.</div>
            )}
          </div>
        </section>
      </section>

      <section className="grid gap-8 xl:grid-cols-[1fr_1fr]">
        <Panel
          title="Padrao de rollout"
          description="Toda melhoria do agente precisa sair desta tela ja traduzida em operacao no Freddy."
          items={[
            "Persona curta e calibrada para escritorio juridico",
            "Knowledge packs ligados a cenarios reais de atendimento",
            "Workflow backlog priorizado por impacto comercial e operacional",
            "Handoff rules que protegem o cliente e reduzem retrabalho humano",
          ]}
        />

        <Panel
          title="Playbooks ativos"
          description="Estas regras continuam sendo a linha editorial e operacional do agente."
          items={(planning.response_playbooks || []).map((item) => `${item.title}: ${item.rule}`)}
        />
      </section>
>>>>>>> codex/hmadv-tpu-fase53
    </div>
  );
}
