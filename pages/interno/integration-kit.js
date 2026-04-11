import { useEffect, useMemo, useState } from "react";
import InternoLayout from "../../components/interno/InternoLayout";
import RequireAdmin from "../../components/interno/RequireAdmin";
import { adminFetch } from "../../lib/admin/api";

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

export default function IntegrationKitPage() {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [activeFile, setActiveFile] = useState("integration.config.json");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const payload = await adminFetch("/api/admin-integration-kit-export", { method: "GET" }, { timeoutMs: 45_000, maxRetries: 1 });
        if (!cancelled) {
          setState({ loading: false, error: "", data: payload });
        }
      } catch (error) {
        if (!cancelled) {
          setState({ loading: false, error: error.message || "Falha ao carregar o integration kit.", data: null });
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

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="Integration Kit"
          description="Bundle portatil para replicar a integração Supabase + Freshsales + Freshdesk em novos projetos."
        >
          <div className="space-y-8">
            <Panel title="Objetivo">
              <p>
                Esta área monta um bundle reutilizável do que já foi desenvolvido aqui, separando configuração, mappings e checklist de setup
                para reaplicar a integração em qualquer novo repositório, novo Supabase e nova conta Freshworks.
              </p>
              <p>
                O export não inclui segredos reais. Ele preserva valores seguros e placeholders para que o próximo projeto faça onboarding sem
                duplicar código por cliente.
              </p>
            </Panel>

            {state.loading ? (
              <Panel title="Carregando bundle">
                <p>Montando o pacote exportável e validando as variáveis do ambiente atual.</p>
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
                  <Panel title="Checklist de replicação">
                    {checklist.map((item) => (
                      <p key={item}>- {item}</p>
                    ))}
                  </Panel>

                  <Panel title="Pré-requisitos">
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

                <Panel title="Arquivos exportáveis">
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

                <Panel title="Próximos passos recomendados">
                  <p>`npm run integration:doctor` para validar variáveis e URLs derivadas.</p>
                  <p>`npm run integration:authorize-url` para gerar a URL OAuth da nova conta Freshworks.</p>
                  <p>`npm run integration:export-config` para materializar os arquivos em `artifacts/integration-kit`.</p>
                  <p>`npm run integration:init` para revisar migrations e sequência mínima de bootstrap.</p>
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
    </RequireAdmin>
  );
}
