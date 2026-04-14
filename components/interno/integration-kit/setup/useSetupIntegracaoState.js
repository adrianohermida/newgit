import { useMemo, useState } from "react";
import { adminFetch } from "../../../../lib/admin/api";
import { downloadText, initialSetup, setValueAtPath } from "./setupConfig";

export function useSetupIntegracaoState() {
  const [form, setForm] = useState(initialSetup);
  const [capabilities, setCapabilities] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [runningMode, setRunningMode] = useState("");
  const [confirmations, setConfirmations] = useState({ go: "", ops: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState(null);
  const [activeFile, setActiveFile] = useState("setup.secrets.json");
  const [runResult, setRunResult] = useState(null);

  const files = useMemo(() => {
    if (!preview) return {};
    return {
      "setup.secrets.json": JSON.stringify(preview.setupFile, null, 2),
      ".env.bootstrap": preview.envBootstrap,
      "integration.config.json": JSON.stringify(preview.bundle.files["integration.config.json"], null, 2),
      "field-mapping.json": JSON.stringify(preview.bundle.files["field-mapping.json"], null, 2),
      "business-rules.json": JSON.stringify(preview.bundle.files["business-rules.json"], null, 2),
      "mcp.config.json": JSON.stringify(preview.bundle.files["mcp.config.json"], null, 2),
      ".mcp.json": JSON.stringify(preview.bundle.files[".mcp.json"], null, 2),
      "credential-checklist.json": JSON.stringify(preview.bundle.files["credential-checklist.json"], null, 2),
      "authorize-url.json": JSON.stringify(preview.authorize, null, 2),
    };
  }, [preview]);

  const setupMode = capabilities?.mode || "static-safe";
  const canServerSaveSetup = Boolean(capabilities?.canServerSaveSetup);
  const canRunCommands = Boolean(capabilities?.canRunCommands);

  async function handleGenerate(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const { buildPortableSetupPreview } = await import("../../../../lib/integration-kit/portable-preview");
      const localPreview = buildPortableSetupPreview(form, {});
      setPreview(localPreview);
      setCapabilities({ mode: "static-safe", canDownloadSetup: true, canPreview: true, canServerSaveSetup: false, canRunCommands: false });
      setActiveFile("setup.secrets.json");
      try {
        const payload = await adminFetch("/api/admin-integration-kit-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }, { timeoutMs: 45000, maxRetries: 0 });
        setPreview(payload.preview);
        setCapabilities(payload.capabilities || null);
        setNotice("Pre-visualizacao gerada com suporte operacional do runtime atual.");
      } catch {
        setNotice("Pre-visualizacao gerada localmente no navegador. Esse modo continua funcional em Cloudflare Pages e frontend estatico.");
      }
    } catch (requestError) {
      setError(requestError.message || "Falha ao gerar os arquivos do setup.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveLocal() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = await adminFetch("/api/admin-integration-kit-save-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      }, { timeoutMs: 45000, maxRetries: 0 });
      setNotice(`${payload.message} Caminho: ${payload.setupPath}`);
    } catch (requestError) {
      downloadText("setup.secrets.json", JSON.stringify(form, null, 2));
      setError(requestError.message || "Falha ao salvar setup.secrets.json localmente.");
      setNotice("Persistencia server-side indisponivel neste runtime. O arquivo foi baixado localmente para voce continuar o setup com seguranca.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRun(mode) {
    setRunningMode(mode);
    setError("");
    setNotice("");
    setRunResult(null);
    try {
      const payload = await adminFetch("/api/admin-integration-kit-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, confirmation: confirmations[mode] || "" }),
      }, { timeoutMs: 250000, maxRetries: 0 });
      setRunResult(payload);
      if (payload.ok) setNotice(`Comando concluido: ${payload.command}`);
      else setError(payload.stderr || payload.error || `Falha ao executar ${mode}.`);
    } catch (requestError) {
      setError(requestError.message || `Falha ao executar ${mode}.`);
    } finally {
      setRunningMode("");
    }
  }

  function handleDownloadSetupFile() {
    const content = preview ? files["setup.secrets.json"] : JSON.stringify(form, null, 2);
    downloadText("setup.secrets.json", content);
    setError("");
    setNotice("setup.secrets.json baixado localmente. Esse e o fluxo recomendado para Cloudflare Pages e ambientes estaticos.");
  }

  return {
    activeFile,
    canRunCommands,
    canServerSaveSetup,
    confirmations,
    error,
    files,
    form,
    notice,
    preview,
    runResult,
    runningMode,
    saving,
    setActiveFile,
    setConfirmations,
    setForm,
    setupMode,
    submitting,
    handleDownloadSetupFile,
    handleGenerate,
    handleRun,
    handleSaveLocal,
    setValueAtPath,
  };
}
