import { useCallback, useEffect, useState } from "react";
import InternoLayout from "../../components/interno/InternoLayout";
import RequireAdmin from "../../components/interno/RequireAdmin";

const BRIDGE_URL        = "http://127.0.0.1:32123";
const EXTENSION_VERSION = "9.1.0";

const PROVIDERS = [
  { id: "local",      label: "AetherLab Local",      desc: "ai-core em 127.0.0.1:8010 — modo offline, zero latência.", color: "#16a34a", bg: "#dcfce7" },
  { id: "cloud",      label: "LLM Customizado",       desc: "Endpoint cloud via CUSTOM_LLM_BASE_URL / PROCESS_AI_BASE.", color: "#7c3aed", bg: "#ede9fe" },
  { id: "cloudflare", label: "Cloudflare Workers AI", desc: "Workers AI via bridge ou API REST (account_id + token).",    color: "#f97316", bg: "#fff7ed" },
];

const FEATURES = [
  { icon: "💬", title: "Chat com contexto de página", desc: "Injeta o texto da aba ativa diretamente na conversa com o LLM." },
  { icon: "📸", title: "Screenshots para análise",    desc: "Captura a tela e envia para o agente analisar o conteúdo visual." },
  { icon: "📎", title: "Upload de arquivos",          desc: "Envia arquivos (txt, json, csv, código) para análise pelo agente." },
  { icon: "⏺", title: "Gravação de navegação",       desc: "Grava cliques, inputs e navegação do usuário como sequências reutilizáveis." },
  { icon: "▶", title: "Replay de automações",        desc: "O agente reproduz automaticamente as sequências gravadas em qualquer aba." },
  { icon: "🧠", title: "Memória persistente",         desc: "Sessões salvas e sincronizadas com a memória do ai-core via bridge." },
];

const STEPS = {
  chrome: [
    'Clique em "Baixar extensão (.zip)" abaixo — o download começa direto do bridge local.',
    "Extraia o arquivo .zip em qualquer pasta do computador.",
    "Abra chrome://extensions no Chrome.",
    "Ative o «Modo do desenvolvedor» no canto superior direito.",
    "Clique em «Carregar sem compactação» → selecione a pasta extraída.",
    "O ícone do assistente aparece na barra de extensões. Pronto.",
  ],
  edge: [
    'Clique em "Baixar extensão (.zip)" abaixo.',
    "Extraia o arquivo .zip em qualquer pasta.",
    "Abra edge://extensions no Edge.",
    "Ative o «Modo do desenvolvedor» (canto inferior esquerdo).",
    "Clique em «Carregar sem compactação» → selecione a pasta extraída.",
    "O ícone aparece na barra do Edge. A extensão é idêntica ao Chrome (Manifest V3).",
  ],
  widget: [
    "Com a extensão instalada no Edge, clique no ícone de barra lateral (⊞) no canto superior direito.",
    "Selecione «Universal LLM Assistant» na lista de extensões do painel lateral.",
    "O chat fica fixo na coluna direita e persiste entre navegações.",
    "Para ancorar permanentemente: edge://settings/sidebar → ative a extensão no painel.",
    "No Windows 11 com Edge ≥ 114: o painel lateral é nativo e não some ao trocar de aba.",
  ],
};

// ─── Bridge probe ─────────────────────────────────────────────────────────────
async function probeBridge() {
  try {
    const res = await fetch(`${BRIDGE_URL}/health`, {
      signal: AbortSignal.timeout(2800),
    });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const data = await res.json();
    return { ok: true, version: data.version, data };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function Badge({ ok, label }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: ok ? "#dcfce7" : "#fee2e2",
      color: ok ? "#16a34a" : "#dc2626",
      padding: "2px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", display: "inline-block" }} />
      {label}
    </span>
  );
}

function Steps({ items }) {
  return (
    <ol style={{ paddingLeft: 18, display: "flex", flexDirection: "column", gap: 7 }}>
      {items.map((s, i) => (
        <li key={i} style={{ fontSize: 13, color: "#374151", lineHeight: 1.6 }}>{s}</li>
      ))}
    </ol>
  );
}

function Tab({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: "7px 16px", borderRadius: 6, border: "none",
      background: active ? "#1e3a5f" : "transparent",
      color: active ? "#fff" : "#6b7280",
      fontWeight: 600, fontSize: 13, cursor: "pointer",
    }}>{children}</button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
function ExtensaoContent() {
  const [bridge,   setBridge]   = useState(null);
  const [checking, setChecking] = useState(false);
  const [activeTab, setActiveTab] = useState("chrome");

  const check = useCallback(async () => {
    setChecking(true);
    setBridge(await probeBridge());
    setChecking(false);
  }, []);

  useEffect(() => {
    check();
    const t = setInterval(check, 15000);
    return () => clearInterval(t);
  }, [check]);

  // O download vai direto ao bridge local — sem auth, sem proxy Next.js
  const downloadUrl = `${BRIDGE_URL}/download`;

  return (
    <div style={{ maxWidth: 840, margin: "0 auto", padding: "32px 24px", fontFamily: "system-ui, sans-serif" }}>

      {/* Título */}
      <div style={{ marginBottom: 28 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: "#9a6d14", textTransform: "uppercase", letterSpacing: ".15em", marginBottom: 6 }}>
          Extensão do Navegador · v{EXTENSION_VERSION}
        </p>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: "#111827", margin: 0, marginBottom: 8 }}>
          Universal LLM Assistant
        </h1>
        <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6, maxWidth: 560 }}>
          Painel flutuante com IA integrada ao repositório. Grava sessões, captura telas,
          analisa arquivos e registra automações de navegação para replay pelo agente de IA.
        </p>
      </div>

      {/* Status + Download */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>

        {/* Bridge */}
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "16px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".1em", margin: 0 }}>Bridge Local</p>
            <Badge ok={bridge?.ok} label={bridge === null ? "..." : bridge.ok ? `v${bridge.version}` : "Offline"} />
          </div>
          <p style={{ fontSize: 13, color: "#374151", marginBottom: 6 }}>
            Porta <code style={{ background: "#f3f4f6", padding: "1px 5px", borderRadius: 3, fontSize: 11 }}>32123</code>
          </p>
          {bridge?.ok && (
            <p style={{ fontSize: 11, color: "#6b7280", margin: "0 0 8px" }}>
              {bridge.data?.data?.sessions ?? 0} sessões · {bridge.data?.data?.automations ?? 0} automações · {bridge.data?.data?.screenshots ?? 0} screenshots
            </p>
          )}
          {!bridge?.ok && (
            <code style={{ display: "block", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 6, padding: "8px 10px", fontSize: 11, color: "#374151", marginBottom: 8 }}>
              npm run start:universal-llm-extension
            </code>
          )}
          <button onClick={check} disabled={checking} style={{ padding: "5px 12px", fontSize: 11, borderRadius: 5, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}>
            {checking ? "Verificando..." : "Verificar agora"}
          </button>
        </div>

        {/* Download */}
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "16px 18px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 8 }}>Download</p>
            <p style={{ fontSize: 13, color: "#374151", marginBottom: 4 }}>Manifest V3 · Chrome · Edge</p>
            <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 12 }}>
              O download é servido diretamente pelo bridge local.<br />
              {!bridge?.ok && <span style={{ color: "#dc2626" }}>Inicie o bridge para habilitar o download.</span>}
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <a
              href={bridge?.ok ? downloadUrl : undefined}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-block", padding: "9px 18px", borderRadius: 7,
                background: bridge?.ok ? "#1e3a5f" : "#9ca3af",
                color: "#fff", fontWeight: 700, fontSize: 13,
                textDecoration: "none", textAlign: "center",
                cursor: bridge?.ok ? "pointer" : "not-allowed",
                pointerEvents: bridge?.ok ? "auto" : "none",
              }}
            >
              Baixar extensão (.zip)
            </a>
            <p style={{ fontSize: 11, color: "#9ca3af", margin: 0 }}>
              Ou reconstrua: <code style={{ fontSize: 10 }}>npm run build:extension</code>
            </p>
          </div>
        </div>
      </div>

      {/* Providers */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 10 }}>
          Providers LLM integrados
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          {PROVIDERS.map(p => {
            const prov = bridge?.data?.providers?.[p.id];
            const ok   = p.id === "local"
              ? Boolean(prov?.candidates?.length)
              : Boolean(prov?.configured || prov?.directApi);
            return (
              <div key={p.id} style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: 8, padding: "11px 12px", borderLeft: `3px solid ${p.color}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 11, color: p.color }}>{p.label}</span>
                  {bridge?.ok && <Badge ok={ok} label={ok ? "OK" : "N/C"} />}
                </div>
                <p style={{ fontSize: 11, color: "#6b7280", margin: 0, lineHeight: 1.5 }}>{p.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Features */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 10 }}>
          Funcionalidades
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {FEATURES.map((f, i) => (
            <div key={i} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 12px" }}>
              <p style={{ fontSize: 18, marginBottom: 5 }}>{f.icon}</p>
              <p style={{ fontWeight: 700, fontSize: 12, marginBottom: 3 }}>{f.title}</p>
              <p style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.5, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Guia de instalação */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 4, padding: "9px 13px", borderBottom: "1px solid #e5e7eb", background: "#f9fafb" }}>
          <Tab active={activeTab === "chrome"} onClick={() => setActiveTab("chrome")}>Chrome</Tab>
          <Tab active={activeTab === "edge"}   onClick={() => setActiveTab("edge")}>Edge</Tab>
          <Tab active={activeTab === "widget"} onClick={() => setActiveTab("widget")}>Sidebar / Widget</Tab>
        </div>
        <div style={{ padding: "18px 22px" }}>
          {activeTab === "chrome" && (
            <>
              <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 13, color: "#111827" }}>Instalar no Google Chrome</p>
              <Steps items={STEPS.chrome} />
              <div style={{ marginTop: 14, padding: "9px 13px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 7 }}>
                <p style={{ fontSize: 12, color: "#92400e", margin: 0 }}>O «Modo do desenvolvedor» precisa ficar ativo para carregar extensões locais. Para uso em produção, publique na Chrome Web Store.</p>
              </div>
            </>
          )}
          {activeTab === "edge" && (
            <>
              <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 13, color: "#111827" }}>Instalar no Microsoft Edge</p>
              <Steps items={STEPS.edge} />
              <div style={{ marginTop: 14, padding: "9px 13px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 7 }}>
                <p style={{ fontSize: 12, color: "#1e40af", margin: 0 }}>Edge usa o mesmo Manifest V3 do Chrome. A extensão funciona sem alterações. Para publicação use o Edge Add-ons Partner Center.</p>
              </div>
            </>
          )}
          {activeTab === "widget" && (
            <>
              <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 13, color: "#111827" }}>Painel fixo na coluna direita (Edge Sidebar)</p>
              <Steps items={STEPS.widget} />
              <div style={{ marginTop: 14, padding: "9px 13px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 7 }}>
                <p style={{ fontSize: 12, color: "#166534", margin: 0 }}>O Edge Sidebar mantém o chat visível ao lado de qualquer site. No Windows 11, o painel persiste mesmo ao trocar de aba — comportamento nativo de widget.</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Comandos de setup */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "16px 20px" }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 10 }}>
          Setup completo
        </p>
        <div style={{ background: "#0f172a", borderRadius: 8, padding: "13px 16px", fontFamily: "monospace", fontSize: 12, color: "#e2e8f0", lineHeight: 1.8 }}>
          <span style={{ color: "#64748b" }}># 1. Gerar ícones e empacotar a extensão</span><br />
          <span style={{ color: "#34d399" }}>cd</span> universal-llm-extension<br />
          node build-all.js<br />
          <br />
          <span style={{ color: "#64748b" }}># 2. Iniciar o bridge local (porta 32123)</span><br />
          <span style={{ color: "#34d399" }}>cd</span> ..<br />
          npm run start:universal-llm-extension<br />
          <br />
          <span style={{ color: "#64748b" }}># 3. Acessar esta página e clicar em "Baixar extensão"</span><br />
          <span style={{ color: "#64748b" }}># 4. Extrair o .zip e carregar no Chrome/Edge</span>
        </div>
      </div>

    </div>
  );
}

export default function Extensao() {
  return (
    <RequireAdmin>
      <InternoLayout title="Extensão LLM" activeSection="extensao">
        <ExtensaoContent />
      </InternoLayout>
    </RequireAdmin>
  );
}
