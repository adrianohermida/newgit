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
      description="Assistente central do produto para conversar, organizar contexto e avancar com mais agilidade."
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
