export function getStatusPresentation({ extensionReady, checking, consentGranted, error, handshakeState, lastResponse, browserOrigin }) {
  if (error) return { code: "error", label: "Erro", tone: "border-[#5b2d2d] bg-[rgba(91,45,45,0.18)] text-[#f2d0d0]", summary: error };
  if (checking) return { code: "checking", label: "Verificando", tone: "border-[#6f5a2d] bg-[rgba(98,79,34,0.16)] text-[#f1dfb5]", summary: "Buscando resposta da extensao no navegador atual." };
  if (handshakeState === "timeout") {
    return {
      code: "timeout",
      label: "Sem handshake",
      tone: "border-[#6f5a2d] bg-[rgba(98,79,34,0.16)] text-[#f1dfb5]",
      summary: `Nenhuma resposta do content script nesta origem (${browserOrigin || "origem desconhecida"}). Recarregue a aba apos atualizar a extensao e confirme a permissao no site atual.`,
    };
  }
  if (extensionReady && consentGranted) return { code: "active", label: "Ativa", tone: "border-[#234034] bg-[rgba(35,64,52,0.18)] text-[#bde7c9]", summary: "A extensao esta conectada e liberada para comandos assistidos." };
  if (extensionReady) return { code: "connected", label: "Conectada", tone: "border-[#35554B] bg-[rgba(53,85,75,0.16)] text-[#c7dfd5]", summary: "A extensao respondeu ao bridge, mas ainda falta confirmar o consentimento operacional." };
  if (lastResponse?.error) {
    return {
      code: "partial",
      label: "Handshake parcial",
      tone: "border-[#6f5a2d] bg-[rgba(98,79,34,0.16)] text-[#f1dfb5]",
      summary: `A extensao respondeu, mas rejeitou o ultimo comando: ${lastResponse.error}`,
    };
  }
  return { code: "missing", label: "Nao detectada", tone: "border-[#6f5a2d] bg-[rgba(98,79,34,0.16)] text-[#f1dfb5]", summary: "Nenhuma resposta da Universal LLM Assistant neste navegador." };
}

export function ExtensionDebugEvents({ debugEvents }) {
  if (!debugEvents.length) return <p className="mt-3 text-xs leading-6 text-[#9BAEA8]">Nenhum evento registrado ainda nesta sessao. Use "Verificar conexao" ou recarregue a aba.</p>;
  return <div className="mt-3 space-y-2">{debugEvents.map((event) => <div key={event.id} className="rounded-[14px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-3 text-xs text-[#9BAEA8]"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2 py-1 uppercase tracking-[0.14em] ${event.direction === "in" ? "border-[#234034] text-[#bde7c9]" : "border-[#35554B] text-[#c7dfd5]"}`}>{event.direction === "in" ? "entrada" : "saida"}</span><span className="font-semibold text-[#E8E0D2]">{event.type || "unknown"}</span>{event.command ? <span>cmd: {event.command}</span> : null}{event.requestId ? <span>req: {event.requestId}</span> : null}</div><p className="mt-2 break-all">{event.source || "sem source"} • {event.timestamp}</p></div>)}</div>;
}
