import InternoLayout from "../../components/interno/InternoLayout";
import RequireAdmin from "../../components/interno/RequireAdmin";
import AITaskModule from "../../components/interno/aitask/AITaskModule";

export default function AITaskPage() {
  const enableFullscreenSidebar = process.env.NEXT_PUBLIC_ENABLE_AI_TASK_FULLSCREEN_SIDEBAR === "true";

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="AI Task"
          description="Painel central de orquestracao da IA no Lawdesk. Planejamento, execucao, validacao e controle humano em tempo real."
          hideDotobotRail={!enableFullscreenSidebar}
          forceDotobotRail={enableFullscreenSidebar}
          rightRailFullscreen={enableFullscreenSidebar}
        >
          <AITaskModule profile={profile} routePath="/interno/ai-task" />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}
