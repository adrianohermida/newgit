import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { adminFetch } from "../lib/admin/api";
import { formatLawdeskProviderLabel } from "../lib/lawdesk/providers";

const DEFAULT_PROMPT = "Resuma em PT-BR, em 3 bullets, como você pretende me ajudar neste ambiente.";

function formatStatusTone(status) {
  if (status === "operational" || status === "ok") return "border-[#234034] text-[#8FCFA9]";
  if (status === "degraded") return "border-[#8b6f33] text-[#D9B46A]";
  if (status === "failed" || status === "error") return "border-[#5b2d2d] text-[#f2b2b2]";
  return "border-[#22342F] text-[#D8DEDA]";
}

function ResultCard({ result }) {
  return (
    <article className="rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#7F928C]">{result.providerLabel}</p>
          <h3 className="mt-1 text-lg font-semibold text-[#F5F1E8]">{result.provider}</h3>
        </div>
        <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.16em] ${formatStatusTone(result.status)}`}>
          {result.status}
        </span>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <div className="rounded-[18px] border border-[#22342F] px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Source</p>
          <p className="mt-1 text-sm text-[#F5F1E8]">{result.source || "n/a"}</p>
        </div>
        <div className="rounded-[18px] border border-[#22342F] px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Model</p>
          <p className="mt-1 text-sm text-[#F5F1E8]">{result.model || "n/a"}</p>
        </div>
        <div className="rounded-[18px] border border-[#22342F] px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Executado em</p>
          <p className="mt-1 text-sm text-[#F5F1E8]">{new Date(result.createdAt).toLocaleTimeString("pt-BR")}</p>
        </div>
      </div>

      <div className="mt-4 rounded-[20px] border border-[#22342F] bg-[rgba(7,9,8,0.72)] p-4">
        <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Resposta</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#F5F1E8]">{result.text}</p>
      </div>

      {result.error ? (
        <div className="mt-4 rounded-[20px] border border-[#5b2d2d] bg-[rgba(127,29,29,0.16)] p-4">
          <p className="text-[10px] uppercase tracking-[0.16em] text-[#f2b2b2]">Erro</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#f2b2b2]">{result.error}</p>
        </div>
      ) : null}
    </article>
  );
}

export default function LLMTestChat() {
  const router = useRouter();
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [provider, setProvider] = useState("gpt");
  const [providerCatalog, setProviderCatalog] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    adminFetch("/api/admin-lawdesk-providers?include_health=1", { method: "GET" })
      .then((payload) => {
        if (!active) return;
        const providers = Array.isArray(payload?.data?.providers) ? payload.data.providers : [];
        const defaultProvider = typeof payload?.data?.defaultProvider === "string" ? payload.data.defaultProvider : "gpt";
        setProviderCatalog(providers);
        const firstAvailable = providers.find((item) => item.available)?.id;
        setProvider((current) => current || defaultProvider || firstAvailable || "gpt");
      })
      .catch((fetchError) => {
        if (!active) return;
        setError(fetchError?.message || "Falha ao carregar catálogo de providers.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const queryProvider = typeof router.query?.provider === "string" ? router.query.provider.trim() : "";
    const queryPrompt = typeof router.query?.prompt === "string" ? router.query.prompt.trim() : "";
    if (queryProvider) {
      setProvider(queryProvider);
    }
    if (queryPrompt) {
      setPrompt(queryPrompt);
    }
  }, [router.query?.prompt, router.query?.provider]);

  const quickActions = useMemo(
    () => [
      { id: "gpt", label: "Testar nuvem principal", provider: "gpt" },
      { id: "local", label: "Testar LLM local", provider: "local" },
      { id: "cloudflare", label: "Testar Cloudflare", provider: "cloudflare" },
      { id: "custom", label: "Testar custom", provider: "custom" },
    ],
    []
  );

  async function runSmokeTest(selectedProvider) {
    const trimmedPrompt = String(prompt || "").trim();
    if (!trimmedPrompt) return;

    setLoading(true);
    setError("");
    const providerEntry = providerCatalog.find((item) => item.id === selectedProvider);

    try {
      const payload = await adminFetch("/api/admin-lawdesk-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: trimmedPrompt,
          provider: selectedProvider,
          mode: "analysis",
          context: {
            route: "/llm-test",
            assistant: {
              mode: "analysis",
              role: "smoke-test",
            },
          },
        }),
      });

      const responseData = payload?.data || {};
      setResults((current) => [
        {
          id: `${Date.now()}_${selectedProvider}`,
          provider: selectedProvider,
          providerLabel: providerEntry?.label || formatLawdeskProviderLabel(selectedProvider),
          status: responseData?.status || "ok",
          source: responseData?._metadata?.source || responseData?._metadata?.provider || null,
          model: responseData?._metadata?.model || null,
          text: responseData?.resultText || responseData?.result?.message || "Sem resposta textual.",
          error: "",
          createdAt: new Date().toISOString(),
        },
        ...current,
      ]);
    } catch (runError) {
      setResults((current) => [
        {
          id: `${Date.now()}_${selectedProvider}`,
          provider: selectedProvider,
          providerLabel: providerEntry?.label || formatLawdeskProviderLabel(selectedProvider),
          status: "error",
          source: null,
          model: null,
          text: "A execução falhou antes de retornar resposta válida.",
          error: runError?.message || "Falha desconhecida.",
          createdAt: new Date().toISOString(),
        },
        ...current,
      ]);
      setError(runError?.message || "Falha ao executar smoke test.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8 text-[#F5F1E8]">
      <section className="rounded-[28px] border border-[#22342F] bg-[linear-gradient(180deg,rgba(11,15,14,0.98),rgba(7,10,9,0.98))] p-6 shadow-[0_18px_54px_rgba(0,0,0,0.24)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#C5A059]">Hermida Maia Advocacia</p>
        <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.04em]">LLM Smoke Test</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-[#9BAEA8]">
          Painel operacional para validar `gpt`, `local`, `cloudflare` e `custom` usando o mesmo endpoint administrativo do AI Task e do Dotobot.
        </p>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={5}
            className="w-full rounded-[24px] border border-[#22342F] bg-[rgba(7,9,8,0.98)] px-4 py-3 text-sm leading-7 text-[#F5F1E8] outline-none placeholder:text-[#60706A]"
            placeholder="Digite o prompt de validação..."
          />
          <div className="space-y-3">
            <label className="block rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
              <span className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">Provider</span>
              <select
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
                className="mt-2 h-11 w-full rounded-2xl border border-[#22342F] bg-[rgba(7,9,8,0.98)] px-3 text-sm text-[#F5F1E8] outline-none"
              >
                {providerCatalog.map((item) => (
                  <option key={item.id} value={item.id} disabled={!item.available}>
                    {item.label}{item.model ? ` · ${item.model}` : ""}{item.status ? ` · ${item.status}` : ""}
                  </option>
                ))}
                {!providerCatalog.length ? <option value="gpt">Carregando catálogo...</option> : null}
              </select>
            </label>

            <button
              type="button"
              onClick={() => runSmokeTest(provider)}
              disabled={loading || !String(prompt || "").trim()}
              className="w-full rounded-full border border-[#C5A059] bg-[#C5A059] px-5 py-3 text-sm font-semibold text-[#07110E] transition hover:bg-[#D7B570] disabled:opacity-50"
            >
              {loading ? "Executando..." : "Executar smoke test"}
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {quickActions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => {
                setProvider(action.provider);
                runSmokeTest(action.provider);
              }}
              disabled={loading}
              className="rounded-full border border-[#22342F] px-3 py-1.5 text-[11px] text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50"
            >
              {action.label}
            </button>
          ))}
        </div>

        {error ? (
          <div className="mt-4 rounded-[20px] border border-[#5b2d2d] bg-[rgba(127,29,29,0.16)] px-4 py-3 text-sm text-[#f2b2b2]">
            {error}
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {results.length ? (
          results.map((result) => <ResultCard key={result.id} result={result} />)
        ) : (
          <div className="rounded-[24px] border border-dashed border-[#22342F] bg-[rgba(255,255,255,0.02)] p-6 text-sm text-[#9BAEA8]">
            Nenhuma execução ainda. Rode um smoke test para validar provider, modelo, source e resposta final.
          </div>
        )}
      </section>
    </div>
  );
}
