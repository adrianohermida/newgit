import RequireAdmin from "../../components/interno/RequireAdmin";
import InternoLayout from "../../components/interno/InternoLayout";
import CopilotWorkspace from "../../components/interno/CopilotWorkspace";

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
            <CopilotWorkspace profile={profile} />
          </div>
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}
