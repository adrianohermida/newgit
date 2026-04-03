import Link from "next/link";
import { useRouter } from "next/router";
import { useSupabaseBrowser } from "../../lib/supabase";
import DotobotPanel from "./DotobotPanel";

const NAV_ITEMS = [
  { href: "/interno", label: "Visao Geral" },
  { href: "/interno/aprovacoes", label: "Aprovacoes" },
  { href: "/interno/processos", label: "Processos" },
  { href: "/interno/publicacoes", label: "Publicacoes" },
  { href: "/interno/contacts", label: "Contacts" },
  { href: "/interno/agentlab", label: "AgentLab" },
  { href: "/interno/posts", label: "Posts" },
  { href: "/interno/agendamentos", label: "Agendamentos" },
  { href: "/interno/leads", label: "Leads" },
];

export default function InternoLayout({ title, description, profile, children }) {
  const router = useRouter();
  const { supabase } = useSupabaseBrowser();

  async function handleSignOut() {
    if (supabase) {
      await supabase.auth.signOut();
    }
    router.replace("/interno/login");
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(30,24,13,0.28),transparent_30%),linear-gradient(180deg,#050706_0%,#070A09_100%)] text-[#F4F1EA]">
      <div className="w-full px-3 py-3 md:px-4 xl:px-5">
        <div className="grid min-h-[calc(100vh-1.5rem)] gap-3 xl:grid-cols-[272px_minmax(0,1fr)_360px]">
          <aside className="xl:sticky xl:top-3 xl:h-[calc(100vh-1.5rem)]">
            <div className="flex h-full flex-col rounded-[28px] border border-[#1D2220] bg-[linear-gradient(180deg,rgba(9,11,10,0.98),rgba(7,9,8,0.94))] px-5 py-5 shadow-[0_18px_48px_rgba(0,0,0,0.24)]">
              <Link href="/interno" className="mb-8 block">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#C5A059]">Hermida Maia</p>
                <h1 className="text-[32px] font-semibold tracking-[-0.03em] text-[#F5F1E8]">Painel Interno</h1>
                <p className="mt-3 max-w-[18rem] text-sm leading-6 text-[#91A29C]">
                  Workspace operacional para processos, CRM, governanca de agentes e automacoes do escritorio.
                </p>
              </Link>

              <div className="mb-6 rounded-[24px] border border-[#232927] bg-[rgba(255,255,255,0.02)] p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#7F928C]">Perfil conectado</p>
                <p className="mt-3 text-lg font-semibold text-[#F8F4EB]">{profile.full_name || profile.email}</p>
                <p className="mt-1 text-sm text-[#91A49E]">{profile.email}</p>
                <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-[#C5A059]">{profile.role}</p>
              </div>

              <nav aria-label="Navegacao interna" className="space-y-1.5">
                {NAV_ITEMS.map((item) => {
                  const active = router.pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch={false}
                      className={`flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-sm transition-all ${
                        active
                          ? "border-[#C5A059] bg-[#C5A059] text-[#07110E] shadow-[0_10px_30px_rgba(197,160,89,0.18)]"
                          : "border-[#1F2A27] bg-[rgba(255,255,255,0.01)] text-[#D8DED9] hover:border-[#2F3E39] hover:bg-[rgba(255,255,255,0.025)]"
                      }`}
                    >
                      <span className={`h-2.5 w-2.5 rounded-full ${active ? "bg-[#07110E]" : "bg-[#C5A059]"}`} />
                      <span className="font-medium">{item.label}</span>
                    </Link>
                  );
                })}
              </nav>

              <div className="mt-auto space-y-3 pt-6">
                <div className="rounded-[22px] border border-[#1E2724] bg-[rgba(255,255,255,0.02)] p-4">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[#7E918B]">Arquitetura UX</p>
                  <p className="mt-2 text-sm font-medium text-[#F5F1E8]">Sidebar, modulo, Dotobot</p>
                  <p className="mt-2 text-sm leading-6 text-[#92A59F]">
                    Navegue pela esquerda, trabalhe no centro e use a coluna fixa do Dotobot para contexto operacional continuo.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full rounded-2xl border border-[#22342F] px-4 py-3 text-sm text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                >
                  Sair
                </button>
              </div>
            </div>
          </aside>

          <main className="min-w-0 rounded-[28px] border border-[#1D2220] bg-[linear-gradient(180deg,rgba(9,12,11,0.97),rgba(7,10,9,0.93))] px-5 py-5 md:px-6 xl:px-7">
            <header className="mb-6 border-b border-[#1F2624] pb-5">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-[#C5A059]">Operacao interna</p>
              <h2 className="text-3xl font-semibold tracking-[-0.035em] text-[#F8F4EB] md:text-[38px]">{title}</h2>
              {description ? <p className="mt-3 max-w-3xl text-sm leading-7 text-[#99ADA6]">{description}</p> : null}
            </header>

            <div>{children}</div>
          </main>

          <aside className="xl:h-[calc(100vh-1.5rem)]">
            <div className="h-full overflow-y-auto rounded-[28px] border border-[#1D2220] bg-[linear-gradient(180deg,rgba(10,13,12,0.96),rgba(8,10,9,0.92))] p-3 md:p-4">
              <DotobotPanel profile={profile} routePath={router.pathname} />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

