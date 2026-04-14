import { useInternalTheme } from "../InternalThemeProvider";

function InfoPill({ children }) {
  const { isLightTheme } = useInternalTheme();
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>{children}</span>;
}

export default function AITaskTaskDetail({ routePath, selectedTask }) {
  const { isLightTheme } = useInternalTheme();
  if (!selectedTask) return null;

  return (
    <section className={`rounded-[22px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-[10px] uppercase tracking-[0.2em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Plano da tarefa</p>
          <p className={`mt-2 text-base font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{selectedTask.title}</p>
          <p className={`mt-2 text-sm leading-6 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>{selectedTask.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <InfoPill>Status {selectedTask.status}</InfoPill>
          <InfoPill>Prioridade {selectedTask.priority}</InfoPill>
          <InfoPill>{selectedTask.assignedAgent || "Dotobot"}</InfoPill>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className={`rounded-[18px] border p-3 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F] bg-[rgba(7,9,8,0.76)]"}`}>
          <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Dependências</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(selectedTask.dependencies || []).length ? selectedTask.dependencies.map((item) => <InfoPill key={item}>{item}</InfoPill>) : <p className={`text-xs ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>Nenhuma dependência direta.</p>}
          </div>
        </div>

        <div className={`rounded-[18px] border p-3 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F] bg-[rgba(7,9,8,0.76)]"}`}>
          <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Escopo</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(selectedTask.moduleKeys || []).length ? selectedTask.moduleKeys.map((item) => <InfoPill key={item}>{item}</InfoPill>) : <InfoPill>{routePath || "/interno/ai-task"}</InfoPill>}
          </div>
        </div>
      </div>
    </section>
  );
}
