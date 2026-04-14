import SetupIntegracaoForm from "./SetupIntegracaoForm";
import SetupIntegracaoHero from "./SetupIntegracaoHero";
import SetupIntegracaoPreview from "./SetupIntegracaoPreview";
import { useSetupIntegracaoState } from "./useSetupIntegracaoState";

export default function SetupIntegracaoScreen({ accessMode }) {
  const state = useSetupIntegracaoState();

  return <div className="overflow-hidden border border-[#29322F] bg-[#07110E] text-[#F5F0E7]">
    <SetupIntegracaoHero setupMode={state.setupMode} />
    <section className="grid gap-0 xl:grid-cols-[0.95fr_1.05fr]">
      <SetupIntegracaoForm
        canServerSaveSetup={state.canServerSaveSetup}
        error={state.error}
        form={state.form}
        handleDownloadSetupFile={state.handleDownloadSetupFile}
        handleGenerate={state.handleGenerate}
        handleSaveLocal={state.handleSaveLocal}
        notice={state.notice}
        saving={state.saving}
        setForm={state.setForm}
        setValueAtPath={state.setValueAtPath}
        submitting={state.submitting}
      />
      <SetupIntegracaoPreview
        accessMode={accessMode}
        activeFile={state.activeFile}
        canRunCommands={state.canRunCommands}
        canServerSaveSetup={state.canServerSaveSetup}
        confirmations={state.confirmations}
        files={state.files}
        handleDownloadSetupFile={state.handleDownloadSetupFile}
        handleRun={state.handleRun}
        handleSaveLocal={state.handleSaveLocal}
        preview={state.preview}
        runResult={state.runResult}
        runningMode={state.runningMode}
        saving={state.saving}
        setActiveFile={state.setActiveFile}
        setConfirmations={state.setConfirmations}
        setupMode={state.setupMode}
      />
    </section>
  </div>;
}
