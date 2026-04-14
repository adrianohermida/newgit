import { useEffect, useMemo, useState } from "react";
import { adminFetch } from "../../../lib/admin/api";

function getPortablePreviewApi() {
  return require("../../../lib/integration-kit/portable-preview");
}

function buildLocalExportPayload() {
  const { ENV_DEFINITIONS, buildPortableIntegrationBundle, buildRequiredChecks, formatEnvFile } = getPortablePreviewApi();
  return {
    ok: true,
    bundle: buildPortableIntegrationBundle({}),
    envTemplate: formatEnvFile(ENV_DEFINITIONS, {}),
    requiredChecks: buildRequiredChecks({}),
    sourceMode: "static-safe",
  };
}

export function useIntegrationKitData() {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [activeFile, setActiveFile] = useState("integration.config.json");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const localPayload = buildLocalExportPayload();
      if (!cancelled) setState({ loading: false, error: "", data: localPayload });
      try {
        const payload = await adminFetch("/api/admin-integration-kit-export", { method: "GET" }, { timeoutMs: 45_000, maxRetries: 1 });
        if (!cancelled) setState({ loading: false, error: "", data: { ...payload, sourceMode: "admin-runtime" } });
      } catch {
        if (!cancelled) setState({ loading: false, error: "", data: localPayload });
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const files = useMemo(() => {
    const bundleFiles = state.data?.bundle?.files || {};
    return {
      ...Object.fromEntries(Object.entries(bundleFiles).map(([name, value]) => [name, JSON.stringify(value, null, 2)])),
      ".env.integration.example": state.data?.envTemplate || "",
    };
  }, [state.data]);

  return {
    activeContent: files[activeFile] || "",
    activeFile,
    checklist: state.data?.bundle?.setupChecklist || [],
    files,
    requiredChecks: state.data?.requiredChecks || [],
    setActiveFile,
    sourceMode: state.data?.sourceMode || "static-safe",
    state,
  };
}
