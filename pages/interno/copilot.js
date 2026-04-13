import RequireAdmin from "../../components/interno/RequireAdmin";
import DotobotCopilot from "../../components/interno/DotobotPanel";

export default function InternoCopilotPage() {
  return (
    <RequireAdmin>
      {(profile) => (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(197,160,89,0.14),transparent_34%),linear-gradient(180deg,#0a0f0d_0%,#060908_100%)] px-3 py-3 text-[#F5F1E8] sm:px-4 sm:py-4">
          <div className="mx-auto flex min-h-[calc(100vh-1.5rem)] w-full max-w-[1900px] overflow-hidden rounded-[30px] border border-[#1C2623] bg-[linear-gradient(180deg,rgba(12,16,15,0.98),rgba(6,8,8,0.98))] shadow-[0_24px_80px_rgba(0,0,0,0.32)] sm:min-h-[calc(100vh-2rem)]">
            <DotobotCopilot
              profile={profile}
              routePath="/interno/copilot"
              initialWorkspaceOpen={true}
              defaultCollapsed={false}
              compactRail={false}
              showCollapsedTrigger={false}
            />
          </div>
        </div>
      )}
    </RequireAdmin>
  );
}
