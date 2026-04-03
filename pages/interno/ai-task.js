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
          description="Painel central de orquestracao da IA no Lawdesk. Planejamento, execucao, validacao e controle humano em tempo real."
          hideDotobotRail
        >
          <AITaskModule profile={profile} routePath="/interno/ai-task" />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}
