import { downloadText } from "./setupConfig";

function PreviewNotice({ accessMode, canRunCommands, canServerSaveSetup, setupMode }) {
  return <div className={`mt-6 border px-5 py-4 text-sm leading-7 ${setupMode === "local-ops" ? "border-[#245440] bg-[rgba(36,84,64,0.18)] text-[#CFEBDC]" : "border-[#6F5830] bg-[rgba(111,88,48,0.18)] text-[#F0DEC0]"}`}>
    <p className="text-[11px] uppercase tracking-[0.22em]">{setupMode === "local-ops" ? "Modo local-ops" : "Modo static-safe"}</p>
    <p className="mt-2">{setupMode === "local-ops" ? "Este runtime pode operar o setup localmente, com salvar no repo e execucao via interface quando as flags estiverem habilitadas." : "Este runtime foi tratado como frontend seguro para deploy estatico. O fluxo recomendado e baixar os arquivos e executar os comandos no terminal local."}</p>
    <p className="mt-2">{accessMode === "admin" ? "Sessao administrativa detectada: recursos operacionais adicionais podem ser habilitados pelo runtime." : "Sem sessao admin: a pagina permanece utilizavel para preview, checklist e download local dos arquivos de setup."}</p>
    {!canServerSaveSetup ? <p className="mt-2">Salvar no repo local fica desabilitado neste runtime.</p> : null}
    {!canRunCommands ? <p className="mt-2">Os botoes de execucao ficam desabilitados neste runtime.</p> : null}
  </div>;
}

function PreviewFiles({ activeFile, files, setActiveFile }) {
  return <>
    <div className="flex flex-wrap gap-2">{Object.keys(files).map((name) => <button key={name} type="button" onClick={() => setActiveFile(name)} className={`border px-3 py-2 text-[11px] uppercase tracking-[0.16em] transition ${activeFile === name ? "border-[#D4B06A] bg-[#D4B06A] text-[#07110E]" : "border-white/10 text-[#C5D0CB] hover:border-[#496159]"}`}>{name}</button>)}</div>
    <pre className="min-h-[380px] overflow-auto border border-[#1D2724] bg-[rgba(3,6,5,0.96)] p-5 text-xs leading-6 text-[#D0DAD6]">{files[activeFile]}</pre>
  </>;
}

function RunResultPanel({ runResult }) {
  if (!runResult) return null;
  return <div className="space-y-4 border border-[#233630] bg-[rgba(255,255,255,0.02)] px-5 py-5">
    <div className="flex flex-wrap items-center gap-3">
      <span className={`text-[11px] uppercase tracking-[0.2em] ${runResult.ok ? "text-[#BFE5D3]" : "text-[#F2C38A]"}`}>{runResult.ok ? "Execucao concluida" : "Execucao com falha"}</span>
      <span className="text-[11px] uppercase tracking-[0.2em] text-white/40">{runResult.command}</span>
    </div>
    {runResult.stdout ? <pre className="max-h-[260px] overflow-auto border border-[#1D2724] bg-[rgba(3,6,5,0.96)] p-4 text-xs leading-6 text-[#D0DAD6]">{runResult.stdout}</pre> : null}
    {runResult.stderr ? <pre className="max-h-[220px] overflow-auto border border-[#3A2323] bg-[rgba(35,10,10,0.75)] p-4 text-xs leading-6 text-[#F2C7C7]">{runResult.stderr}</pre> : null}
  </div>;
}

export default function SetupIntegracaoPreview(props) {
  const { accessMode, activeFile, canRunCommands, canServerSaveSetup, confirmations, files, handleDownloadSetupFile, handleRun, handleSaveLocal, preview, runResult, runningMode, saving, setActiveFile, setConfirmations, setupMode } = props;

  return <section className="bg-[linear-gradient(180deg,rgba(7,17,14,0.98),rgba(10,13,12,0.96))] px-6 py-8 md:px-10">
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-[11px] uppercase tracking-[0.24em] text-[#7D918B]">Pre-visualizacao operacional</p>
        <h2 className="mt-1 text-3xl font-serif text-[#F7F1E8]">Arquivos que o bootstrap vai consumir</h2>
      </div>
      {preview ? <button type="button" onClick={() => downloadText("setup.secrets.json", files["setup.secrets.json"])} className="border border-[#D4B06A]/55 px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-[#F4E7C2] transition hover:border-[#D4B06A]">Baixar setup.secrets.json</button> : null}
    </div>
    <PreviewNotice accessMode={accessMode} canRunCommands={canRunCommands} canServerSaveSetup={canServerSaveSetup} setupMode={setupMode} />
    {!preview ? <div className="mt-10 border border-dashed border-white/12 px-6 py-10 text-sm leading-7 text-[#90A29C]">Assim que voce preencher as credenciais, esta area mostra o `.env.bootstrap`, os arquivos de config e a `authorize-url.json` para a nova conta. O fluxo recomendado e baixar o `setup.secrets.json`.</div> : <div className="mt-8 space-y-6">
      <div className="grid gap-4 md:grid-cols-3">{preview.requiredChecks.map((item) => <div key={item.key} className="border border-white/10 px-4 py-4"><p className="text-[10px] uppercase tracking-[0.2em] text-white/40">{item.key}</p><p className={`mt-2 text-sm ${item.present ? "text-[#BFE5D3]" : "text-[#F2C38A]"}`}>{item.present ? "Pronto" : "Pendente"}</p></div>)}</div>
      <div className="border border-[#233630] bg-[rgba(255,255,255,0.02)] px-5 py-5">
        <p className="text-[11px] uppercase tracking-[0.22em] text-[#D4B06A]">Checklist de credenciais e conexoes</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">{(preview.credentialChecklist || []).map((item) => <div key={`${item.system}-${item.item}`} className="border border-white/10 px-4 py-4"><p className="text-[10px] uppercase tracking-[0.2em] text-white/40">{item.system}</p><p className="mt-2 text-sm text-[#F7F1E8]">{item.item}</p><p className={`mt-2 text-xs ${item.present ? "text-[#BFE5D3]" : "text-[#F2C38A]"}`}>{item.present ? "Validado no setup" : "Ainda precisa ser preenchido"}</p><p className="mt-2 text-xs leading-6 text-[#9AA8A3]">{item.help}</p></div>)}</div>
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={handleDownloadSetupFile} className="border border-[#D4B06A]/55 px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-[#F4E7C2] transition hover:border-[#D4B06A]">Baixar setup</button>
        <button type="button" onClick={handleSaveLocal} disabled={saving || !canServerSaveSetup} className="border border-[#D4B06A]/55 px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-[#F4E7C2] transition hover:border-[#D4B06A] disabled:opacity-60">{saving ? "Salvando local..." : "Salvar no repo local"}</button>
        <button type="button" onClick={() => downloadText(activeFile, files[activeFile], activeFile.endsWith(".json") ? "application/json;charset=utf-8" : "text/plain;charset=utf-8")} className="border border-white/10 px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-[#F4E7C2] transition hover:border-[#D4B06A]">Baixar arquivo atual</button>
        <button type="button" onClick={() => navigator.clipboard.writeText(files[activeFile] || "")} className="border border-white/10 px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-[#B0BDB8] transition hover:border-[#D4B06A]">Copiar conteudo atual</button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{[{ mode: "validate", label: "Rodar Validate" }, { mode: "bootstrap", label: "Rodar Bootstrap" }, { mode: "go", label: "Rodar Go Live" }, { mode: "sync", label: "Rodar Sync" }, { mode: "ops", label: "Rodar Ops" }].map((item) => <button key={item.mode} type="button" onClick={() => handleRun(item.mode)} disabled={Boolean(runningMode) || !canRunCommands} className="border border-[#D4B06A]/25 bg-[rgba(255,255,255,0.02)] px-4 py-4 text-[11px] uppercase tracking-[0.18em] text-[#E9DDB9] transition hover:border-[#D4B06A] disabled:opacity-60">{runningMode === item.mode ? "Executando..." : item.label}</button>)}</div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block"><span className="mb-2 block text-[11px] uppercase tracking-[0.16em] text-[#B7C3BE]">Confirmacao para `go`</span><input type="text" value={confirmations.go} onChange={(event) => setConfirmations((current) => ({ ...current, go: event.target.value }))} placeholder="EXECUTAR GO" className="w-full border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-[#F5F0E7] outline-none transition placeholder:text-white/20 focus:border-[#D4B06A]" /></label>
        <label className="block"><span className="mb-2 block text-[11px] uppercase tracking-[0.16em] text-[#B7C3BE]">Confirmacao para `ops`</span><input type="text" value={confirmations.ops} onChange={(event) => setConfirmations((current) => ({ ...current, ops: event.target.value }))} placeholder="EXECUTAR OPS" className="w-full border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-[#F5F0E7] outline-none transition placeholder:text-white/20 focus:border-[#D4B06A]" /></label>
      </div>
      <PreviewFiles activeFile={activeFile} files={files} setActiveFile={setActiveFile} />
      <RunResultPanel runResult={runResult} />
      <div className="border border-[#233630] bg-[rgba(255,255,255,0.02)] px-5 py-5 text-sm leading-7 text-[#A3B2AD]">
        <p className="text-[11px] uppercase tracking-[0.22em] text-[#D4B06A]">Acionamento</p>
        <p className="mt-2">1. Clique em `Salvar setup no repo` ou baixe o `setup.secrets.json`.</p>
        <p>2. Rode `npm run integration:bootstrap` para gerar tudo em `setup/integration-kit/generated`.</p>
        <p>3. Para `go` e `ops`, a UI exige confirmacao explicita: `EXECUTAR GO` ou `EXECUTAR OPS`.</p>
        <p>4. Rode `npm run integration:go` para aplicar Supabase automaticamente.</p>
        <p>5. Se preferir, use `setup/integration-kit/bootstrap.ps1` ou `bootstrap.cmd`.</p>
        <p>6. Use o `authorize-url.json` gerado para concluir o OAuth do Freshworks.</p>
        <p>7. Depois rode `npm run integration:sync` para puxar produtos, contatos e deals com o bundle atual.</p>
        <p>8. Antes do bootstrap, rode `npm run integration:validate` para validar credenciais, MCP e cobertura minima.</p>
      </div>
    </div>}
  </section>;
}
