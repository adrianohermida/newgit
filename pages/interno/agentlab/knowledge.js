<<<<<<< HEAD
import { useEffect, useMemo, useState } from "react";
=======
>>>>>>> codex/hmadv-tpu-fase53
import InternoLayout from "../../../components/interno/InternoLayout";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import AgentLabModuleNav from "../../../components/interno/agentlab/AgentLabModuleNav";
import { useAgentLabData } from "../../../lib/agentlab/useAgentLabData";
<<<<<<< HEAD
import { adminFetch } from "../../../lib/admin/api";
import { setModuleHistory } from "../../../lib/admin/activity-log";
import { buildModuleSnapshot } from "../../../lib/admin/module-registry";

function Panel({ title, children }) {
  return (
    <section className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
      <h3 className="mb-4 font-serif text-2xl">{title}</h3>
      {children}
    </section>
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
>>>>>>> codex/hmadv-tpu-fase53
  );
}

export default function AgentLabKnowledgePage() {
  const state = useAgentLabData();

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
<<<<<<< HEAD
          title="AgentLab · Conhecimento"
          description="Governanca dos knowledge packs, fontes de resposta, ingestao documental e backlog editorial que sustentam os agentes."
=======
          title="AgentLab Knowledge"
          description="Curadoria das fontes que alimentam o chatbot e os agentes, conectando CRM, conteudo estatico e prioridades de publicacao."
>>>>>>> codex/hmadv-tpu-fase53
        >
          <AgentLabModuleNav />
          <KnowledgeContent state={state} />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

function KnowledgeContent({ state }) {
<<<<<<< HEAD
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
    return <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">Carregando conhecimento...</div>;
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

  return (
    <div className="space-y-8">
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Knowledge packs prioritarios">
          <div className="space-y-4 text-sm opacity-75">
            {packs.map((item) => (
              <div key={item.id} className="border border-[#2D2E2E] p-4">
                <p className="font-semibold">{item.title}</p>
                <p>{item.description}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.15em] opacity-50">Prioridade: {item.priority}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Fontes de conhecimento sugeridas">
          {message ? <div className="mb-4 text-sm opacity-75">{message}</div> : null}
          <div className="grid gap-4 mb-6 md:grid-cols-2">
            <input
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              className="border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
              placeholder="Titulo da fonte"
            />
            <input
              value={form.source_type}
              onChange={(event) => setForm((current) => ({ ...current, source_type: event.target.value }))}
              className="border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
              placeholder="faq, url, pdf, artigo"
            />
            <input
              value={form.status}
              onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
              className="border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
              placeholder="Status"
            />
            <div />
            <textarea
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              className="min-h-[100px] md:col-span-2 border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
              placeholder="Notas operacionais, URL, ownership, pauta editorial..."
            />
            <div className="md:col-span-2">
              <button type="button" onClick={handleSaveKnowledgeSource} className="border border-[#C5A059] px-4 py-3 text-sm">
                Salvar fonte
              </button>
            </div>
          </div>
          <div className="space-y-4 text-sm opacity-75">
            {knowledgeSources.map((item) => (
              <div key={item.id} className="border border-[#2D2E2E] p-4">
                <div className="mb-2 flex flex-wrap gap-3 text-xs uppercase tracking-[0.15em] opacity-50">
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
        <div className="space-y-4 text-sm opacity-75">
          {queue.length ? (
            queue.map((item) => (
              <div key={item.id} className="border border-[#2D2E2E] p-4">
                <p className="font-semibold">{item.title}</p>
                <p>{item.description}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.15em] opacity-50">
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
          <div className="space-y-3 text-sm opacity-75">
            <p>1. Responder em PT-BR claro, sem prometer resultado juridico.</p>
            <p>2. Em tema processual sensivel, oferecer orientacao geral e priorizar handoff humano.</p>
            <p>3. Em financeiro e agendamento, priorizar autosservico com trilha registrada no CRM.</p>
            <p>4. Toda resposta deve respeitar o codigo de etica da advocacia e evitar captacao indevida.</p>
          </div>
        </Panel>

        <Panel title="Checklist de governanca">
          <div className="space-y-3 text-sm opacity-75">
            <p>1. Revisar unanswered e respostas ruins da sprint.</p>
            <p>2. Publicar ou revisar FAQs, respostas rapidas e arquivos criticos.</p>
            <p>3. Validar se o workflow certo esta cobrindo pergunta informativa ou tarefa operacional.</p>
            <p>4. Marcar quais fontes entram no Freddy e quais ficam como apoio interno no AgentLab.</p>
          </div>
        </Panel>
      </div>
=======
  if (state.loading) {
    return <LoadingBlock>Carregando modulo de conhecimento...</LoadingBlock>;
  }

  if (state.error) {
    return <LoadingBlock>{state.error}</LoadingBlock>;
  }

  const planning = state.data?.planning || {};
  const coverage = state.data?.crm_sync?.coverage || [];

  return (
    <div className="space-y-8">
      <section className="grid gap-4 md:grid-cols-3">
        <Metric label="Knowledge packs" value={planning.knowledge_packs?.length || 0} helper="Blocos editoriais priorizados para o Freddy." />
        <Metric label="Entidades CRM" value={coverage.length} helper="Fontes dinamicas ja espelhadas para enriquecer contexto." />
        <Metric label="Fontes hibridas" value="3" helper="Conteudo estatico, consulta dinamica e contexto comercial convivendo no AgentLab." />
      </section>

      <section className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
          <h3 className="font-serif text-3xl">Pacotes de conhecimento</h3>
          <p className="mt-2 text-sm leading-relaxed opacity-60">
            Esses pacotes devem virar FAQ, respostas predefinidas, URLs, arquivos e instrucoes operacionais no Freddy.
          </p>
          <div className="mt-5 space-y-4">
            {planning.knowledge_packs?.map((item) => (
              <article key={item.id} className="border border-[#202321] p-4">
                <p className="text-[10px] uppercase tracking-[0.18em] opacity-45">{item.sourceType}</p>
                <h4 className="mt-2 font-serif text-2xl">{item.title}</h4>
                <p className="mt-2 text-sm leading-relaxed opacity-65">{item.goal}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="space-y-8">
          <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
            <h3 className="font-serif text-3xl">Regras de curadoria</h3>
            <div className="mt-5 space-y-3 text-sm opacity-70">
              <div>Conteudo estatico vai para knowledge source versionado.</div>
              <div>Consulta dinamica vira workflow com API action e validacao.</div>
              <div>Contexto de jornada, sequencia e canal fica no AgentLab e no CRM.</div>
              <div>FAQ monolitico deve ser quebrado em temas, intents e blocos de decisao.</div>
            </div>
          </div>

          <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
            <h3 className="font-serif text-3xl">Cobertura CRM util</h3>
            <p className="mt-2 text-sm leading-relaxed opacity-60">
              O espelho do Freshsales ja mostra quais entidades podem enriquecer o agente com memoria comercial.
            </p>
            <div className="mt-5 space-y-3">
              {coverage.map((item) => (
                <div key={item.entity} className="border-t border-[#202321] pt-3 text-sm first:border-t-0 first:pt-0">
                  <span className="font-semibold">{item.entity}</span>
                  <span className="opacity-60"> · {item.total} registros espelhados</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
>>>>>>> codex/hmadv-tpu-fase53
    </div>
  );
}
