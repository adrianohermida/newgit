import { normalizeText } from "./hmadv-text-utils.js";

export function testAudienciaSignal(text) {
  const clean = normalizeText(text);
  if (!clean || clean.includes("deixo de designar audiencia")) return false;
  return /(designad[ao].{0,40}audi|redesignad[ao].{0,40}audi|sessao de julgamento|audiencia.{0,200}\d{2}\/\d{2}\/\d{4})/i.test(clean);
}

export function extractAudienciaDate(text) {
  const clean = normalizeText(text);
  const patterns = [/design[oa].{0,120}audiencia[\s\S]{0,240}?(\d{2}\/\d{2}\/\d{4})/i, /audiencia[\s\S]{0,240}?dia\s+(\d{2}\/\d{2}\/\d{4})/i, /sessao de julgamento[\s\S]{0,240}?(\d{2}\/\d{2}\/\d{4})/i, /(\d{2}\/\d{2}\/\d{4})[\s\S]{0,140}(?:audiencia|sessao de julgamento)/i];
  for (const pattern of patterns) {
    const match = clean.match(pattern);
    if (!match?.[1]) continue;
    const [dd, mm, yyyy] = match[1].split("/");
    const dt = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  return null;
}

export function extractAudienciaTime(text) {
  const clean = normalizeText(text);
  const match = clean.match(/(?:as)\s*(\d{1,2}:\d{2})\s*h?/i) || clean.match(/(\d{1,2}:\d{2})\s*h/i);
  return match?.[1] || null;
}

export function extractAudienciaLocal(text) {
  const original = String(text || "");
  const orgao = original.match(/órgão:\s*([^\.]+?)(?:tipo de comunicação:|tipo de documento:|meio:|parte\(s\):)/i);
  if (orgao?.[1]) return orgao[1].trim();
  const sala = original.match(/sala de audiências da\s+([^,\n]+)/i);
  return sala?.[1] ? sala[1].trim() : null;
}

export function buildAudienciaTipo(text) {
  const clean = normalizeText(text);
  if (clean.includes("sessao de julgamento")) return "sessao_julgamento";
  if (clean.includes("audiencia una")) return "audiencia_una";
  return "audiencia";
}

export function buildAudienciaResumo(text, date) {
  const clean = normalizeText(text);
  const label = clean.includes("sessao de julgamento") ? "Sessao de julgamento" : clean.includes("audiencia una") ? "Audiencia una" : "Audiencia";
  return `${label} em ${date.toLocaleDateString("pt-BR")}`;
}
