import Link from "next/link";
import { useRouter } from "next/router";
import { useMemo } from "react";
import { useSupabaseBrowser } from "../../lib/supabase";

const NAV_ITEMS = [
  { href: "/portal", label: "Visao geral", icon: "overview" },
  { href: "/portal/processos", label: "Processos", icon: "briefcase" },
  { href: "/portal/publicacoes", label: "Publicacoes", icon: "megaphone" },
  { href: "/portal/tickets", label: "Tickets", icon: "support" },
  { href: "/portal/consultas", label: "Consultas", icon: "calendar" },
  { href: "/portal/documentos", label: "Documentos", icon: "folder" },
  { href: "/portal/financeiro", label: "Financeiro", icon: "wallet" },
  { href: "/portal/perfil", label: "Perfil", icon: "user" },
];

function normalizeDisplayName(profile) {
  if (!profile) return "Cliente";
  return profile.full_name || profile.email || "Cliente";
}

function NavIcon({ name, active }) {
  const stroke = active ? "#07110E" : "#C49C56";
  const icons = {
    overview: <path d="M5 11.5 12 5l7 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-3v5H6a1 1 0 0 1-1-1v-7.5Z" />,
    briefcase: (
      <>
        <path d="M8 7V5.5C8 4.67 8.67 4 9.5 4h5c.83 0 1.5.67 1.5 1.5V7" />
        <path d="M4 9.5C4 8.67 4.67 8 5.5 8h13c.83 0 1.5.67 1.5 1.5v8c0 .83-.67 1.5-1.5 1.5h-13C4.67 19 4 18.33 4 17.5v-8Z" />
        <path d="M4 12h16" />
      </>
    ),
    megaphone: (
      <>
        <path d="M13 6.5 18.5 4v16L13 17.5" />
        <path d="M13 6.5H7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h6V6.5Z" />
        <path d="M8.5 17.5 10 21" />
      </>
    ),
    support: (
      <>
        <path d="M5 10a7 7 0 1 1 14 0v4a2 2 0 0 1-2 2h-2v-5h4" />
        <path d="M9 16v1a2 2 0 0 0 2 2h2" />
        <path d="M5 16H4a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1h1v4Z" />
      </>
    ),
    calendar: (
      <>
        <path d="M7 4v3M17 4v3M4 9h16" />
        <rect x="4" y="6" width="16" height="14" rx="2" />
        <path d="M9 13h2M13 13h2M9 17h2" />
      </>
    ),
    folder: <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H10l1.5 2H18.5A1.5 1.5 0 0 1 20 10.5v7A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-9Z" />,
    wallet: (
      <>
        <path d="M5 7.5A1.5 1.5 0 0 1 6.5 6h10A1.5 1.5 0 0 1 18 7.5V9H6.5A1.5 1.5 0 0 0 5 10.5v7A1.5 1.5 0 0 0 6.5 19H17.5A1.5 1.5 0 0 0 19 17.5V9.5" />
        <path d="M16 13.5h4v3h-4a1.5 1.5 0 0 1 0-3Z" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
      </>
    ),
  };

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <g stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {icons[name] || icons.overview}
      </g>
    </svg>
  );
}

function Breadcrumbs({ items = [] }) {
  if (!items.length) return null;

  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.18em] opacity-55">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={`${item.href || item.label}-${index}`} className="flex items-center gap-2">
            {item.href && !isLast ? (
              <Link href={item.href} prefetch={false} className="transition hover:text-[#C49C56]">
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? "text-[#C49C56]" : ""}>{item.label}</span>
            )}
            {!isLast ? <span aria-hidden="true">/</span> : null}
          </span>
        );
      })}
    </nav>
  );
}

function RightRailPanel({ title, icon, subtitle, defaultOpen = true, children }) {
  return (
    <details open={defaultOpen} className="group rounded-[24px] border border-[#20332D] bg-[rgba(255,255,255,0.02)]">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 rounded-2xl border border-[#20332D] bg-[rgba(6,10,9,0.45)] p-2 text-[#C49C56]">{icon}</span>
          <div>
            <p className="text-sm font-semibold">{title}</p>
            {subtitle ? <p className="mt-1 text-xs leading-5 opacity-55">{subtitle}</p> : null}
          </div>
        </div>
        <span className="text-xs uppercase tracking-[0.16em] opacity-45 transition group-open:rotate-180">⌄</span>
      </summary>
      <div className="border-t border-[#20332D] px-5 py-4">{children}</div>
    </details>
  );
}

function MetricChip({ label, value }) {
  return (
    <div className="rounded-2xl border border-[#20332D] bg-black/10 px-3 py-3">
      <p className="text-[10px] uppercase tracking-[0.16em] opacity-45">{label}</p>
      <p className="mt-2 text-sm font-semibold">{value}</p>
    </div>
  );
}

function DefaultRightRail({ title, profile, officeWhatsapp }) {
  const officeName = profile?.metadata?.office_name || "Hermida Maia Advocacia";

  return (
    <div className="space-y-4">
      <RightRailPanel
        title="Freshsales"
        subtitle="Reserva para widgets, sincronizacoes e apoio operacional do CRM."
        icon={<NavIcon name="wallet" active={false} />}
      >
        <div className="space-y-3 text-sm">
          <div className="rounded-[20px] border border-dashed border-[#2F4B43] bg-[rgba(7,17,14,0.55)] p-4">
            <p className="font-semibold">Widget CRM</p>
            <p className="mt-2 opacity-65">Area preparada para chat, metricas e componentes embarcados do Freshsales.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MetricChip label="Canal" value="CRM" />
            <MetricChip label="Modo" value="Conectavel" />
          </div>
          <a href="https://hmadv-org.myfreshworks.com/crm/sales" target="_blank" rel="noreferrer" className="inline-flex text-sm text-[#C49C56] hover:underline">
            Abrir Freshsales
          </a>
        </div>
      </RightRailPanel>

      <RightRailPanel
        title="Documentos e pendencias"
        subtitle="Espaco para listas colapsaveis, revisoes do escritorio e itens aguardando aprovacao."
        icon={<NavIcon name="folder" active={false} />}
        defaultOpen={false}
      >
        <div className="space-y-3 text-sm opacity-68">
          <p>O layout ja reserva esta coluna para documentos associados, comprovantes e arquivos pendentes de analise.</p>
          <MetricChip label="Status" value="Pronto para integrar" />
        </div>
      </RightRailPanel>

      <RightRailPanel
        title="Apoio ao cliente"
        subtitle="Atalhos para contato com o escritorio e proxima acao recomendada."
        icon={<NavIcon name="support" active={false} />}
        defaultOpen={false}
      >
        <div className="space-y-3 text-sm">
          <p className="opacity-68">Modulo ativo: {title}</p>
          <p className="opacity-68">Escritorio: {officeName}</p>
          {officeWhatsapp ? (
            <a href={`https://wa.me/${officeWhatsapp}`} target="_blank" rel="noreferrer" className="inline-flex text-[#C49C56] hover:underline">
              Falar no WhatsApp
            </a>
          ) : null}
        </div>
      </RightRailPanel>
    </div>
  );
}

export default function PortalLayout({
  title,
  description,
  profile,
  children,
  actions = null,
  breadcrumbs = [],
  rightRail = null,
}) {
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
      <div className="mx-auto max-w-[1680px] px-4 py-4 md:px-6">
        <div className="grid min-h-[calc(100vh-2rem)] gap-4 xl:grid-cols-[290px_minmax(0,1fr)_360px]">
          <aside className="xl:sticky xl:top-4 xl:h-[calc(100vh-2rem)]">
            <div className="flex h-full flex-col rounded-[34px] border border-[#20332D] bg-[linear-gradient(180deg,rgba(10,18,15,0.98),rgba(7,17,14,0.92))] px-6 py-7 shadow-[0_20px_80px_rgba(0,0,0,0.24)]">
              <Link href="/portal" prefetch={false} className="mb-10 block">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.28em] text-[#C49C56]">Hermida Maia</p>
                <h1 className="font-serif text-3xl">Portal do Cliente</h1>
              </Link>

              <div className="mb-8 rounded-[28px] border border-[#20332D] bg-[rgba(255,255,255,0.03)] p-5">
                <p className="text-xs uppercase tracking-[0.2em] opacity-45">Conta conectada</p>
                <p className="mt-3 text-lg font-semibold">{normalizeDisplayName(profile)}</p>
                <p className="mt-1 text-sm opacity-55">{profile?.email}</p>
              </div>

              <nav aria-label="Navegacao principal do portal" className="space-y-2">
                {NAV_ITEMS.map((item) => {
                  const active = router.pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch={false}
                      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition-all ${
                        active ? "translate-x-1 text-[#07110E]" : "text-[#F4F1EA] hover:border-[#C49C56] hover:text-[#C49C56]"
                      }`}
                      style={{
                        background: active ? "#C49C56" : "transparent",
                        borderColor: active ? "#C49C56" : "#20332D",
                      }}
                    >
                      <span className={`flex h-9 w-9 items-center justify-center rounded-2xl ${active ? "bg-[rgba(7,17,14,0.14)]" : "bg-[rgba(255,255,255,0.02)]"}`}>
                        <NavIcon name={item.icon} active={active} />
                      </span>
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>

              <div className="mt-auto space-y-4 pt-8">
                {officeWhatsapp ? (
                  <a
                    href={`https://wa.me/${officeWhatsapp}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-2xl border border-[#0A6A4A] bg-[rgba(10,106,74,0.16)] px-4 py-3 text-sm text-[#CFF5E8] transition hover:border-[#0FA06F]"
                  >
                    Falar com o escritorio no WhatsApp
                  </a>
                ) : null}

                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full rounded-2xl border border-[#20332D] px-4 py-3 text-sm transition hover:border-[#C49C56] hover:text-[#C49C56]"
                >
                  Sair
                </button>
              </div>
            </div>
          </aside>

          <main className="min-w-0 rounded-[34px] border border-[#20332D] bg-[linear-gradient(180deg,rgba(8,15,13,0.95),rgba(7,17,14,0.88))] px-6 py-7 md:px-8 xl:px-10">
            <header className="mb-8 border-b border-[#20332D] pb-7">
              <Breadcrumbs items={breadcrumbs} />
              <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                <div className="min-w-0">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-[#C49C56]">Portal ativo</p>
                  <h2 className="font-serif text-4xl md:text-5xl">{title}</h2>
                  {description ? <p className="mt-3 max-w-4xl text-sm leading-7 opacity-68">{description}</p> : null}
                </div>
                {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
              </div>
            </header>

            <div>{children}</div>
          </main>

          <aside className="xl:sticky xl:top-4 xl:h-[calc(100vh-2rem)]">
            <div className="h-full overflow-y-auto rounded-[34px] border border-[#20332D] bg-[linear-gradient(180deg,rgba(9,14,13,0.96),rgba(7,17,14,0.9))] p-4 md:p-5">
              {rightRail || <DefaultRightRail title={title} profile={profile} officeWhatsapp={officeWhatsapp} />}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
