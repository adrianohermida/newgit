export function sanitizePortalCopy(message) {
  const text = String(message || "").trim();
  if (!text) return "";

  return text
    .replace(/Freshsales/gi, "sistema do escritorio")
    .replace(/Freshdesk/gi, "central de atendimento")
    .replace(/\bCRM\b/gi, "cadastro interno")
    .replace(/schema judici[aá]rio/gi, "base processual")
    .replace(/\bdeals\b/gi, "lancamentos")
    .replace(/\bdeal\b/gi, "lancamento")
    .replace(/\btickets\b/gi, "solicitacoes")
    .replace(/\bticket\b/gi, "solicitacao")
    .replace(/sync snapshots/gi, "sincronizacoes")
    .replace(/snapshots/gi, "sincronizacoes")
    .replace(/Supabase/gi, "base do portal");
}

export function sanitizePortalList(messages = []) {
  return (messages || []).map((message) => sanitizePortalCopy(message)).filter(Boolean);
}
