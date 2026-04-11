import Link from "next/link";
import Script from "next/script";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { useSupabaseBrowser } from "../../lib/supabase";
import { setModuleHistory } from "../../lib/admin/activity-log";

const FRESHWORKS_PORTAL_SCRIPT_URL = "//eu.fw-cdn.com/10713913/375987.js";
const FRESHWORKS_PORTAL_WIDGET_ID = "2bb07572-34a4-4ea6-9708-4ec2ed23589d";

const NAV_ITEMS = [
  { href: "/portal", label: "Visao geral", icon: "overview" },
  { href: "/portal/processos", label: "Processos", icon: "briefcase" },
  { href: "/portal/publicacoes", label: "Publicacoes", icon: "megaphone" },
  { href: "/portal/tickets", label: "Solicitacoes", icon: "support" },
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
    <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[#95A8A1]">
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
    <details open={defaultOpen} className="group overflow-hidden rounded-[22px] border border-[#22342F] bg-[rgba(10,18,16,0.92)]">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-4 py-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 rounded-xl border border-[#22342F] bg-[rgba(196,156,86,0.08)] p-2 text-[#C49C56]">{icon}</span>
          <div>
            <p className="text-sm font-semibold text-[#F5F1E8]">{title}</p>
            {subtitle ? <p className="mt-1 text-xs leading-5 text-[#92A59F]">{subtitle}</p> : null}
          </div>
        </div>
        <span className="text-xs uppercase tracking-[0.16em] text-[#768883] transition group-open:rotate-180">v</span>
      </summary>
      <div className="border-t border-[#22342F] px-4 py-4">{children}</div>
    </details>
  );
}

function MetricChip({ label, value }) {
  return (
    <div className="rounded-2xl border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-3 py-3">
      <p className="text-[10px] uppercase tracking-[0.16em] text-[#7E918B]">{label}</p>
      <p className="mt-2 text-sm font-semibold text-[#F5F1E8]">{value}</p>
    </div>
  );
}

function DefaultRightRail({ title, profile, officeWhatsapp }) {
  const officeName = profile?.metadata?.office_name || "Hermida Maia Advocacia";

  return (
    <div className="space-y-4">
      <RightRailPanel
        title="Contexto do modulo"
        subtitle="Apoio lateral para leitura, acompanhamento e proximas acoes."
        icon={<NavIcon name="overview" active={false} />}
      >
        <div className="space-y-3 text-sm">
          <div className="rounded-[18px] border border-[#2D463F] bg-[rgba(196,156,86,0.05)] p-4">
            <p className="font-semibold text-[#F5F1E8]">{title}</p>
            <p className="mt-2 text-sm leading-6 text-[#A3B5AF]">
              Use este painel quando quiser abrir informacoes de apoio sem perder o foco do conteudo principal.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MetricChip label="Escritorio" value="Hermida Maia" />
            <MetricChip label="Area" value={title} />
          </div>
        </div>
      </RightRailPanel>

      <RightRailPanel
        title="Documentos e pendencias"
        subtitle="Espaco reservado para itens de apoio, revisoes e devolutivas."
        icon={<NavIcon name="folder" active={false} />}
        defaultOpen={false}
      >
        <div className="space-y-3 text-sm text-[#A3B5AF]">
          <p>Quando houver materiais vinculados ao atendimento, eles podem ser organizados aqui em blocos colapsaveis, mantendo a leitura principal mais limpa.</p>
          <MetricChip label="Leitura" value="Sob demanda" />
        </div>
      </RightRailPanel>

      <RightRailPanel
        title="Contato e apoio"
        subtitle="Atalhos de contato com o escritorio."
        icon={<NavIcon name="support" active={false} />}
        defaultOpen={false}
      >
        <div className="space-y-3 text-sm">
          <p className="text-[#9EB1AB]">Modulo ativo: {title}</p>
          <p className="text-[#9EB1AB]">Escritorio: {officeName}</p>
          {officeWhatsapp ? (
            <a href={`https://wa.me/${officeWhatsapp}`} target="_blank" rel="noreferrer" className="inline-flex text-[#C49C56] hover:underline">
              Falar no WhatsApp
            </a>
          ) : null}
          <p className="text-xs leading-5 text-[#81948D]">
            O atendimento do escritorio permanece disponivel no widget flutuante do portal, no canto da tela.
          </p>
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
  rightRailLabel = "painel lateral",
  rightRailDefaultOpen = false,
}) {
  const router = useRouter();
  const { supabase } = useSupabaseBrowser();
  const [isRailOpen, setIsRailOpen] = useState(rightRailDefaultOpen);

  const officeWhatsapp = useMemo(() => {
    const value = profile?.metadata?.office_whatsapp || "";
    return String(value || "").replace(/\D/g, "");
  }, [profile?.metadata?.office_whatsapp]);

  useEffect(() => {
    setIsRailOpen(rightRailDefaultOpen);
  }, [rightRailDefaultOpen, router.asPath]);

  useEffect(() => {
    setModuleHistory("portal-shell", {
      routePath: router.pathname,
      asPath: router.asPath || router.pathname,
      shell: "portal",
      title,
      rightRailLabel,
      rightRailOpen: isRailOpen,
      navItems: NAV_ITEMS.length,
      officeWhatsappReady: Boolean(officeWhatsapp),
      profileEmail: profile?.email || null,
      updatedAt: new Date().toISOString(),
    });
  }, [isRailOpen, officeWhatsapp, profile?.email, rightRailLabel, router.asPath, router.pathname, title]);

  async function handleSignOut() {
    if (supabase) {
      await supabase.auth.signOut();
    }
    router.replace("/portal/login");
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(24,43,38,0.42),transparent_28%),linear-gradient(180deg,#07110E_0%,#091612_100%)] text-[#F4F1EA]">
      <Script
        id="freshworks_portal_widget_script"
        src={FRESHWORKS_PORTAL_SCRIPT_URL}
        strategy="afterInteractive"
        chat="true"
        widgetId={FRESHWORKS_PORTAL_WIDGET_ID}
      />

      <div className="w-full px-3 py-3 md:px-4 xl:px-5">
        <div className={`grid min-h-[calc(100vh-1.5rem)] gap-3 ${isRailOpen ? "xl:grid-cols-[272px_minmax(0,1fr)_320px]" : "xl:grid-cols-[272px_minmax(0,1fr)]"}`}>
          <aside className="xl:sticky xl:top-3 xl:h-[calc(100vh-1.5rem)]">
            <div className="flex h-full flex-col rounded-[28px] border border-[#1C2B27] bg-[linear-gradient(180deg,rgba(10,18,16,0.98),rgba(8,15,13,0.94))] px-5 py-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
              <Link href="/portal" prefetch={false} className="mb-8 block">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#C49C56]">Hermida Maia</p>
                <h1 className="text-[32px] font-semibold tracking-[-0.03em] text-[#F5F1E8]">Portal do Cliente</h1>
                <p className="mt-3 max-w-[18rem] text-sm leading-6 text-[#8FA39C]">
                  Um workspace juridico organizado para acompanhar processos, consultas, documentos e solicitacoes.
                </p>
              </Link>

              <div className="mb-6 rounded-[24px] border border-[#1D2E29] bg-[rgba(255,255,255,0.03)] p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#7F928C]">Conta conectada</p>
                <p className="mt-3 text-lg font-semibold text-[#F8F4EB]">{normalizeDisplayName(profile)}</p>
                <p className="mt-1 text-sm text-[#91A49E]">{profile?.email}</p>
              </div>

              <nav aria-label="Navegacao principal do portal" className="space-y-1.5">
                {NAV_ITEMS.map((item) => {
                  const active = router.pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch={false}
                      className={`group flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-sm transition-all ${
                        active
                          ? "border-[#C49C56] bg-[#C49C56] text-[#07110E] shadow-[0_10px_30px_rgba(196,156,86,0.18)]"
                          : "border-[#1F2F2A] bg-[rgba(255,255,255,0.01)] text-[#D8DED9] hover:border-[#315046] hover:bg-[rgba(255,255,255,0.025)]"
                      }`}
                    >
                      <span className={`flex h-9 w-9 items-center justify-center rounded-xl border ${active ? "border-[rgba(7,17,14,0.1)] bg-[rgba(7,17,14,0.08)]" : "border-[#233630] bg-[rgba(255,255,255,0.02)] group-hover:border-[#35554B]"}`}>
                        <NavIcon name={item.icon} active={active} />
                      </span>
                      <span className="font-medium">{item.label}</span>
                    </Link>
                  );
                })}
              </nav>

              <div className="mt-auto space-y-3 pt-6">
                <div className="rounded-[22px] border border-[#1D2E29] bg-[rgba(255,255,255,0.02)] p-4">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[#7E918B]">Workspace</p>
                  <p className="mt-2 text-sm font-medium text-[#F5F1E8]">Organizacao por contexto</p>
                  <p className="mt-2 text-sm leading-6 text-[#92A59F]">A barra lateral navega. O centro executa. O painel lateral apoia com documentos, apoio e pendencias quando necessario.</p>
                </div>

                {officeWhatsapp ? (
                  <a
                    href={`https://wa.me/${officeWhatsapp}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-2xl border border-[#23523F] bg-[rgba(17,79,55,0.2)] px-4 py-3 text-sm text-[#D5F3E8] transition hover:border-[#2F7359]"
                  >
                    Falar com o escritorio no WhatsApp
                  </a>
                ) : null}

                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full rounded-2xl border border-[#22342F] px-4 py-3 text-sm text-[#D8DEDA] transition hover:border-[#C49C56] hover:text-[#C49C56]"
                >
                  Sair
                </button>
              </div>
            </div>
          </aside>

          <main className="min-w-0 rounded-[28px] border border-[#1C2B27] bg-[linear-gradient(180deg,rgba(9,16,14,0.97),rgba(8,14,12,0.93))] px-5 py-5 md:px-6 xl:px-7">
            <header className="mb-6 border-b border-[#1E2E29] pb-5">
              <Breadcrumbs items={breadcrumbs} />
              <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                <div className="min-w-0">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-[#C49C56]">Portal ativo</p>
                  <h2 className="text-3xl font-semibold tracking-[-0.035em] text-[#F8F4EB] md:text-[38px]">{title}</h2>
                  {description ? <p className="mt-3 max-w-3xl text-sm leading-7 text-[#99ADA6]">{description}</p> : null}
                </div>
                <div className="flex flex-wrap gap-3">
                  {actions}
                  <button
                    type="button"
                    onClick={() => setIsRailOpen((current) => !current)}
                    className="rounded-2xl border border-[#22342F] px-4 py-3 text-sm text-[#D8DEDA] transition hover:border-[#C49C56] hover:text-[#C49C56]"
                  >
                    {isRailOpen ? `Fechar ${rightRailLabel}` : `Abrir ${rightRailLabel}`}
                  </button>
                </div>
              </div>
            </header>

            <div>{children}</div>
          </main>

          {isRailOpen ? (
            <aside className="xl:h-[calc(100vh-1.5rem)]">
              <div className="h-full overflow-y-auto rounded-[28px] border border-[#1C2B27] bg-[linear-gradient(180deg,rgba(10,17,15,0.96),rgba(8,14,12,0.92))] p-3 md:p-4">
                {rightRail || <DefaultRightRail title={title} profile={profile} officeWhatsapp={officeWhatsapp} />}
              </div>
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}
