import Link from "next/link";
import { useRouter } from "next/router";
import { useSupabaseBrowser } from "../../lib/supabase";

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
    <div className="min-h-screen bg-[#050706] text-[#F4F1EA]">
      <div className="grid min-h-screen lg:grid-cols-[260px_1fr]">
        <aside className="border-r border-[#2D2E2E] bg-[rgba(9,11,10,0.96)] px-6 py-8">
          <Link href="/interno" className="block mb-12">
            <p className="text-xs font-semibold tracking-[0.25em] uppercase mb-2" style={{ color: "#C5A059" }}>
              Hermida Maia
            </p>
            <h1 className="font-serif text-3xl">Painel Interno</h1>
          </Link>

          <nav className="space-y-2 mb-12">
            {NAV_ITEMS.map((item) => {
              const active = router.pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  className={`block px-4 py-3 text-sm transition-colors ${active ? "text-[#050706]" : "text-[#F4F1EA]"}`}
                  style={{
                    background: active ? "#C5A059" : "transparent",
                    border: active ? "1px solid #C5A059" : "1px solid #2D2E2E",
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="border border-[#2D2E2E] p-4 text-sm">
            <p className="opacity-50 mb-1">Perfil conectado</p>
            <p className="font-semibold">{profile.full_name || profile.email}</p>
            <p className="uppercase tracking-[0.18em] text-[10px] mt-2" style={{ color: "#C5A059" }}>
              {profile.role}
            </p>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            className="mt-6 w-full border border-[#2D2E2E] px-4 py-3 text-sm hover:border-[#C5A059] hover:text-[#C5A059] transition-colors"
          >
            Sair
          </button>
        </aside>

        <main className="px-6 py-8 md:px-10 md:py-10">
          <header className="mb-10">
            <p className="text-xs font-semibold tracking-[0.25em] uppercase mb-3" style={{ color: "#C5A059" }}>
              Operacao Interna
            </p>
            <h2 className="font-serif text-4xl mb-3">{title}</h2>
            {description ? <p className="max-w-3xl opacity-60 leading-relaxed">{description}</p> : null}
          </header>

          {children}
        </main>
      </div>
    </div>
  );
}
