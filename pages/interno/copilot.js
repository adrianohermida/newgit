import RequireAdmin from "../../components/interno/RequireAdmin";
import CopilotWorkspace from "../../components/interno/CopilotWorkspace";
import { CopilotShell } from "../../components/interno/copilot";

export default function InternoCopilotPage() {
  return (
    <RequireAdmin>
      {(profile) => (
        <CopilotShell profile={profile}>
          <div className="min-h-0 flex-1 overflow-hidden">
            <CopilotWorkspace profile={profile} />
          </div>
        </CopilotShell>
      )}
    </RequireAdmin>
  );
}
