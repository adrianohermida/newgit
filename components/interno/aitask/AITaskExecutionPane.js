import Bubble from "./Bubble";
import AITaskActionBar from "./AITaskActionBar";
import AITaskActivityPanel from "./AITaskActivityPanel";
import AITaskTaskDetail from "./AITaskTaskDetail";
import ConversationComposer from "./ConversationComposer";
import { useInternalTheme } from "../InternalThemeProvider";

export default function AITaskExecutionPane(props) {
  const { isLightTheme } = useInternalTheme();
  const { activeRun, attachments, compactLogs, error, handleAttachmentChange, handleAttachmentDrop, handleContinueLastRun, handleMissionChange, handleQuickMission, handleReplay, handleSendToDotobot, handleStart, latestResult, mission, missionInputRef, moduleDrivenQuickMissions, nowIso, paused, routePath, selectedTask, thinking } = props;

  return (
    <section className={`flex min-h-[620px] min-w-0 flex-col overflow-hidden rounded-[28px] border ${isLightTheme ? "border-[#D7DEE8] bg-[rgba(255,255,255,0.82)]" : "border-[#22342F] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))]"}`}>
      <div className={`border-b px-5 py-4 ${isLightTheme ? "border-[#D7DEE8] bg-white/70" : "border-[#1B2925] bg-[rgba(255,255,255,0.015)]"}`}>
        <p className={`text-[10px] uppercase tracking-[0.22em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Tarefa ativa</p>
        <p className={`mt-2 text-lg font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{selectedTask?.title || "Nenhuma tarefa selecionada"}</p>
        <p className={`mt-1 text-sm leading-6 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>{selectedTask?.description || "Selecione uma tarefa para executar, revisar ou continuar."}</p>
      </div>
      <div className="min-h-[280px] flex-1 space-y-3 overflow-y-auto px-4 py-4 md:px-5">
        {mission ? <Bubble role="user" title="Missao" body={mission} time={activeRun?.startedAt || nowIso()} /> : null}
        <AITaskActionBar activeRun={activeRun} compactLogs={compactLogs} handleContinueLastRun={handleContinueLastRun} handleReplay={handleReplay} handleSendToDotobot={handleSendToDotobot} handleStart={handleStart} paused={paused} routePath={routePath} selectedTask={selectedTask} thinking={thinking} />
        <AITaskTaskDetail routePath={routePath} selectedTask={selectedTask} />
        {latestResult ? <Bubble role="assistant" title="Hermida Maia IA" body={typeof latestResult === "string" ? latestResult : "Resultado estruturado entregue."} time={nowIso()} /> : null}
        {activeRun ? <Bubble role="system" title="Execucao" body="Run em andamento com auditoria incremental." details={[`Run: ${activeRun.id}`, `Rota: ${routePath || "/interno/ai-task"}`]} time={nowIso()} /> : null}
        <AITaskActivityPanel compactLogs={compactLogs} thinking={thinking} />
      </div>
      <ConversationComposer mission={mission} missionInputRef={missionInputRef} handleMissionChange={handleMissionChange} handleStart={handleStart} handleAttachmentChange={handleAttachmentChange} handleAttachmentDrop={handleAttachmentDrop} attachments={attachments} error={error} quickMissions={moduleDrivenQuickMissions} handleQuickMission={handleQuickMission} />
    </section>
  );
}
