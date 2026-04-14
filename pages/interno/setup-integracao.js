import Link from "next/link";
import { useMemo, useState } from "react";
import InternoLayout from "../../components/interno/InternoLayout";
import OptionalAdminAccess from "../../components/interno/OptionalAdminAccess";
import { adminFetch } from "../../lib/admin/api";
const { buildPortableSetupPreview } = require("../../lib/integration-kit/portable-preview");

const initialSetup = {
  project: {
    slug: "",
    vertical: "",
    packageName: "freshworks-supabase-starter",
  },
  env: {
    SUPABASE_URL: "",
    SUPABASE_PROJECT_REF: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    SUPABASE_ANON_KEY: "",
    NEXT_PUBLIC_SUPABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    GITHUB_REPO_OWNER: "",
    GITHUB_REPO_NAME: "",
    GITHUB_DEFAULT_BRANCH: "main",
    GITHUB_APP_INSTALLATION_ID: "",
    FRESHWORKS_ORG_BASE_URL: "",
    FRESHSALES_API_BASE: "",
    FRESHSALES_OAUTH_CLIENT_ID: "",
    FRESHSALES_OAUTH_CLIENT_SECRET: "",
    FRESHSALES_REFRESH_TOKEN: "",
    FRESHSALES_SCOPES: "freshsales.deals.view freshsales.deals.create freshsales.contacts.view freshsales.contacts.create freshsales.settings.fields.view",
    FRESHDESK_DOMAIN: "",
    FRESHDESK_API_KEY: "",
    FRESHDESK_PORTAL_TICKET_BASE_URL: "",
    FRESHDESK_NEW_TICKET_URL: "",
    NEXT_PUBLIC_FRESHWORKS_WIDGET_SCRIPT_URL: "",
    NEXT_PUBLIC_FRESHWORKS_WIDGET_CHAT: "false",
  },
};

const fieldGroups = [
  {
    title: "Projeto",
    accent: "Setup Blueprint",
    fields: [
      { key: "project.slug", label: "Slug do workspace", placeholder: "novo-workspace", secret: false },
      { key: "project.vertical", label: "Vertical/nicho", placeholder: "servicos", secret: false },
      { key: "project.packageName", label: "Nome do pacote", placeholder: "freshworks-supabase-starter", secret: false },
    ],
  },
  {
    title: "Supabase",
    accent: "Base de dados e auth",
    fields: [
      { key: "env.SUPABASE_URL", label: "Supabase URL", placeholder: "https://seu-projeto.supabase.co", secret: false },
      { key: "env.SUPABASE_PROJECT_REF", label: "Supabase project ref", placeholder: "abcdefghijklmnopqrst", secret: false },
      { key: "env.SUPABASE_SERVICE_ROLE_KEY", label: "Service role key", placeholder: "service-role", secret: true },
      { key: "env.SUPABASE_ANON_KEY", label: "Anon key", placeholder: "anon-key", secret: true },
      { key: "env.NEXT_PUBLIC_SUPABASE_URL", label: "NEXT_PUBLIC_SUPABASE_URL", placeholder: "https://seu-projeto.supabase.co", secret: false },
      { key: "env.NEXT_PUBLIC_SUPABASE_ANON_KEY", label: "NEXT_PUBLIC_SUPABASE_ANON_KEY", placeholder: "anon-key", secret: true },
    ],
  },
  {
    title: "GitHub e MCP",
    accent: "Repo e conexoes operacionais",
    fields: [
      { key: "env.GITHUB_REPO_OWNER", label: "GitHub owner", placeholder: "sua-org", secret: false },
      { key: "env.GITHUB_REPO_NAME", label: "GitHub repo", placeholder: "seu-repo", secret: false },
      { key: "env.GITHUB_DEFAULT_BRANCH", label: "Default branch", placeholder: "main", secret: false },
      { key: "env.GITHUB_APP_INSTALLATION_ID", label: "GitHub App installation id", placeholder: "12345678", secret: false },
    ],
  },
  {
    title: "Freshworks",
    accent: "CRM e OAuth",
    fields: [
      { key: "env.FRESHWORKS_ORG_BASE_URL", label: "Org base URL", placeholder: "https://sua-org.myfreshworks.com", secret: false },
      { key: "env.FRESHSALES_API_BASE", label: "Freshsales API base", placeholder: "https://sua-org.myfreshworks.com/crm/sales/api", secret: false },
      { key: "env.FRESHSALES_OAUTH_CLIENT_ID", label: "OAuth client id", placeholder: "client-id", secret: true },
      { key: "env.FRESHSALES_OAUTH_CLIENT_SECRET", label: "OAuth client secret", placeholder: "client-secret", secret: true },
      { key: "env.FRESHSALES_REFRESH_TOKEN", label: "Refresh token", placeholder: "refresh-token", secret: true },
      { key: "env.FRESHSALES_SCOPES", label: "Scopes OAuth", placeholder: "freshsales.deals.view ...", secret: false },
    ],
  },
  {
    title: "Freshdesk e Widget",
    accent: "Suporte e experiência",
    fields: [
      { key: "env.FRESHDESK_DOMAIN", label: "Freshdesk domain", placeholder: "https://sua-conta.freshdesk.com", secret: false },
      { key: "env.FRESHDESK_API_KEY", label: "Freshdesk API key", placeholder: "api-key", secret: true },
      { key: "env.FRESHDESK_PORTAL_TICKET_BASE_URL", label: "Base de tickets", placeholder: "https://sua-conta.freshdesk.com/support/tickets", secret: false },
      { key: "env.FRESHDESK_NEW_TICKET_URL", label: "URL novo ticket", placeholder: "https://sua-conta.freshdesk.com/support/tickets/new", secret: false },
      { key: "env.NEXT_PUBLIC_FRESHWORKS_WIDGET_SCRIPT_URL", label: "Script do widget", placeholder: "//fw-cdn.com/widget.js", secret: false },
      { key: "env.NEXT_PUBLIC_FRESHWORKS_WIDGET_CHAT", label: "Widget habilitado", placeholder: "false", secret: false },
    ],
  },
];

function setValueAtPath(target, dottedPath, value) {
  const parts = dottedPath.split(".");
  const clone = JSON.parse(JSON.stringify(target));
  let cursor = clone;

  for (let index = 0; index < parts.length - 1; index += 1) {
    cursor = cursor[parts[index]];
  }

  cursor[parts[parts.length - 1]] = value;
  return clone;
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

function RailMetric({ label, value, tone = "text-[#F7F1E8]" }) {
  return (
    <div className="border-t border-white/10 pt-3">
      <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">{label}</p>
      <p className={`mt-2 text-lg ${tone}`}>{value}</p>
    </div>
  );
}

export default function SetupIntegracaoPage() {
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

  function handleDownloadSetupFile() {
    const content = preview ? files["setup.secrets.json"] : JSON.stringify(form, null, 2);
    downloadText("setup.secrets.json", content);
    setError("");
    setNotice("setup.secrets.json baixado localmente. Esse e o fluxo recomendado para Cloudflare Pages e ambientes estaticos.");
  }

  const setupMode = capabilities?.mode || "static-safe";
  const canServerSaveSetup = Boolean(capabilities?.canServerSaveSetup);
  const canRunCommands = Boolean(capabilities?.canRunCommands);

  async function handleGenerate(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setNotice("");

    try {
      const localPreview = buildPortableSetupPreview(form, {});
      setPreview(localPreview);
      setCapabilities({
        mode: "static-safe",
        canDownloadSetup: true,
        canPreview: true,
        canServerSaveSetup: false,
        canRunCommands: false,
      });
      setActiveFile("setup.secrets.json");

      try {
        const payload = await adminFetch("/api/admin-integration-kit-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }, { timeoutMs: 45_000, maxRetries: 0 });

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
      }, { timeoutMs: 45_000, maxRetries: 0 });

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
      }, { timeoutMs: 250_000, maxRetries: 0 });

      setRunResult(payload);
      if (payload.ok) {
        setNotice(`Comando concluído: ${payload.command}`);
      } else {
        setError(payload.stderr || payload.error || `Falha ao executar ${mode}.`);
      }
    } catch (requestError) {
      setError(requestError.message || `Falha ao executar ${mode}.`);
    } finally {
      setRunningMode("");
    }
  }

  return (
    <OptionalAdminAccess>
      {({ profile, accessMode }) => (
        <InternoLayout
          profile={profile}
          title="Setup Inicial"
      description="Configuração guiada para ativar integrações e deixar o produto pronto para operar."
        >
          <div className="overflow-hidden border border-[#29322F] bg-[#07110E] text-[#F5F0E7]">
            <section className="relative border-b border-[#233630] px-6 py-8 md:px-10 md:py-10">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(201,168,89,0.22),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(30,78,67,0.34),transparent_48%)]" />
              <div className="relative grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="max-w-3xl">
                  <p className="text-[11px] uppercase tracking-[0.32em] text-[#D4B06A]">Setup Atelier</p>
                  <h1 className="mt-4 max-w-2xl font-serif text-4xl leading-tight md:text-5xl">
                    Preencha uma vez. Gere o pacote. Dispare o bootstrap.
                  </h1>
                  <p className="mt-4 max-w-xl text-sm leading-7 text-[#B0BDB8]">
                    Esta tela foi desenhada para iniciar um novo projeto com o mínimo de atrito: coletamos os secrets principais,
                    geramos o `setup.secrets.json`, o `.env.bootstrap`, a URL OAuth e os arquivos de configuração que o comando único consome.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-3 text-xs uppercase tracking-[0.18em] text-[#DAD1BF]">
                    <span className="border border-white/10 px-3 py-2">1. Credenciais</span>
                    <span className="border border-white/10 px-3 py-2">2. Pré-visualização</span>
                    <span className="border border-white/10 px-3 py-2">3. `npm run integration:bootstrap`</span>
                  </div>
                </div>

                <div className="border border-white/10 bg-[rgba(255,255,255,0.03)] p-5 backdrop-blur">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-[#D4B06A]">Operação enxuta</p>
                  <div className="mt-5 space-y-4">
                    <RailMetric label="Destino do setup" value="`setup/integration-kit`" />
                    <RailMetric label="Saída gerada" value="`generated/<workspace>`" tone="text-[#BFE5D3]" />
                    <RailMetric label="Modo atual" value={setupMode === "local-ops" ? "`local-ops`" : "`static-safe`"} tone="text-[#F4E7C2]" />
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-0 xl:grid-cols-[0.95fr_1.05fr]">
              <form onSubmit={handleGenerate} className="border-r border-[#233630] bg-[rgba(5,8,7,0.92)] px-6 py-8 md:px-10">
                <div className="space-y-8">
                  {fieldGroups.map((group, groupIndex) => (
                    <section key={group.title} className="space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#D4B06A]/50 text-sm text-[#F4E7C2]">
                          {groupIndex + 1}
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.22em] text-[#7D918B]">{group.accent}</p>
                          <h2 className="mt-1 text-2xl font-serif text-[#F7F1E8]">{group.title}</h2>
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        {group.fields.map((field) => (
                          <label key={field.key} className="block">
                            <span className="mb-2 block text-[11px] uppercase tracking-[0.16em] text-[#B7C3BE]">{field.label}</span>
                            <input
                              type={field.secret ? "password" : "text"}
                              value={field.key.split(".").reduce((acc, key) => acc?.[key], form) || ""}
                              onChange={(event) => setForm((current) => setValueAtPath(current, field.key, event.target.value))}
                              placeholder={field.placeholder}
                              className="w-full border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-[#F5F0E7] outline-none transition placeholder:text-white/20 focus:border-[#D4B06A]"
                            />
                          </label>
                        ))}
                      </div>
                    </section>
                  ))}

                  {error ? <div className="border border-[#8A3434] bg-[rgba(138,52,52,0.18)] px-4 py-3 text-sm text-[#F6C7C7]">{error}</div> : null}
                  {notice ? <div className="border border-[#245440] bg-[rgba(36,84,64,0.2)] px-4 py-3 text-sm text-[#CFEBDC]">{notice}</div> : null}

                  <div className="flex flex-wrap items-center gap-4">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="bg-[linear-gradient(90deg,#D4B06A,#9E7A2E)] px-6 py-4 text-xs font-semibold uppercase tracking-[0.22em] text-[#07110E] transition hover:brightness-110 disabled:opacity-60"
                    >
                      {submitting ? "Gerando..." : "Gerar pacote de setup"}
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadSetupFile}
                      className="border border-[#D4B06A]/55 px-6 py-4 text-xs font-semibold uppercase tracking-[0.22em] text-[#F4E7C2] transition hover:border-[#D4B06A]"
                    >
                      Baixar setup.secrets.json
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveLocal}
                      disabled={saving || !canServerSaveSetup}
                      className="border border-[#D4B06A]/55 px-6 py-4 text-xs font-semibold uppercase tracking-[0.22em] text-[#F4E7C2] transition hover:border-[#D4B06A] disabled:opacity-60"
                    >
                      {saving ? "Salvando..." : "Salvar no repo local"}
                    </button>
                    <Link href="/interno/integration-kit" className="text-sm text-[#D4B06A] transition hover:text-[#F0D99B]">
                      Voltar para o export do kit
                    </Link>
                  </div>
                </div>
              </form>

              <section className="bg-[linear-gradient(180deg,rgba(7,17,14,0.98),rgba(10,13,12,0.96))] px-6 py-8 md:px-10">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.24em] text-[#7D918B]">Pré-visualização operacional</p>
                    <h2 className="mt-1 text-3xl font-serif text-[#F7F1E8]">Arquivos que o bootstrap vai consumir</h2>
                  </div>
                  {preview ? (
                    <button
                      type="button"
                      onClick={() => downloadText("setup.secrets.json", files["setup.secrets.json"])}
                      className="border border-[#D4B06A]/55 px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-[#F4E7C2] transition hover:border-[#D4B06A]"
                    >
                      Baixar setup.secrets.json
                    </button>
                  ) : null}
                </div>

                <div className={`mt-6 border px-5 py-4 text-sm leading-7 ${
                  setupMode === "local-ops"
                    ? "border-[#245440] bg-[rgba(36,84,64,0.18)] text-[#CFEBDC]"
                    : "border-[#6F5830] bg-[rgba(111,88,48,0.18)] text-[#F0DEC0]"
                }`}>
                  <p className="text-[11px] uppercase tracking-[0.22em]">
                    {setupMode === "local-ops" ? "Modo local-ops" : "Modo static-safe"}
                  </p>
                  <p className="mt-2">
                    {setupMode === "local-ops"
                      ? "Este runtime pode operar o setup localmente, com salvar no repo e execucao via interface quando as flags estiverem habilitadas."
                      : "Este runtime foi tratado como frontend seguro para deploy estatico. O fluxo recomendado e baixar os arquivos e executar os comandos no terminal local."}
                  </p>
                  <p className="mt-2">
                    {accessMode === "admin"
                      ? "Sessao administrativa detectada: recursos operacionais adicionais podem ser habilitados pelo runtime."
                      : "Sem sessao admin: a pagina permanece utilizavel para preview, checklist e download local dos arquivos de setup."}
                  </p>
                </div>

                {!preview ? (
                  <div className="mt-10 border border-dashed border-white/12 px-6 py-10 text-sm leading-7 text-[#90A29C]">
                    Assim que você preencher as credenciais, esta área mostra o `.env.bootstrap`, os arquivos de config e a `authorize-url.json`
                    para a nova conta. O fluxo recomendado é baixar o `setup.secrets.json`; salvar no servidor fica restrito a runtime local explícito.
                  </div>
                ) : (
                  <div className="mt-8 space-y-6">
                    <div className="grid gap-4 md:grid-cols-3">
                      {preview.requiredChecks.map((item) => (
                        <div key={item.key} className="border border-white/10 px-4 py-4">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">{item.key}</p>
                          <p className={`mt-2 text-sm ${item.present ? "text-[#BFE5D3]" : "text-[#F2C38A]"}`}>
                            {item.present ? "Pronto" : "Pendente"}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="border border-[#233630] bg-[rgba(255,255,255,0.02)] px-5 py-5">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-[#D4B06A]">Checklist de credenciais e conexoes</p>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {(preview.credentialChecklist || []).map((item) => (
                          <div key={`${item.system}-${item.item}`} className="border border-white/10 px-4 py-4">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">{item.system}</p>
                            <p className="mt-2 text-sm text-[#F7F1E8]">{item.item}</p>
                            <p className={`mt-2 text-xs ${item.present ? "text-[#BFE5D3]" : "text-[#F2C38A]"}`}>
                              {item.present ? "Validado no setup" : "Ainda precisa ser preenchido"}
                            </p>
                            <p className="mt-2 text-xs leading-6 text-[#9AA8A3]">{item.help}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {Object.keys(files).map((name) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => setActiveFile(name)}
                          className={`border px-3 py-2 text-[11px] uppercase tracking-[0.16em] transition ${
                            activeFile === name
                              ? "border-[#D4B06A] bg-[#D4B06A] text-[#07110E]"
                              : "border-white/10 text-[#C5D0CB] hover:border-[#496159]"
                          }`}
                        >
                          {name}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={handleDownloadSetupFile}
                        className="border border-[#D4B06A]/55 px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-[#F4E7C2] transition hover:border-[#D4B06A]"
                      >
                        Baixar setup
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveLocal}
                        disabled={saving || !canServerSaveSetup}
                        className="border border-[#D4B06A]/55 px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-[#F4E7C2] transition hover:border-[#D4B06A] disabled:opacity-60"
                      >
                        {saving ? "Salvando local..." : "Salvar no repo local"}
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadText(activeFile, files[activeFile], activeFile.endsWith(".json") ? "application/json;charset=utf-8" : "text/plain;charset=utf-8")}
                        className="border border-white/10 px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-[#F4E7C2] transition hover:border-[#D4B06A]"
                      >
                        Baixar arquivo atual
                      </button>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(files[activeFile] || "")}
                        className="border border-white/10 px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-[#B0BDB8] transition hover:border-[#D4B06A]"
                      >
                        Copiar conteúdo atual
                      </button>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      {[
                        { mode: "validate", label: "Rodar Validate" },
                        { mode: "bootstrap", label: "Rodar Bootstrap" },
                        { mode: "go", label: "Rodar Go Live" },
                        { mode: "sync", label: "Rodar Sync" },
                        { mode: "ops", label: "Rodar Ops" },
                      ].map((item) => (
                        <button
                          key={item.mode}
                          type="button"
                          onClick={() => handleRun(item.mode)}
                          disabled={Boolean(runningMode) || !canRunCommands}
                          className="border border-[#D4B06A]/25 bg-[rgba(255,255,255,0.02)] px-4 py-4 text-[11px] uppercase tracking-[0.18em] text-[#E9DDB9] transition hover:border-[#D4B06A] disabled:opacity-60"
                        >
                          {runningMode === item.mode ? "Executando..." : item.label}
                        </button>
                      ))}
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="block">
                        <span className="mb-2 block text-[11px] uppercase tracking-[0.16em] text-[#B7C3BE]">Confirmação para `go`</span>
                        <input
                          type="text"
                          value={confirmations.go}
                          onChange={(event) => setConfirmations((current) => ({ ...current, go: event.target.value }))}
                          placeholder="EXECUTAR GO"
                          className="w-full border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-[#F5F0E7] outline-none transition placeholder:text-white/20 focus:border-[#D4B06A]"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-2 block text-[11px] uppercase tracking-[0.16em] text-[#B7C3BE]">Confirmação para `ops`</span>
                        <input
                          type="text"
                          value={confirmations.ops}
                          onChange={(event) => setConfirmations((current) => ({ ...current, ops: event.target.value }))}
                          placeholder="EXECUTAR OPS"
                          className="w-full border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-[#F5F0E7] outline-none transition placeholder:text-white/20 focus:border-[#D4B06A]"
                        />
                      </label>
                    </div>

                    <pre className="min-h-[380px] overflow-auto border border-[#1D2724] bg-[rgba(3,6,5,0.96)] p-5 text-xs leading-6 text-[#D0DAD6]">
                      {files[activeFile]}
                    </pre>

                    {runResult ? (
                      <div className="space-y-4 border border-[#233630] bg-[rgba(255,255,255,0.02)] px-5 py-5">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className={`text-[11px] uppercase tracking-[0.2em] ${runResult.ok ? "text-[#BFE5D3]" : "text-[#F2C38A]"}`}>
                            {runResult.ok ? "Execução concluída" : "Execução com falha"}
                          </span>
                          <span className="text-[11px] uppercase tracking-[0.2em] text-white/40">{runResult.command}</span>
                        </div>
                        {runResult.stdout ? (
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.18em] text-[#7D918B]">stdout</p>
                            <pre className="mt-2 max-h-[260px] overflow-auto border border-[#1D2724] bg-[rgba(3,6,5,0.96)] p-4 text-xs leading-6 text-[#D0DAD6]">
                              {runResult.stdout}
                            </pre>
                          </div>
                        ) : null}
                        {runResult.stderr ? (
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.18em] text-[#C88B8B]">stderr</p>
                            <pre className="mt-2 max-h-[220px] overflow-auto border border-[#3A2323] bg-[rgba(35,10,10,0.75)] p-4 text-xs leading-6 text-[#F2C7C7]">
                              {runResult.stderr}
                            </pre>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="border border-[#233630] bg-[rgba(255,255,255,0.02)] px-5 py-5 text-sm leading-7 text-[#A3B2AD]">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-[#D4B06A]">Acionamento</p>
                      <p className="mt-2">1. Clique em `Salvar setup no repo` ou baixe o `setup.secrets.json`.</p>
                      <p>2. Rode `npm run integration:bootstrap` para gerar tudo em `setup/integration-kit/generated`.</p>
                      <p>3. Para `go` e `ops`, a UI exige confirmação explícita: `EXECUTAR GO` ou `EXECUTAR OPS`.</p>
                      <p>4. Rode `npm run integration:go` para aplicar Supabase automaticamente.</p>
                      <p>5. Se preferir, use `setup/integration-kit/bootstrap.ps1` ou `bootstrap.cmd`.</p>
                      <p>6. Use o `authorize-url.json` gerado para concluir o OAuth do Freshworks.</p>
                      <p>7. Depois rode `npm run integration:sync` para puxar produtos, contatos e deals com o bundle atual.</p>
                      <p>8. Antes do bootstrap, rode `npm run integration:validate` para validar credenciais, MCP e cobertura minima.</p>
                      <p>9. Revise `mcp.config.json`, `.mcp.json` e `credential-checklist.json` antes de conectar tudo.</p>
                      {!canServerSaveSetup ? <p>10. Neste modo, `Salvar no repo local` fica desabilitado e o fluxo recomendado e baixar o arquivo.</p> : null}
                      {!canRunCommands ? <p>11. Neste modo, os botoes de execucao ficam desabilitados; rode os comandos no terminal local.</p> : null}
                    </div>
                  </div>
                )}
              </section>
            </section>
          </div>
        </InternoLayout>
      )}
    </OptionalAdminAccess>
  );
}
