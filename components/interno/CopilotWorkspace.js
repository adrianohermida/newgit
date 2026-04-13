import DotobotCopilot from "./DotobotPanel";

export default function CopilotWorkspace({ profile }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-[#16211E] bg-[linear-gradient(180deg,rgba(6,8,7,0.98),rgba(8,10,9,0.96))] shadow-[0_24px_64px_rgba(0,0,0,0.28)]">
      <div className="border-b border-[#1E2B27] px-4 py-3 md:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Copilot Workspace</p>
            <p className="mt-1 truncate text-sm text-[#C6D1CC]">Historico a esquerda, conversa ao centro e modulos a direita dentro do shell interno.</p>
          </div>
          <div className="hidden flex-wrap gap-2 text-[11px] md:flex">
            <span className="rounded-full border border-[#22342F] px-3 py-1 text-[#D8DEDA]">Chat-first</span>
            <span className="rounded-full border border-[#22342F] px-3 py-1 text-[#D8DEDA]">AI Task</span>
            <span className="rounded-full border border-[#22342F] px-3 py-1 text-[#D8DEDA]">AgentLabs</span>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden p-2 md:p-3">
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
