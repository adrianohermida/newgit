import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";
import { setModuleHistory } from "../lib/admin/activity-log";
import { useInternalTheme } from "./interno/InternalThemeProvider";
const WhatsappWidgetCircle = dynamic(() => import("./WhatsappWidgetCircle"), { ssr: false });

const NAV_ITEMS = [
  { label: "Início", href: "/" },
  { label: "Sobre", href: "/#sobre" },
  { label: "Serviços", href: "/servicos" },
  { label: "Calculadora", href: "/calculadora" },
  { label: "Blog", href: "/blog" },
  { label: "Contato", href: "/contato" },
  { label: "Entrar", href: "https://hmdesk.freshdesk.com/support/login", external: true },
];

function NavMenu({ isOpen, onClose, isLightTheme }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ clipPath: "circle(0% at calc(100% - 40px) 40px)" }}
          animate={{ clipPath: "circle(150% at calc(100% - 40px) 40px)" }}
          exit={{ clipPath: "circle(0% at calc(100% - 40px) 40px)" }}
          transition={{ duration: 0.6, ease: [0.76, 0, 0.24, 1] }}
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: resolvedLightTheme ? "#EEF2F6" : "#050706" }}
        >
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "url('https://sspvizogbcyigquqycsz.supabase.co/storage/v1/object/public/Images/perfil_1.webp')",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
          <button
            onClick={onClose}
            className={`absolute top-8 right-8 hover:text-[#C5A059] transition-colors z-10 ${resolvedLightTheme ? "text-[#13201D]" : "text-[#F4F1EA]"}`}
          >
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="8" y1="8" x2="24" y2="24" />
              <line x1="24" y1="8" x2="8" y2="24" />
            </svg>
          </button>

          <nav className="relative z-10 flex flex-col items-center gap-3">
            {NAV_ITEMS.filter(item => item.label !== "FAQ").map((item, i) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.08, duration: 0.5 }}
              >
                <Link href={item.href} legacyBehavior>
                  <a
                    onClick={onClose}
                    className={`font-serif text-5xl md:text-7xl font-light hover:text-[#C5A059] transition-colors duration-300 block py-2 ${resolvedLightTheme ? "text-[#13201D]" : "text-[#F4F1EA]"}`}
                  >
                    {item.label}
                  </a>
                </Link>
              </motion.div>
            ))}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.5 }}
              className="mt-8"
            >
              <a
                href="https://wa.me/5551996032004"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 border border-[#C5A059] text-[#C5A059] px-8 py-4 text-sm font-semibold tracking-[0.15em] uppercase hover:bg-[#C5A059] hover:text-[#050706] transition-all duration-300"
                onClick={onClose}
              >
                Falar com Especialista
              </a>
            </motion.div>
          </nav>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function Layout({ children, forceDarkMode = false, hideThemeControls = false }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const router = useRouter();
  const { isLightTheme, preference, setThemePreference, toggleTheme } = useInternalTheme();
  const resolvedLightTheme = forceDarkMode ? false : isLightTheme;

  useEffect(() => {
    setModuleHistory("public-shell", {
      routePath: router.pathname,
      asPath: router.asPath || router.pathname,
      shell: "public",
      navItems: NAV_ITEMS.length,
      menuOpen,
      scrolled,
      hasFloatingWhatsapp: true,
      supportsPortalEntry: true,
      updatedAt: new Date().toISOString(),
    });
  }, [menuOpen, router.asPath, router.pathname, scrolled]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const handleScroll = () => setScrolled(window.scrollY > 50);
      window.addEventListener("scroll", handleScroll);
      return () => window.removeEventListener("scroll", handleScroll);
    }
    return undefined;
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      if (menuOpen) {
        document.body.style.overflow = "hidden";
      } else {
        document.body.style.overflow = "";
      }
      return () => {
        document.body.style.overflow = "";
      };
    }
    return undefined;
  }, [menuOpen]);

  useEffect(() => {
    if (!forceDarkMode) return undefined;
    setThemePreference("dark");
    return undefined;
  }, [forceDarkMode, setThemePreference]);

  return (
    <div className={`min-h-screen flex flex-col ${resolvedLightTheme ? "bg-[#F3F6FA] text-[#13201D]" : "bg-[#050706] text-[#F4F1EA]"}`}>
      {/* Vertical side labels */}
      <div className="fixed left-4 top-1/2 -translate-y-1/2 z-40 hidden xl:flex flex-col items-center gap-4">
        <div
          className="text-[10px] font-semibold tracking-[0.3em] uppercase opacity-30"
          style={{ writingMode: "vertical-rl", color: "#C5A059" }}
        >
          DEFESA LEGAL
        </div>
        <div className="w-px h-16" style={{ background: "#2D2E2E" }} />
      </div>

      <div className="fixed right-4 top-1/2 -translate-y-1/2 z-40 hidden xl:flex flex-col items-center gap-4">
        <div className="w-px h-16" style={{ background: "#2D2E2E" }} />
        <div
          className="text-[10px] font-semibold tracking-[0.3em] uppercase opacity-30"
          style={{ writingMode: "vertical-rl", color: "#C5A059" }}
        >
          EST. 2023
        </div>
      </div>

      {/* Header */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled ? "py-3" : "py-5"
        }`}
        style={{
          background: scrolled ? (resolvedLightTheme ? "rgba(243, 246, 250, 0.92)" : "rgba(5, 7, 6, 0.9)") : "transparent",
          backdropFilter: scrolled ? "blur(20px)" : "none",
          borderBottom: scrolled ? (resolvedLightTheme ? "1px solid rgba(202, 214, 226, 0.9)" : "1px solid rgba(45, 46, 46, 0.5)") : "1px solid transparent",
        }}
      >
        <div className="mx-auto max-w-7xl px-6 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 flex items-center justify-center border border-[#C5A059]/40 group-hover:border-[#C5A059] transition-colors">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C5A059" strokeWidth="1.5">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold tracking-[0.1em] uppercase leading-none" style={{ color: resolvedLightTheme ? "#13201D" : "#F4F1EA" }}>
                Hermida Maia
              </h1>
              <p className="text-[9px] font-semibold tracking-[0.25em] uppercase" style={{ color: "#C5A059" }}>
                Advocacia
              </p>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-10">
            {NAV_ITEMS.map((item) => {
              if (item.external) {
                return (
                  <a
                    key={item.label}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold tracking-[0.12em] uppercase transition-colors duration-300 hover:text-[#C5A059]"
                    style={{ color: resolvedLightTheme ? "#13201D" : "#F4F1EA" }}
                  >
                    {item.label}
                  </a>
                );
              }
              const isActive = router.pathname === item.href || (item.href === "/servicos" && router.pathname.startsWith("/servicos"));
              return (
                <Link key={item.label} href={item.href} legacyBehavior>
                  <a
                    className={`text-xs font-semibold tracking-[0.12em] uppercase transition-colors duration-300 ${isActive ? "text-[#C5A059]" : "hover:text-[#C5A059]"}`}
                    style={{ color: isActive ? "#C5A059" : (resolvedLightTheme ? "#13201D" : "#F4F1EA") }}
                  >
                    {item.label}
                  </a>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-4">
            {!hideThemeControls ? <div className={`hidden items-center gap-1 rounded-[14px] border px-1 py-1 md:flex ${resolvedLightTheme ? "border-[#D4DEE8] bg-[rgba(255,255,255,0.84)]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
              {[
                { key: "light", label: "Claro" },
                { key: "system", label: "Sistema" },
                { key: "dark", label: "Escuro" },
              ].map((option) => {
                const active = preference === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setThemePreference(option.key)}
                    className={`rounded-[10px] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition ${
                      active
                        ? "bg-[linear-gradient(180deg,#C5A059,#B08B46)] text-[#07110E]"
                        : resolvedLightTheme
                          ? "text-[#60706A] hover:bg-[rgba(213,222,233,0.76)] hover:text-[#22312F]"
                          : "text-[#9BAEA8] hover:bg-[rgba(255,255,255,0.05)] hover:text-[#F5E6C5]"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div> : null}
            {!hideThemeControls ? <button
              type="button"
              onClick={toggleTheme}
              className={`hidden rounded-[14px] border px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] transition hover:border-[#C5A059] hover:text-[#C5A059] md:inline-flex ${resolvedLightTheme ? "border-[#D4DEE8] text-[#22312F]" : "border-[#22342F] text-[#D8DEDA]"}`}
            >
              Alternar
            </button> : null}
            <Link href="/agendamento" legacyBehavior>
              <a
                className="hidden md:inline-flex items-center gap-2 border border-[#C5A059]/50 text-[#C5A059] px-6 py-2.5 text-xs font-semibold tracking-[0.12em] uppercase hover:bg-[#C5A059] hover:text-[#050706] transition-all duration-300"
              >
                Consulta
              </a>
            </Link>

            {/* Hamburger */}
            <button
              onClick={() => setMenuOpen(true)}
              className="lg:hidden flex flex-col gap-1.5 items-end group"
              aria-label="Abrir menu"
            >
              <div className={`w-7 h-[2px] ${resolvedLightTheme ? "bg-[#13201D]" : "bg-[#F4F1EA]"} group-hover:bg-[#C5A059] transition-colors`} />
              <div className={`w-5 h-[2px] ${resolvedLightTheme ? "bg-[#13201D]" : "bg-[#F4F1EA]"} group-hover:bg-[#C5A059] transition-colors`} />
            </button>
          </div>
        </div>
      </header>

      <NavMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} isLightTheme={resolvedLightTheme} />

      <main>{children}</main>

      {/* Footer */}
      <footer className="relative overflow-hidden" style={{ borderTop: "1px solid #2D2E2E" }}>
        {/* Giant name watermark */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden">
          <h2
            className="font-serif text-[18vw] font-bold leading-none whitespace-nowrap opacity-[0.03]"
            style={{ color: "#F4F1EA" }}
          >
            HERMIDA MAIA
          </h2>
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-6 pt-20 pb-10">
          <div className="grid gap-12 lg:grid-cols-4 mb-16">
            {/* Coluna 1: Institucional */}
            <div className="lg:col-span-1">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 flex items-center justify-center border border-[#C5A059]/40">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C5A059" strokeWidth="1.5">
                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                    <path d="M2 17l10 5 10-5" />
                    <path d="M2 12l10 5 10-5" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-bold tracking-[0.1em] uppercase leading-none">Hermida Maia</h2>
                  <p className="text-[9px] font-semibold tracking-[0.25em] uppercase" style={{ color: "#C5A059" }}>Advocacia</p>
                </div>
              </div>
              <p className="text-sm leading-relaxed mb-8 opacity-50">
                Escritório especializado na Defesa do Devedor e Superendividamento com atuação em todo o território nacional.
              </p>
            </div>

            {/* Coluna 2: Navegação */}
            <div>
              <h4 className="text-xs font-semibold tracking-[0.2em] uppercase mb-8" style={{ color: "#C5A059" }}>Navegação</h4>
              <ul className="space-y-4 text-sm opacity-50">
                {NAV_ITEMS.filter(item => item.label !== "FAQ").map((item) => {
                  const isActive = router.pathname === item.href || (item.href === "/servicos" && router.pathname.startsWith("/servicos"));
                  return (
                    <li key={item.label}>
                      <Link href={item.href} legacyBehavior>
                        <a className={`hover:text-[#C5A059] hover:opacity-100 transition-all ${isActive ? "text-[#C5A059] opacity-100" : ""}`}>
                          {item.label}
                        </a>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Coluna 3: Recursos */}
            <div>
              <h4 className="text-xs font-semibold tracking-[0.2em] uppercase mb-8" style={{ color: "#C5A059" }}>Recursos</h4>
              <ul className="space-y-4 text-sm opacity-50">
                <li><a href="https://hmdesk.freshdesk.com/support/login" target="_blank" rel="noopener noreferrer" className="hover:text-[#C5A059] hover:opacity-100 transition-all">Área do Cliente</a></li>
                <li><a href="https://hmdesk.freshdesk.com/support/home" target="_blank" rel="noopener noreferrer" className="hover:text-[#C5A059] hover:opacity-100 transition-all">Central de Ajuda</a></li>
                <li><a href="https://hmdesk.freshdesk.com/support/tickets/new" target="_blank" rel="noopener noreferrer" className="hover:text-[#C5A059] hover:opacity-100 transition-all">Enviar um ticket</a></li>
                <li><a href="https://hmdesk.freshdesk.com/support/tickets" target="_blank" rel="noopener noreferrer" className="hover:text-[#C5A059] hover:opacity-100 transition-all">Meus Tickets</a></li>
                <li><a href="https://billing.stripe.com/p/login/eVa5og2B39i37MA144" target="_blank" rel="noopener noreferrer" className="hover:text-[#C5A059] hover:opacity-100 transition-all">2ª de Faturas</a></li>
                <li><a href="https://comunica.pje.jus.br/" target="_blank" rel="noopener noreferrer" className="hover:text-[#C5A059] hover:opacity-100 transition-all">Comunicações Processuais</a></li>
              </ul>
            </div>

            {/* Coluna 4: Contato (à direita) */}
            <div>
              <h4 className="text-xs font-semibold tracking-[0.2em] uppercase mb-8" style={{ color: "#C5A059" }}>Contato</h4>
              <ul className="space-y-5 text-sm opacity-50">
                <li className="flex items-start gap-3">
                  <span className="text-[#C5A059] opacity-100 mt-0.5">↗</span>
                  <span>Av. Dolores Alcaraz Caldas, 90, 8º Andar – Praia de Belas, CEP 90110-180 - Porto Alegre/ RS</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="text-[#C5A059] opacity-100">✆</span>
                  <span>(51) 3181-0323</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="text-[#C5A059] opacity-100">✉</span>
                  <span>suporte@hermidamaia.adv.br</span>
                </li>
                <li>
                  <div className="mt-2">
                    <h4 className="text-xs font-semibold tracking-[0.2em] uppercase mb-2" style={{ color: "#C5A059" }}>Horário</h4>
                    <div className="text-sm opacity-50 space-y-2">
                      <p>Seg — Sex: 08h às 18h</p>
                      <p>Sáb: 09h às 13h</p>
                      <p className="mt-4 text-xs">Atendimento emergencial 24h para clientes.</p>
                    </div>
                  </div>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-8 flex flex-col md:flex-row justify-between items-center gap-6" style={{ borderTop: "1px solid #2D2E2E" }}>
            <p className="text-xs opacity-30">
              © 2025 Hermida Maia Advocacia. Todos os direitos reservados. OAB/RS 107048
            </p>
            <div className="flex gap-8 text-xs opacity-30">
              <a className="hover:opacity-100 hover:text-[#C5A059] transition-all" href="#">Termos</a>
              <a className="hover:opacity-100 hover:text-[#C5A059] transition-all" href="#">Privacidade</a>
              <a className="hover:opacity-100 hover:text-[#C5A059] transition-all" href="#">Compliance</a>
            </div>
          </div>
        </div>
      </footer>
      <WhatsappWidgetCircle />
    </div>
  );
}
