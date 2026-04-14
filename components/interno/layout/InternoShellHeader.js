import InternoUserAvatarMenu from "./InternoUserAvatarMenu";

const actionButtonClass = (isLightTheme, active = false) =>
  `flex h-10 w-10 items-center justify-center rounded-[12px] border transition ${
    active
      ? isLightTheme
        ? "border-[#C5A059] bg-[#FFF4DC] text-[#9A6E2D]"
        : "border-[#C5A059] bg-[rgba(197,160,89,0.10)] text-[#F3D69A]"
      : isLightTheme
        ? "border-[#D4DEE8] bg-[rgba(255,255,255,0.92)] text-[#22312F] hover:border-[#C5A059] hover:text-[#C5A059]"
        : "border-[#22342F] bg-[rgba(255,255,255,0.02)] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"
  }`;

function HeaderIconButton({ active = false, children, isLightTheme, onClick, title }) {
  return (
    <button type="button" onClick={onClick} className={actionButtonClass(isLightTheme, active)} title={title}>
      <span className="sr-only">{title}</span>
      {children}
    </button>
  );
}

export default function InternoShellHeader(props) {
  const {
    consoleOpen,
    handleHeaderSearchSelect,
    handleSignOut,
    handleToggleRightRail,
    headerSearch,
    headerSearchRef,
    headerSearchResults,
    isCopilotWorkspace,
    isLightTheme,
    leftCollapsed,
    onChangeHeaderSearch,
    onOpenSettings,
    onToggleConsole,
    onToggleLeftCollapsed,
    onToggleUserMenu,
    profile,
    rightRailOpen,
    router,
    setUserMenuOpen,
    toggleTheme,
    userMenuOpen,
    userMenuRef,
  } = props;

  const menuItems = [
    { key: "account", label: "Definicoes de conta", action: () => router.push("/portal/perfil") },
    { key: "settings", label: "Configuracoes", action: onOpenSettings },
    { key: "signout", label: "Sair", action: handleSignOut },
  ];

  return (
    <div
      className={`sticky top-0 z-20 shrink-0 border-b px-4 py-3 md:px-5 ${
        isLightTheme
          ? "border-[#D7DEE8] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,249,251,0.94))]"
          : "border-[#1E2E29] bg-[linear-gradient(180deg,rgba(8,10,9,0.995),rgba(7,9,8,0.97))]"
      }`}
    >
      <div className="grid grid-cols-1 items-center gap-3 lg:grid-cols-[minmax(180px,0.7fr)_minmax(340px,720px)_auto]">
        <div className="hidden min-w-0 lg:block">
          <p className="text-[10px] uppercase tracking-[0.24em] text-[#C5A059]">Interno</p>
          <p className={`truncate text-xs ${isLightTheme ? "text-[#60707D]" : "text-[#9BAEA8]"}`}>{router.pathname}</p>
        </div>

        <div ref={headerSearchRef} className="relative mx-auto w-full max-w-[720px]">
          <div
            className={`flex h-11 items-center gap-3 rounded-[14px] border px-3 ${
              isLightTheme
                ? "border-[#D5DEE9] bg-[rgba(255,255,255,0.92)]"
                : "border-[#22342F] bg-[linear-gradient(180deg,rgba(12,15,14,0.90),rgba(8,10,9,0.92))]"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              className={`h-4 w-4 shrink-0 ${isLightTheme ? "text-[#7C8C98]" : "text-[#7F928C]"}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="text"
              value={headerSearch}
              onChange={(event) => onChangeHeaderSearch(event.target.value)}
              placeholder="Busca global"
              className={`w-full bg-transparent text-sm outline-none ${
                isLightTheme ? "text-[#22312F] placeholder:text-[#8A99A7]" : "text-[#F4F1EA] placeholder:text-[#60706A]"
              }`}
            />
          </div>
          {headerSearchResults.length ? (
            <div
              className={`absolute left-0 right-0 top-[calc(100%+8px)] z-40 overflow-hidden rounded-[18px] border shadow-[0_22px_44px_rgba(0,0,0,0.18)] ${
                isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(10,12,11,0.98)]"
              }`}
            >
              {headerSearchResults.map((result) => (
                <button
                  key={result.key}
                  type="button"
                  onClick={() => handleHeaderSearchSelect(result)}
                  className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left text-sm transition ${
                    isLightTheme ? "hover:bg-[#F7F9FC]" : "hover:bg-[rgba(255,255,255,0.03)]"
                  }`}
                >
                  <div className="min-w-0">
                    <p className={`truncate font-medium ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{result.label}</p>
                    <p className={`mt-1 truncate text-[11px] ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>{result.helper}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${
                      isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"
                    }`}
                  >
                    {result.type}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2">
          <HeaderIconButton
            active={!leftCollapsed}
            isLightTheme={isLightTheme}
            onClick={onToggleLeftCollapsed}
            title={leftCollapsed ? "Abrir sidebar esquerda" : "Fechar sidebar esquerda"}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M9 4v16" />
              {leftCollapsed ? <path d="m13 12 3-3v6l-3-3Z" /> : <path d="m11 12 3-3v6l-3-3Z" />}
            </svg>
          </HeaderIconButton>

          <HeaderIconButton
            active={consoleOpen}
            isLightTheme={isLightTheme}
            onClick={onToggleConsole}
            title={consoleOpen ? "Fechar console" : "Abrir console"}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M3 15h18" />
              {consoleOpen ? <path d="m10 11 2-2 2 2" /> : <path d="m10 9 2 2 2-2" />}
            </svg>
          </HeaderIconButton>

          {!isCopilotWorkspace ? (
            <HeaderIconButton
              active={rightRailOpen}
              isLightTheme={isLightTheme}
              onClick={handleToggleRightRail}
              title={rightRailOpen ? "Fechar painel direito" : "Abrir painel direito"}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M15 4v16" />
                {rightRailOpen ? <path d="m11 12 2-2v4l-2-2Z" /> : <path d="m13 12-2-2v4l2-2Z" />}
              </svg>
            </HeaderIconButton>
          ) : null}

          <HeaderIconButton
            isLightTheme={isLightTheme}
            onClick={toggleTheme}
            title={isLightTheme ? "Ativar modo escuro" : "Ativar modo claro"}
          >
            {isLightTheme ? (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2.5" />
                <path d="M12 19.5V22" />
                <path d="M4.93 4.93l1.77 1.77" />
                <path d="M17.3 17.3l1.77 1.77" />
                <path d="M2 12h2.5" />
                <path d="M19.5 12H22" />
                <path d="M4.93 19.07l1.77-1.77" />
                <path d="M17.3 6.7l1.77-1.77" />
              </svg>
            )}
          </HeaderIconButton>

          <InternoUserAvatarMenu
            isLightTheme={isLightTheme}
            menuItems={menuItems}
            onClose={() => setUserMenuOpen(false)}
            onToggle={onToggleUserMenu}
            open={userMenuOpen}
            profile={profile}
            userMenuRef={userMenuRef}
          />
        </div>
      </div>
    </div>
  );
}
