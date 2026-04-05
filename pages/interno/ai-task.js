import InternoLayout from "../../components/interno/InternoLayout";
import RequireAdmin from "../../components/interno/RequireAdmin";
import AITaskModule from "../../components/interno/aitask/AITaskModule";

export default function AITaskPage() {
  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="AI Task Hermida Maia"
          description="Central operacional da Hermida Maia Advocacia para conversa, contexto juridico, execucao assistida e controle de tarefas em tempo real."
          hideDotobotRail
        >
          <AITaskModule profile={profile} routePath="/interno/ai-task" />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}
