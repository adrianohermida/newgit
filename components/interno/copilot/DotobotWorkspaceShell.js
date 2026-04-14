import DotobotToastStack from "./DotobotToastStack";
import DotobotWorkspaceGrid from "./DotobotWorkspaceGrid";

function WorkspaceSummary(props) {
  const { activeConversationTitle, activeProjectLabel, activeStatus, isLightTheme, onResetChat } = props;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-3 py-1.5 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>{activeProjectLabel}</span>
            <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] ${activeStatus === "processing" ? "border-[#8b6f33] text-[#D9B46A]" : "border-[#234034] text-[#80C7A1]"}`}>
              <span className={`h-2 w-2 rounded-full ${activeStatus === "processing" ? "bg-[#D9B46A]" : "bg-[#80C7A1]"}`} />
              {activeStatus === "processing" ? "Processando" : "Online"}
            </span>
          </div>
          <p className={`mt-3 truncate text-base font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{activeConversationTitle || "Nova conversa"}</p>
          <p className={`mt-1 text-sm leading-6 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>Fluxo de conversa contínua com histórico lateral e módulos de apoio no rail direito.</p>
        </div>
        <button
          type="button"
          onClick={onResetChat}
          className={`rounded-full border px-4 py-2 text-xs transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
        >
          Nova conversa
        </button>
      </div>
    </div>
  );
}

export default function DotobotWorkspaceShell(props) {
  const {
    activeConversationTitle,
    activeProjectLabel,
    activeStatus,
    dismissUiToast,
    embeddedInInternoShell,
    focusedShellContentClass,
    gridGapClass,
    gridTemplateClass,
    headerNode,
    historyNode,
    isFocusedCopilotShell,
    isLightTheme,
    outerClassName,
    shellClassName,
    suppressInnerChrome,
    uiToasts,
    onResetChat,
    rightNode,
    centerNode,
  } = props;

  return (
    <div className={`${outerClassName} ${isLightTheme ? "text-[#152421]" : "text-[#F4F1EA]"}`}>
      <div className={`${embeddedInInternoShell ? "flex h-full w-full flex-col" : shellClassName} transition-[max-width,width] duration-300 ease-out`}>
        <style jsx>{`
          .dotobot-panel-tab-enter { opacity: 0; transform: translateY(10px) scale(0.985); }
          .dotobot-panel-tab-enter-active { opacity: 1; transform: translateY(0) scale(1); transition: opacity 180ms ease, transform 180ms ease; }
          .dotobot-panel-tab-exit { opacity: 1; transform: translateY(0) scale(1); }
          .dotobot-panel-tab-exit-active { opacity: 0; transform: translateY(-6px) scale(0.99); transition: opacity 140ms ease, transform 140ms ease; }
        `}</style>
        <DotobotToastStack dismissUiToast={dismissUiToast} uiToasts={uiToasts} />
        {!suppressInnerChrome ? (
          <header className={`border-b backdrop-blur-xl ${isLightTheme ? "border-[#D7DEE8] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,248,252,0.96))]" : "border-[#22342F]/80 bg-[linear-gradient(180deg,rgba(11,14,13,0.82),rgba(7,10,9,0.78))]"} ${isFocusedCopilotShell ? "px-4 py-3 md:px-5" : "px-4 py-4 md:px-5"}`}>
            {isFocusedCopilotShell && !headerNode ? <WorkspaceSummary activeConversationTitle={activeConversationTitle} activeProjectLabel={activeProjectLabel} activeStatus={activeStatus} isLightTheme={isLightTheme} onResetChat={onResetChat} /> : null}
            {headerNode}
          </header>
        ) : null}
        <DotobotWorkspaceGrid
          centerNode={centerNode}
          focusedShellContentClass={focusedShellContentClass}
          gridGapClass={gridGapClass}
          gridTemplateClass={gridTemplateClass}
          historyNode={historyNode}
          rightNode={rightNode}
        />
      </div>
    </div>
  );
}
