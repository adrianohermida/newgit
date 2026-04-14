import InternoLayout from "../../components/interno/InternoLayout";
import RequireAdmin from "../../components/interno/RequireAdmin";
import AITaskModule from "../../components/interno/aitask/AITaskModule";

export default function AITaskPage() {
  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="AI Task"
          description="Centro de execucao assistida para transformar pedidos em tarefas, entregas e proximos passos."
          hideDotobotRail
        >
          <AITaskModule profile={profile} routePath="/interno/ai-task" />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}
