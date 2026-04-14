import { useEffect, useMemo, useState } from "react";
import useDotobotExtensionBridge from "./DotobotExtensionBridge";
import { ExtensionDebugEvents, getStatusPresentation } from "./dotobotExtensionManagerStatus";

export default function DotobotExtensionManager() {
  const { extensionReady, lastResponse, debugEvents, probeExtension } = useDotobotExtensionBridge();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [consentGranted, setConsentGranted] = useState(false);
  const [browserOrigin, setBrowserOrigin] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setConsentGranted(window.localStorage.getItem("dotobot_extension_consent") === "granted");
    setBrowserOrigin(window.location.origin || "");
  }, []);

  async function handleCheckConnection() {
    setChecking(true);
    setError("");
    try {
      const response = await probeExtension();
      if (!response) setError("A extensao nao respondeu ao handshake via content script. Verifique se ela esta ativa, com permissao no site atual, e recarregue a aba apos instalar ou atualizar.");
    } catch (probeError) {
      setError(probeError?.message || "Falha ao verificar a extensao.");
    } finally {
      setChecking(false);
    }
  }

  function handleInstall() {
    window.open("https://github.com/adrianohermida/universal-llm-assistant/releases/latest", "_blank", "noopener,noreferrer");
  }

  function handleConsent() {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("dotobot_extension_consent", "granted");
    setConsentGranted(true);
    setError("");
  }

  function handleRevokeConsent() {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem("dotobot_extension_consent");
    setConsentGranted(false);
  }

  const status = useMemo(() => getStatusPresentation({ extensionReady, checking, consentGranted, error }), [checking, consentGranted, error, extensionReady]);

  return (
    <section className="mt-6 rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.03)] p-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#C5A059]">Universal LLM Assistant</p><h2 className="mt-2 text-xl font-semibold text-[#F4F1EA]">Extensao do navegador</h2><p className="mt-2 max-w-3xl text-sm leading-7 text-[#C7D0CA]">Integra navegacao web, leitura local assistida e acoes operacionais avancadas ao Dotobot, com validacao humana e branding do escritorio.</p></div><div className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${status.tone}`}>Status: {status.label}</div></div>
      <div className="mt-4 rounded-[18px] border border-[#22342F] bg-[rgba(7,9,8,0.72)] p-4"><p className="text-sm leading-7 text-[#E8E0D2]">{status.summary}</p>{lastResponse ? <div className="mt-3 grid gap-2 text-xs text-[#9BAEA8] md:grid-cols-3"><p>Ultima resposta: {lastResponse.type || "n/a"}</p><p>Request ID: {lastResponse.requestId || "n/a"}</p><p>Source: {lastResponse.source || "n/a"}</p></div> : null}<div className="mt-4 grid gap-3 text-xs text-[#9BAEA8] md:grid-cols-2"><div className="rounded-[14px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-3"><p className="font-semibold text-[#E8E0D2]">Origem atual da aba</p><p className="mt-1 break-all">{browserOrigin || "indisponivel"}</p><p className="mt-2 opacity-80">A extensao precisa estar ativa e com permissao exatamente nesta origem.</p></div><div className="rounded-[14px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-3"><p className="font-semibold text-[#E8E0D2]">Handshake esperado</p><p className="mt-1">Frontend envia `DOTOBOT_EXTENSION_PING` e `DOTOBOT_COMMAND`.</p><p className="mt-1">Extensao deve responder com `EXTENSION_READY` ou `EXTENSION_RESPONSE`.</p></div></div></div>
      <div className="mt-4 rounded-[18px] border border-[#22342F] bg-[rgba(7,9,8,0.72)] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-semibold text-[#E8E0D2]">Debug do bridge</p><span className="rounded-full border border-[#22342F] px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-[#9BAEA8]">{debugEvents.length} evento(s)</span></div><ExtensionDebugEvents debugEvents={debugEvents} /></div>
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={handleInstall} className="rounded-2xl border border-[#C5A059] px-4 py-2 text-sm font-semibold text-[#C5A059] transition hover:bg-[#C5A059] hover:text-[#1A1A1A]">Instalar / atualizar</button><button type="button" onClick={handleCheckConnection} className="rounded-2xl border border-[#22342F] px-4 py-2 text-sm text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">{checking ? "Verificando..." : "Verificar conexao"}</button><button type="button" onClick={handleConsent} disabled={!extensionReady} className="rounded-2xl border border-[#234034] px-4 py-2 text-sm text-[#8FCFA9] transition disabled:opacity-40 hover:border-[#8FCFA9]">Autorizar uso interno</button><button type="button" onClick={handleRevokeConsent} className="rounded-2xl border border-[#22342F] px-4 py-2 text-sm text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]">Revogar</button></div>
      <ul className="mt-4 space-y-2 text-xs leading-6 text-[#C5A059]"><li>O Dotobot so deve acionar a extensao em fluxos que exigem web search ou acesso local explicito.</li><li>O consentimento fica persistido no navegador atual e pode ser revogado a qualquer momento.</li><li>Sem resposta do bridge, o modulo continua funcionando apenas com providers web, Cloudflare Workers AI e LLM local HTTP.</li><li>Se o servidor local estiver no ar e mesmo assim nao houver resposta, quase sempre o content script nao foi injetado nesta aba.</li></ul>
    </section>
  );
}
