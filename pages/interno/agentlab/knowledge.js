import { useEffect, useMemo, useState } from "react";
import InternoLayout from "../../../components/interno/InternoLayout";
import { useInternalTheme } from "../../../components/interno/InternalThemeProvider";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import AgentLabModuleNav from "../../../components/interno/agentlab/AgentLabModuleNav";
import { useAgentLabData } from "../../../lib/agentlab/useAgentLabData";
import { adminFetch } from "../../../lib/admin/api";
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

export default function AgentLabKnowledgePage() {
  const state = useAgentLabData();

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="AgentLab · Conhecimento"
          description="Governanca dos knowledge packs, fontes de resposta, ingestao documental e backlog editorial que sustentam os agentes."
        >
          <AgentLabModuleNav />
          <KnowledgeContent state={state} />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

function KnowledgeContent({ state }) {
  const { isLightTheme } = useInternalTheme();
  const packs = state.data?.rollout?.knowledgePacks || [];
  const knowledgeSources = state.data?.rollout?.knowledgeSources || [];
  const [message, setMessage] = useState(null);
  const [form, setForm] = useState({
    source_type: "faq",
    title: "",
    status: "draft",
    notes: "",
  });
  const queue = useMemo(
    () => (state.data?.governance?.queue || []).filter((item) => ["knowledge", "evaluation", "handoff"].includes(item.category)),
    [state.data]
  );

  useEffect(() => {
    setModuleHistory(
      "agentlab-knowledge",
      buildModuleSnapshot("agentlab", {
        routePath: "/interno/agentlab/knowledge",
        loading: state.loading,
        error: state.error,
        section: "knowledge",
        packs: packs.length,
        knowledgeSources: knowledgeSources.length,
        queue: queue.length,
        message: message || null,
        coverage: {
          routeTracked: true,
          consoleIntegrated: true,
          actionsTracked: true,
        },
      }),
    );
  }, [knowledgeSources.length, message, packs.length, queue.length, state.error, state.loading]);

  if (state.loading) {
    return <div className={`border p-6 ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#4b5563]" : "border-[#2D2E2E] bg-[rgba(13,15,14,0.96)]"}`}>Carregando conhecimento...</div>;
  }

  if (state.error) {
    return <div className="border border-[#7f1d1d] bg-[rgba(127,29,29,0.22)] p-6 text-sm">{state.error}</div>;
  }

  async function handleSaveKnowledgeSource() {
    try {
      setMessage(null);
      await adminFetch("/api/admin-agentlab-governance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert_knowledge_source",
          agent_ref: "dotobot-ai",
          ...form,
        }),
      });
      setMessage("Fonte de conhecimento salva.");
      setForm({
        source_type: "faq",
        title: "",
        status: "draft",
        notes: "",
      });
      state.refresh();
    } catch (error) {
      setMessage(error.message);
    }
  }

  const boxTone = isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937]" : "border-[#2D2E2E]";
  const muted = isLightTheme ? "text-[#4b5563]" : "opacity-75";
  const subtle = isLightTheme ? "text-[#6b7280]" : "opacity-50";
  const inputTone = isLightTheme
    ? "border-[#d7d4cb] bg-white text-[#1f2937] focus:border-[#9a6d14]"
    : "border-[#2D2E2E] bg-transparent focus:border-[#C5A059]";

  return (
    <div className="space-y-8">
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Knowledge packs prioritarios">
          <div className={`space-y-4 text-sm ${muted}`}>
            {packs.map((item) => (
              <div key={item.id} className={`border p-4 ${boxTone}`}>
                <p className="font-semibold">{item.title}</p>
                <p>{item.description}</p>
                <p className={`mt-2 text-xs uppercase tracking-[0.15em] ${subtle}`}>Prioridade: {item.priority}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Fontes de conhecimento sugeridas">
          {message ? <div className={`mb-4 text-sm ${muted}`}>{message}</div> : null}
          <div className="mb-6 grid gap-4 md:grid-cols-2">
            <input
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              className={`border px-4 py-3 outline-none transition ${inputTone}`}
              placeholder="Titulo da fonte"
            />
            <input
              value={form.source_type}
              onChange={(event) => setForm((current) => ({ ...current, source_type: event.target.value }))}
              className={`border px-4 py-3 outline-none transition ${inputTone}`}
              placeholder="faq, url, pdf, artigo"
            />
            <input
              value={form.status}
              onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
              className={`border px-4 py-3 outline-none transition ${inputTone}`}
              placeholder="Status"
            />
            <div />
            <textarea
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              className={`min-h-[100px] border px-4 py-3 outline-none transition md:col-span-2 ${inputTone}`}
              placeholder="Notas operacionais, URL, ownership, pauta editorial..."
            />
            <div className="md:col-span-2">
              <button
                type="button"
                onClick={handleSaveKnowledgeSource}
                className={`border px-4 py-3 text-sm transition ${isLightTheme ? "border-[#9a6d14] text-[#9a6d14] hover:bg-[#9a6d14] hover:text-white" : "border-[#C5A059]"}`}
              >
                Salvar fonte
              </button>
            </div>
          </div>
          <div className={`space-y-4 text-sm ${muted}`}>
            {knowledgeSources.map((item) => (
              <div key={item.id} className={`border p-4 ${boxTone}`}>
                <div className={`mb-2 flex flex-wrap gap-3 text-xs uppercase tracking-[0.15em] ${subtle}`}>
                  <span>{item.source_type}</span>
                  <span>{item.status}</span>
                </div>
                <p className="font-semibold">{item.title}</p>
                <p className="mt-2">{item.notes}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Backlog operacional de conhecimento">
        <div className={`space-y-4 text-sm ${muted}`}>
          {queue.length ? (
            queue.map((item) => (
              <div key={item.id} className={`border p-4 ${boxTone}`}>
                <p className="font-semibold">{item.title}</p>
                <p>{item.description}</p>
                <p className={`mt-2 text-xs uppercase tracking-[0.15em] ${subtle}`}>
                  {item.category} · {item.priority} · {item.status}
                </p>
              </div>
            ))
          ) : (
            <p>Nenhum backlog operacional de conhecimento neste momento.</p>
          )}
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Playbook editorial juridico">
          <div className={`space-y-3 text-sm ${muted}`}>
            <p>1. Responder em PT-BR claro, sem prometer resultado juridico.</p>
            <p>2. Em tema processual sensivel, oferecer orientacao geral e priorizar handoff humano.</p>
            <p>3. Em financeiro e agendamento, priorizar autosservico com trilha registrada no CRM.</p>
            <p>4. Toda resposta deve respeitar o codigo de etica da advocacia e evitar captacao indevida.</p>
          </div>
        </Panel>

        <Panel title="Checklist de governanca">
          <div className={`space-y-3 text-sm ${muted}`}>
            <p>1. Revisar unanswered e respostas ruins da sprint.</p>
            <p>2. Publicar ou revisar FAQs, respostas rapidas e arquivos criticos.</p>
            <p>3. Validar se o workflow certo esta cobrindo pergunta informativa ou tarefa operacional.</p>
            <p>4. Marcar quais fontes entram no Freddy e quais ficam como apoio interno no AgentLab.</p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
