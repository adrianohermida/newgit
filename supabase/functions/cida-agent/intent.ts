export function detectIntent(text: string) {
  if (text.match(/\d{7}-?\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/)) return "processo";
  if (text.toLowerCase().includes("agendar")) return "agendamento";
  if (text.toLowerCase().includes("contato")) return "lead";
  return "geral";
}

export function extractCNJ(text: string) {
  const match = text.match(/\d{7}-?\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/);
  return match ? match[0] : null;
}