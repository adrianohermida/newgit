import Link from "next/link";
import InternoLayout from "../../components/interno/InternoLayout";
import RequireAdmin from "../../components/interno/RequireAdmin";
import { FALLBACK_BLOG_POSTS } from "../../lib/blog/fallback-posts";

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
                <Link href="/interno/clientes" prefetch={false} className="block border border-[#2D2E2E] px-4 py-3 hover:border-[#C5A059]">
                  Abrir fila de clientes
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
