import DotobotCopilot from "./DotobotPanel";

export default function CopilotWorkspace({ profile }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-[#16211E] bg-[linear-gradient(180deg,rgba(6,8,7,0.98),rgba(8,10,9,0.96))] shadow-[0_24px_64px_rgba(0,0,0,0.28)]">
      <div className="border-b border-[#1E2B27] px-4 py-4 md:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-[#7F928C]">Copilot Workspace</p>
            <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-[#F5F1E8]">Dotobot centralizado no shell interno</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-[#9BAEA8]">
              Histórico à esquerda, conversa ao centro e módulos operacionais na barra lateral direita, mantendo o tema e a persistência visual do ambiente interno.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-full border border-[#22342F] px-3 py-1.5 text-[#D8DEDA]">Windows 11 inspired</span>
            <span className="rounded-full border border-[#22342F] px-3 py-1.5 text-[#D8DEDA]">Chat-first</span>
            <span className="rounded-full border border-[#22342F] px-3 py-1.5 text-[#D8DEDA]">AI Task + AgentLabs</span>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden p-3 md:p-4">
        <DotobotCopilot
          profile={profile}
          routePath="/interno/copilot"
          initialWorkspaceOpen={true}
          defaultCollapsed={false}
          compactRail={false}
          showCollapsedTrigger={false}
          embeddedInInternoShell={true}
          focusedWorkspaceMode={true}
        />
      </div>
    </div>
  );
}
