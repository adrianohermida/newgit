import RequireAdmin from "../../components/interno/RequireAdmin";
import InternoLayout from "../../components/interno/InternoLayout";
import DotobotCopilot from "../../components/interno/DotobotPanel";

export default function InternoCopilotPage() {
  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="Copilot"
          description="Cockpit conversacional do Dotobot integrado ao shell interno, com histórico, AI Task, AgentLab e contexto operacional no mesmo fluxo."
          hideDotobotRail={true}
        >
          <div className="min-h-0 flex-1 overflow-hidden">
            <DotobotCopilot
              profile={profile}
              routePath="/interno/copilot"
              initialWorkspaceOpen={true}
              defaultCollapsed={false}
              compactRail={false}
              showCollapsedTrigger={false}
              embeddedInInternoShell={true}
            />
          </div>
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}
