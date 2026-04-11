import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import InternoLayout from "../../components/interno/InternoLayout";
import OptionalAdminAccess from "../../components/interno/OptionalAdminAccess";
import { adminFetch } from "../../lib/admin/api";
const {
  ENV_DEFINITIONS,
  buildPortableIntegrationBundle,
  buildRequiredChecks,
  formatEnvFile,
} = require("../../lib/integration-kit/portable-preview");

function Panel({ title, children }) {
  return (
    <section className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
      <h2 className="font-serif text-2xl text-[#F7F1E8]">{title}</h2>
      <div className="mt-4 space-y-3 text-sm leading-6 text-[#A8B6B0]">{children}</div>
    </section>
  );
}

function downloadText(filename, content, contentType = "application/json;charset=utf-8") {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function buildLocalExportPayload() {
  return {
    ok: true,
    bundle: buildPortableIntegrationBundle({}),
    envTemplate: formatEnvFile(ENV_DEFINITIONS, {}),
    requiredChecks: buildRequiredChecks({}),
    sourceMode: "static-safe",
  };
}

export default function IntegrationKitPage() {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [activeFile, setActiveFile] = useState("integration.config.json");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const localPayload = buildLocalExportPayload();
      if (!cancelled) {
        setState({ loading: false, error: "", data: localPayload });
      }

      try {
        const payload = await adminFetch("/api/admin-integration-kit-export", { method: "GET" }, { timeoutMs: 45_000, maxRetries: 1 });
        if (!cancelled) {
          setState({
            loading: false,
            error: "",
            data: {
              ...payload,
              sourceMode: "admin-runtime",
            },
          });
        }
      } catch {
        if (!cancelled) {
          setState({
            loading: false,
            error: "",
            data: localPayload,
          });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const files = useMemo(() => {
    const bundleFiles = state.data?.bundle?.files || {};
    return {
      ...Object.fromEntries(
        Object.entries(bundleFiles).map(([name, value]) => [name, JSON.stringify(value, null, 2)]),
      ),
      ".env.integration.example": state.data?.envTemplate || "",
    };
  }, [state.data]);

  const activeContent = files[activeFile] || "";
  const requiredChecks = state.data?.requiredChecks || [];
  const checklist = state.data?.bundle?.setupChecklist || [];
  const sourceMode = state.data?.sourceMode || "static-safe";

  return (
    <OptionalAdminAccess>
      {({ profile, accessMode }) => (
        <InternoLayout
          profile={profile}
          title="Integration Kit"
          description="Bundle portatil para replicar a integracao Supabase + Freshsales + Freshdesk em novos projetos."
        >
          <div className="space-y-8">
            <Panel title="Objetivo">
              <p>
                Esta area monta um bundle reutilizavel do que ja foi desenvolvido aqui, separando configuracao, mappings e checklist de setup
                para reaplicar a integracao em qualquer novo repositorio, novo Supabase e nova conta Freshworks.
              </p>
              <p>
                O export nao inclui segredos reais. Ele preserva valores seguros e placeholders para que o proximo projeto faca onboarding sem
                duplicar codigo por cliente.
              </p>
              <p>
                <Link href="/interno/setup-integracao" className="text-[#D4B06A] transition hover:text-[#F0D99B]">
                  Abrir wizard de setup inicial
                </Link>
              </p>
            </Panel>

            <div className={`border px-5 py-4 text-sm leading-7 ${
              sourceMode === "admin-runtime"
                ? "border-[#245440] bg-[rgba(36,84,64,0.18)] text-[#CFEBDC]"
                : "border-[#6F5830] bg-[rgba(111,88,48,0.18)] text-[#F0DEC0]"
            }`}>
              <p className="text-[11px] uppercase tracking-[0.22em]">
                {sourceMode === "admin-runtime" ? "Export enriquecido por runtime admin" : "Export local em modo static-safe"}
              </p>
              <p className="mt-2">
                {sourceMode === "admin-runtime"
                  ? "O runtime atual respondeu com o bundle exportavel baseado no ambiente do projeto."
                  : "A pagina continua funcional sem backend e sem sessao admin, usando placeholders seguros e estrutura portatil no navegador."}
              </p>
              <p className="mt-2">
                {accessMode === "admin"
                  ? "Sessao administrativa detectada."
                  : "Sem sessao admin: o kit continua disponivel para download e documentacao."}
              </p>
            </div>

            {state.loading ? (
              <Panel title="Carregando bundle">
                <p>Montando o pacote exportavel e validando as variaveis do ambiente atual.</p>
              </Panel>
            ) : null}

            {state.error ? (
              <Panel title="Falha ao carregar">
                <p className="text-[#f1b8b8]">{state.error}</p>
              </Panel>
            ) : null}

            {!state.loading && !state.error ? (
              <>
                <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                  <Panel title="Checklist de replicacao">
                    {checklist.map((item) => (
                      <p key={item}>- {item}</p>
                    ))}
                  </Panel>

                  <Panel title="Pre-requisitos">
                    {requiredChecks.map((item) => (
                      <p key={item.key}>
                        <span className={item.present ? "text-emerald-400" : "text-amber-300"}>
                          {item.present ? "OK" : "Pendente"}
                        </span>
                        {" "}
                        {item.label}
                        {" "}
                        <span className="text-[#73827D]">({item.key})</span>
                      </p>
                    ))}
                  </Panel>
                </div>

                <Panel title="Arquivos exportaveis">
                  <div className="flex flex-wrap gap-2">
                    {Object.keys(files).map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setActiveFile(name)}
                        className={`rounded-full border px-4 py-2 text-xs uppercase tracking-[0.16em] transition ${
                          activeFile === name
                            ? "border-[#C5A059] bg-[#C5A059] text-[#07110E]"
                            : "border-[#2D2E2E] text-[#C6D1CC] hover:border-[#496159]"
                        }`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => downloadText(activeFile, activeContent, activeFile.endsWith(".json") ? "application/json;charset=utf-8" : "text/plain;charset=utf-8")}
                      className="rounded-full border border-[#2D2E2E] px-4 py-2 text-xs uppercase tracking-[0.16em] text-[#F4E7C2] transition hover:border-[#C5A059]"
                    >
                      Baixar arquivo atual
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadText("integration-bundle.json", JSON.stringify(state.data.bundle, null, 2))}
                      className="rounded-full border border-[#2D2E2E] px-4 py-2 text-xs uppercase tracking-[0.16em] text-[#F4E7C2] transition hover:border-[#C5A059]"
                    >
                      Baixar bundle completo
                    </button>
                  </div>

                  <pre className="mt-4 max-h-[560px] overflow-auto border border-[#1E2422] bg-[rgba(6,8,8,0.92)] p-4 text-xs leading-6 text-[#CFD8D4]">
                    {activeContent}
                  </pre>
                </Panel>

                <Panel title="Proximos passos recomendados">
                  <p>`npm run integration:doctor` para validar variaveis e URLs derivadas.</p>
                  <p>`npm run integration:authorize-url` para gerar a URL OAuth da nova conta Freshworks.</p>
                  <p>`npm run integration:export-config` para materializar os arquivos em `artifacts/integration-kit`.</p>
                  <p>`npm run integration:init` para revisar migrations e sequencia minima de bootstrap.</p>
                  <p>
                    Runbook:
                    {" "}
                    [setup-integration-kit.md](/D:/Github/newgit/docs/setup-integration-kit.md)
                  </p>
                </Panel>
              </>
            ) : null}
          </div>
        </InternoLayout>
      )}
    </OptionalAdminAccess>
  );
}
