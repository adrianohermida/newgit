import { getModulePlaybook } from "./consolePlaybooks";

function toneClass(isLightTheme, tone) {
  if (tone === "danger") return isLightTheme ? "text-[#B25E5E]" : "text-red-200";
  if (tone === "warn") return "text-[#D9B46A]";
  return "text-[#11D473]";
}

export default function InternoConsoleOverviewTab(props) {
  const { coverageCards, coverageSummary, frontendIssues, handleOpenModuleAlert, isLightTheme, moduleAlerts, schemaIssues, setConsoleOpen, setConsoleTab, setLogPane, updateFilters, setLogSearch } = props;
  return <div className="space-y-3">
    <div className="grid gap-3 md:grid-cols-4">
      {[{ label: "Snapshots", value: coverageCards.length, helper: "Modulos e shells publicados no console." }, { label: "Rotas cobertas", value: coverageSummary.routeCount, helper: "Rotas com telemetria ou snapshot ativo." }, { label: "Com erro", value: coverageSummary.errorCount, helper: "Snapshots que reportaram falha visivel." }, { label: "Issues abertas", value: frontendIssues.length + schemaIssues.length, helper: "UX e schema consolidados no workspace." }].map((item) => <div key={item.label} className={`rounded-xl border p-3 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#1E2E29] bg-[rgba(10,12,11,0.6)]"}`}>
        <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>{item.label}</p>
        <p className={`mt-2 text-lg font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{item.value}</p>
        <p className={`mt-1 text-[11px] ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>{item.helper}</p>
      </div>)}
    </div>
    <div className={`rounded-xl border p-3 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#6B7C88]" : "border-[#1E2E29] bg-[rgba(10,12,11,0.6)] text-[#9BAEA8]"}`}>
      <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Cobertura ativa</p>
      <p className="mt-2">O console agora agrega snapshots do app shell, layouts publico e portal, shell interno e modulos operacionais. Isso substitui o placeholder anterior e cria uma base unica para expansao da cobertura por pagina e componente.</p>
    </div>
    <div className="grid gap-3 xl:grid-cols-2">
      {coverageCards.length ? coverageCards.map((item) => <div key={item.key} className={`rounded-xl border p-3 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#1E2E29] bg-[rgba(8,10,9,0.55)]"}`}>
        {moduleAlerts.has(item.key) ? <div className={`mb-3 rounded-lg border px-3 py-2 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F] bg-[rgba(10,12,11,0.45)]"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Alerta do modulo</span>
            <span className={toneClass(isLightTheme, moduleAlerts.get(item.key)?.tone)}>{moduleAlerts.get(item.key)?.tone === "danger" ? "critico" : moduleAlerts.get(item.key)?.tone === "warn" ? "monitorar" : "estavel"}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
            <span className={`rounded-full border px-2 py-0.5 ${isLightTheme ? "border-[#F0CACA] bg-white text-[#B25E5E]" : "border-[#5B2D2D] text-[#FECACA]"}`}>erros {moduleAlerts.get(item.key)?.errors || 0}</span>
            <span className={`rounded-full border px-2 py-0.5 ${isLightTheme ? "border-[#F3DEB0] bg-white text-[#A46A14]" : "border-[#6E5630] text-[#FDE68A]"}`}>warn {moduleAlerts.get(item.key)?.warnings || 0}</span>
            <span className={`rounded-full border px-2 py-0.5 ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#E6E0D3]"}`}>abertos {moduleAlerts.get(item.key)?.recurringOpen || 0}</span>
            <span className={`rounded-full border px-2 py-0.5 ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#E6E0D3]"}`}>acima 72h {moduleAlerts.get(item.key)?.stale || 0}</span>
          </div>
          {moduleAlerts.get(item.key)?.safeWindow ? <div className={`mt-3 rounded-lg border px-3 py-2 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(8,10,9,0.45)]"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>{moduleAlerts.get(item.key).safeWindow.blocked ? "trava preventiva" : "janela segura"}</span>
              <div className="flex flex-wrap gap-2 text-[10px]">{moduleAlerts.get(item.key).safeWindow.chips.map((chip) => <span key={`${item.key}_${chip}`} className={`rounded-full border px-2 py-0.5 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#51606B]" : "border-[#22342F] text-[#E6E0D3]"}`}>{chip}</span>)}</div>
            </div>
            <p className={`mt-2 ${isLightTheme ? "text-[#5B6670]" : "text-[#C7D0CA]"}`}>{moduleAlerts.get(item.key).safeWindow.summary}</p>
          </div> : null}
          {getModulePlaybook(item.key)?.checklist?.length ? <div className={`mt-3 space-y-1 text-[11px] ${isLightTheme ? "text-[#5B6670]" : "text-[#C7D0CA]"}`}>{getModulePlaybook(item.key).checklist.map((step) => <div key={`${item.key}_${step}`} className={`rounded-lg border px-2 py-1.5 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#1E2E29] bg-[rgba(8,10,9,0.45)]"}`}>{step}</div>)}</div> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => handleOpenModuleAlert(item.key)} className="rounded-full border border-[#C5A059] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#F4E7C2]">Abrir trilha guiada</button>
            <button type="button" onClick={() => { setConsoleOpen(true); setConsoleTab("log"); setLogPane("activity"); updateFilters({ module: item.key }); setLogSearch(""); }} className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}>Ver atividade</button>
          </div>
        </div> : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>{item.key}</p><p className={`mt-1 font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{item.routePath || "sem rota declarada"}</p></div>
          <span className={toneClass(isLightTheme, item.tone)}>{item.tone === "danger" ? "erro" : item.tone === "warn" ? "atencao" : "ok"}</span>
        </div>
        <p className={`mt-2 ${isLightTheme ? "text-[#5B6670]" : "text-[#C7D0CA]"}`}>{item.summary}</p>
        <div className={`mt-2 text-[10px] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7E918B]"}`}>Atualizado em {item.updatedAt ? new Date(item.updatedAt).toLocaleString("pt-BR") : "sem horario"}</div>
        {item.capabilities?.length ? <div className="mt-2 flex flex-wrap gap-1.5">{item.capabilities.slice(0, 4).map((capability) => <span key={`${item.key}_${capability}`} className={`rounded-full border px-2 py-0.5 text-[10px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}>{capability}</span>)}</div> : null}
        {item.consoleTags?.length ? <div className="mt-2 flex flex-wrap gap-1.5">{item.consoleTags.slice(0, 4).map((tag) => <span key={`${item.key}_${tag}`} className="rounded-full border border-[#3C3320] px-2 py-0.5 text-[10px] text-[#E7C987]">#{tag}</span>)}</div> : null}
        {item.quickActions?.length ? <div className="mt-2 flex flex-wrap gap-1.5">{item.quickActions.slice(0, 2).map((action) => <span key={`${item.key}_${action.id}`} className={`rounded-full border px-2 py-0.5 text-[10px] ${isLightTheme ? "border-[#CFE2DA] bg-[#F4FBF8] text-[#4D7A69]" : "border-[#35554B] text-[#B7D5CB]"}`}>{action.label}</span>)}</div> : null}
      </div>) : <div className={`rounded-xl border p-3 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88]" : "border-[#1E2E29] bg-[rgba(8,10,9,0.55)] text-[#9BAEA8]"}`}>Nenhum snapshot publicado ainda.</div>}
    </div>
  </div>;
}
