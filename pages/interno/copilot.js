import InternoLayout from "../../components/interno/InternoLayout";
import RequireAdmin from "../../components/interno/RequireAdmin";
import DotobotCopilot from "../../components/interno/DotobotPanel";

export default function InternoCopilotPage() {
  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="Dotobot Copilot"
          description="Painel fullscreen do Dotobot local, com histórico contextual, chat central e hub operacional inspirado no Windows 11."
          hideDotobotRail={true}
        >
          <div className="flex min-h-[calc(100vh-12rem)] overflow-hidden rounded-[30px] border border-[#1C2623] bg-[linear-gradient(180deg,rgba(11,15,14,0.98),rgba(7,10,9,0.98))] shadow-[0_24px_64px_rgba(0,0,0,0.24)]">
            <DotobotCopilot
              profile={profile}
              routePath="/interno/copilot"
              initialWorkspaceOpen={true}
              defaultCollapsed={false}
              compactRail={false}
              showCollapsedTrigger={false}
            />
          </div>
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}
