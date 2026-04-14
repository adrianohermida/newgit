import { useState } from "react";
import AITaskProductShell from "./AITaskProductShell";
import ConfirmModal from "./ConfirmModal";
import useAiTaskModuleController from "./useAiTaskModuleController";

export default function AITaskModule({ profile, routePath }) {
  const [stopModalOpen, setStopModalOpen] = useState(false);
  const { derived, runState, shellProps, uiState, workspace } = useAiTaskModuleController({
    profile,
    routePath,
    openStopModal: () => setStopModalOpen(true),
  });

  return (
    <div>
      <AITaskProductShell
        headerProps={shellProps.headerProps}
        selectedTaskId={workspace.selectedTaskId}
        selectedTask={derived.selectedTask}
        setSelectedTaskId={workspace.setSelectedTaskId}
        hasMoreTasks={derived.hasMoreTasks}
        onLoadMoreTasks={() => uiState.setTaskVisibleCount((current) => Math.min(workspace.tasks.length, current + 8))}
        taskColumns={derived.taskColumns}
        tasks={workspace.tasks}
        visibleTasks={derived.visibleTasks}
        executionProps={shellProps.executionProps}
        runsPaneProps={shellProps.runsPaneProps}
        contextRailProps={shellProps.contextRailProps}
      />
      <ConfirmModal
        open={stopModalOpen}
        title="Parar execução atual"
        body="Esta ação interrompe a run ativa, marca as tarefas em andamento como interrompidas e encerra o acompanhamento atual."
        confirmLabel="Parar execução"
        cancelLabel="Voltar"
        onCancel={() => setStopModalOpen(false)}
        onConfirm={async () => {
          setStopModalOpen(false);
          await runState.handleStop();
        }}
      />
    </div>
  );
}
