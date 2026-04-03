import Link from "next/link";
import { useRouter } from "next/router";
import { useMemo } from "react";
import { useSupabaseBrowser } from "../../lib/supabase";

const NAV_ITEMS = [
  { href: "/portal", label: "Visao geral" },
  { href: "/portal/processos", label: "Processos" },
  { href: "/portal/publicacoes", label: "Publicacoes" },
  { href: "/portal/tickets", label: "Tickets" },
  { href: "/portal/consultas", label: "Consultas" },
  { href: "/portal/documentos", label: "Documentos" },
  { href: "/portal/financeiro", label: "Financeiro" },
  { href: "/portal/perfil", label: "Perfil" },
];

function normalizeDisplayName(profile) {
  if (!profile) return "Cliente";
  return profile.full_name || profile.email || "Cliente";
}

export default function PortalLayout({ title, description, profile, children, actions = null }) {
  const router = useRouter();
  const { supabase } = useSupabaseBrowser();

  const officeWhatsapp = useMemo(() => {
    const value = profile?.metadata?.office_whatsapp || "";
    return String(value || "").replace(/\D/g, "");
  }, [profile?.metadata?.office_whatsapp]);

  async function handleSignOut() {
    if (supabase) {
      await supabase.auth.signOut();
    }
    router.replace("/portal/login");
  }

  return (
    <div className="min-h-screen bg-[#07110E] text-[#F4F1EA]">
      <div className="mx-auto grid min-h-screen max-w-7xl lg:grid-cols-[290px_1fr]">
        <aside className="border-r border-[#20332D] bg-[rgba(10,18,15,0.96)] px-6 py-8">
          <Link href="/portal" prefetch={false} className="block mb-10">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.28em] text-[#C49C56]">Hermida Maia</p>
            <h1 className="font-serif text-3xl">Portal do Cliente</h1>
          </Link>

          <div className="mb-8 rounded-[26px] border border-[#20332D] bg-[rgba(255,255,255,0.02)] p-5">
            <p className="text-xs uppercase tracking-[0.2em] opacity-45">Conta conectada</p>
            <p className="mt-3 text-lg font-semibold">{normalizeDisplayName(profile)}</p>
            <p className="mt-1 text-sm opacity-55">{profile?.email}</p>
          </div>

          <nav className="space-y-2">
            {NAV_ITEMS.map((item) => {
              const active = router.pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  className={`block rounded-2xl border px-4 py-3 text-sm transition-colors ${active ? "text-[#07110E]" : "text-[#F4F1EA]"}`}
                  style={{
                    background: active ? "#C49C56" : "transparent",
                    borderColor: active ? "#C49C56" : "#20332D",
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {officeWhatsapp ? (
            <a
              href={`https://wa.me/${officeWhatsapp}`}
              target="_blank"
              rel="noreferrer"
              className="mt-8 block rounded-2xl border border-[#0A6A4A] bg-[rgba(10,106,74,0.16)] px-4 py-3 text-sm text-[#CFF5E8] transition hover:border-[#0FA06F]"
            >
              Falar com o escritorio no WhatsApp
            </a>
          ) : null}

          <button
            type="button"
            onClick={handleSignOut}
            className="mt-4 w-full rounded-2xl border border-[#20332D] px-4 py-3 text-sm transition hover:border-[#C49C56] hover:text-[#C49C56]"
          >
            Sair
          </button>
        </aside>

        <main className="px-6 py-8 md:px-10 md:py-10">
          <header className="mb-10 flex flex-col gap-5 border-b border-[#20332D] pb-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-[#C49C56]">Portal ativo</p>
              <h2 className="font-serif text-4xl">{title}</h2>
              {description ? <p className="mt-3 max-w-3xl text-sm leading-7 opacity-68">{description}</p> : null}
            </div>
            {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
          </header>

          {children}
        </main>
      </div>
    </div>
  );
}
