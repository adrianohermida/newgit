import Link from "next/link";
import { useEffect, useState } from "react";
import InternoLayout from "../../components/interno/InternoLayout";
import RequireAdmin from "../../components/interno/RequireAdmin";
import { FALLBACK_BLOG_POSTS } from "../../lib/blog/fallback-posts";
import { adminFetch } from "../../lib/admin/api";

function StatCard({ label, value, helper }) {
  return (
    <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
      <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-3 opacity-50">{label}</p>
      <p className="font-serif text-4xl mb-2">{value}</p>
      <p className="text-sm opacity-55 leading-relaxed">{helper}</p>
    </div>
  );
}

export default function InternoHomePage() {
  const [hmadvOps, setHmadvOps] = useState({ loading: true, error: null, data: null });
  const [draining, setDraining] = useState(false);

  async function loadHmadvOps() {
    setHmadvOps((current) => ({ ...current, loading: true, error: null }));
    try {
      const payload = await adminFetch("/api/admin-hmadv-filas");
      setHmadvOps({ loading: false, error: null, data: payload.data });
    } catch (error) {
      setHmadvOps({ loading: false, error: error.message || "Falha ao carregar controle HMADV.", data: null });
    }
  }

  async function handleDrainAll() {
    setDraining(true);
    try {
      await adminFetch("/api/admin-hmadv-filas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "drain_all", maxChunks: 8 }),
      }, { timeoutMs: 120000, maxRetries: 0 });
      await loadHmadvOps();
    } catch (error) {
      setHmadvOps((current) => ({ ...current, error: error.message || "Falha ao drenar filas." }));
    } finally {
      setDraining(false);
    }
  }

  useEffect(() => {
    loadHmadvOps();
  }, []);

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="Visao geral"
          description="Base inicial do dashboard interno para operacao editorial e acompanhamento dos fluxos do escritorio."
        >
          <div className="grid gap-6 md:grid-cols-3 mb-8">
            <StatCard
              label="Posts base"
              value={FALLBACK_BLOG_POSTS.length}
              helper="Conteudo inicial pronto para migracao e publicacao estruturada no Supabase."
            />
            <StatCard
              label="Agendamento"
              value="Ativo"
              helper="O fluxo publico continua operando; a proxima etapa e trazer visibilidade interna e melhorias graduais."
            />
            <StatCard
              label="Perfil"
              value={profile.role}
              helper="Permissoes do dashboard serao expandidas por modulo conforme o rollout."
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6 lg:col-span-2">
              <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-3" style={{ color: "#C5A059" }}>
                Torre HMADV
              </p>
              {hmadvOps.loading ? <p className="text-sm opacity-70">Carregando controle operacional...</p> : null}
              {hmadvOps.error ? <p className="text-sm text-red-300">{hmadvOps.error}</p> : null}
              {!hmadvOps.loading && hmadvOps.data ? (
                <div className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <StatCard label="Processos pendentes" value={(hmadvOps.data.processosJobs?.pending || 0) + (hmadvOps.data.processosJobs?.running || 0)} helper="Jobs de processos aguardando drenagem." />
                    <StatCard label="Publicações pendentes" value={(hmadvOps.data.publicacoesJobs?.pending || 0) + (hmadvOps.data.publicacoesJobs?.running || 0)} helper="Jobs de publicações aguardando drenagem." />
                    <StatCard label="Sem account" value={hmadvOps.data.processosOverview?.processosSemAccount || 0} helper="Processos órfãos ainda sem Sales Account." />
                    <StatCard label="Sem processo" value={hmadvOps.data.publicacoesOverview?.publicacoesSemProcesso || 0} helper="Publicações ainda sem processo vinculado." />
                  </div>
                  <div className="border border-[#2D2E2E] bg-[rgba(10,12,11,0.82)] p-4 text-sm">
                    <p className="font-semibold mb-2">Runner agendado</p>
                    <p className="opacity-75 mb-2">
                      {hmadvOps.data.runnerConfigured
                        ? "Pronto para scheduler externo via /api/admin-hmadv-runner."
                        : "Pendente configurar HMADV_RUNNER_TOKEN para liberar execucao agendada fora da aba."}
                    </p>
                    <p className="opacity-55 break-all">POST /api/admin-hmadv-runner</p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button type="button" onClick={handleDrainAll} disabled={draining} className="border border-[#C5A059] bg-[#C5A059] px-4 py-3 text-sm font-semibold text-[#050706] disabled:opacity-50">
                      {draining ? "Drenando filas..." : "Drenar Processos + Publicações"}
                    </button>
                    <button type="button" onClick={loadHmadvOps} disabled={draining} className="border border-[#2D2E2E] px-4 py-3 text-sm hover:border-[#C5A059] disabled:opacity-50">
                      Atualizar leitura
                    </button>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="border border-[#2D2E2E] p-4 text-sm opacity-75">
                      <p className="font-semibold mb-2">Processos</p>
                      <p>Pendentes: {hmadvOps.data.processosJobs?.pending || 0}</p>
                      <p>Executando: {hmadvOps.data.processosJobs?.running || 0}</p>
                      <p>Último job ativo: {hmadvOps.data.processosJobs?.active?.acao || "nenhum"}</p>
                    </div>
                    <div className="border border-[#2D2E2E] p-4 text-sm opacity-75">
                      <p className="font-semibold mb-2">Publicações</p>
                      <p>Pendentes: {hmadvOps.data.publicacoesJobs?.pending || 0}</p>
                      <p>Executando: {hmadvOps.data.publicacoesJobs?.running || 0}</p>
                      <p>Último job ativo: {hmadvOps.data.publicacoesJobs?.active?.acao || "nenhum"}</p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
              <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-3" style={{ color: "#C5A059" }}>
                Proximos blocos
              </p>
              <ul className="space-y-3 text-sm opacity-70">
                <li>AgentLab para governanca de agentes, chatbot e espelho do Freshsales.</li>
                <li>Publicacao e edicao de posts do blog.</li>
                <li>Leitura administrativa de agendamentos com filtros.</li>
                <li>Consolidacao de leads vindos da calculadora e do contato.</li>
              </ul>
            </div>

            <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
              <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-3" style={{ color: "#C5A059" }}>
                Acessos rapidos
              </p>
              <div className="space-y-3">
                <Link href="/interno/agentlab" prefetch={false} className="block border border-[#2D2E2E] px-4 py-3 hover:border-[#C5A059]">
                  Abrir AgentLab
                </Link>
                <Link href="/interno/ai-task" prefetch={false} className="block border border-[#2D2E2E] px-4 py-3 hover:border-[#C5A059]">
                  Abrir AI Task
                </Link>
                <Link href="/interno/aprovacoes" prefetch={false} className="block border border-[#2D2E2E] px-4 py-3 hover:border-[#C5A059]">
                  Abrir aprovacoes
                </Link>
                <Link href="/interno/processos" prefetch={false} className="block border border-[#2D2E2E] px-4 py-3 hover:border-[#C5A059]">
                  Abrir gestao de processos
                </Link>
                <Link href="/interno/publicacoes" prefetch={false} className="block border border-[#2D2E2E] px-4 py-3 hover:border-[#C5A059]">
                  Abrir gestao de publicacoes
                </Link>
                <Link href="/interno/contacts" prefetch={false} className="block border border-[#2D2E2E] px-4 py-3 hover:border-[#C5A059]">
                  Abrir gestao de contacts
                </Link>
                <Link href="/interno/posts" prefetch={false} className="block border border-[#2D2E2E] px-4 py-3 hover:border-[#C5A059]">
                  Abrir modulo de posts
                </Link>
                <Link href="/interno/agendamentos" prefetch={false} className="block border border-[#2D2E2E] px-4 py-3 hover:border-[#C5A059]">
                  Abrir leitura de agendamentos
                </Link>
                <Link href="/interno/leads" prefetch={false} className="block border border-[#2D2E2E] px-4 py-3 hover:border-[#C5A059]">
                  Abrir leads e tickets
                </Link>
              </div>
            </div>
          </div>
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}
