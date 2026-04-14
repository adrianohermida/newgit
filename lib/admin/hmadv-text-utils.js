export function normalizeText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function cleanPartyName(value) {
  return String(value || "").replace(/^[\s,;:\.\-\u2013\u2014]+/g, "").replace(/^\d+\s+(?=\S)/g, "").replace(/\s+/g, " ").trim();
}

function partyKey(nome, polo) {
  return `${normalizeText(cleanPartyName(nome))}|${String(polo || "").trim().toLowerCase()}`;
}

function normalizeKeyword(value) {
  return normalizeText(value).toUpperCase();
}

export function normalizeCnj(value) {
  const digits = String(value || "").replace(/\D+/g, "");
  return digits.length === 20 ? digits : "";
}

export function extractCnjMentions(text) {
  const matches = String(text || "").match(/\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}|\b\d{20}\b/g) || [];
  return [...new Set(matches.map((item) => normalizeCnj(item)).filter(Boolean))];
}

function tokenizeSimilarityText(value) {
  return [...new Set(normalizeText(value).split(/[^a-z0-9]+/i).map((item) => item.trim()).filter((item) => item.length >= 4 && !["processo", "parte", "autor", "requerente", "requerido", "executado", "executante", "acao", "vara", "juizo", "tribunal"].includes(item)))];
}

export function jaccardSimilarity(left, right) {
  const a = tokenizeSimilarityText(left);
  const b = tokenizeSimilarityText(right);
  if (!a.length || !b.length) return 0;
  const bSet = new Set(b);
  const union = new Set([...a, ...b]).size;
  return union ? a.filter((item) => bSet.has(item)).length / union : 0;
}

export function inferRelationTypeFromText(text) {
  const clean = normalizeText(text);
  if (/\brecurso\b|\bagravo\b|\bapelacao\b/.test(clean)) return "recurso";
  if (/\bincidente\b|\bcumprimento de sentenca\b|\bimpugnacao\b/.test(clean)) return "incidente";
  if (/\bapenso\b|\bautos apensos\b|\bapensad/.test(clean)) return "apenso";
  return "dependencia";
}

export function inferRelationOrientationFromText(text) {
  const clean = normalizeText(text);
  if (/\b(apenso|dependencia|incidente|recurso)\b.{0,50}\b(?:ao|aos|do|dos|da)\b/.test(clean) || /\bprocesso principal\b|\bautos principais\b/.test(clean)) return "mentioned_parent";
  return "source_parent";
}

export function buildSnippet(text, needle = "") {
  const source = String(text || "").replace(/\s+/g, " ").trim();
  if (!source) return "";
  if (!needle) return source.slice(0, 240);
  const index = source.toLowerCase().indexOf(String(needle || "").toLowerCase());
  if (index < 0) return source.slice(0, 240);
  return source.slice(Math.max(0, index - 80), Math.min(source.length, index + Math.max(needle.length, 1) + 120));
}

export function buildPairKey(left, right) {
  return `${String(left || "").trim()}::${String(right || "").trim()}`;
}

export function buildUnorderedPairKey(left, right) {
  return [String(left || "").trim(), String(right || "").trim()].sort().join("::");
}

export function buildSelectionKey(prefix, left, right, relationType = "") {
  return `${prefix}:${String(left || "").trim()}:${String(right || "").trim()}:${String(relationType || "").trim()}`;
}

export function clampPageSize(value, fallback = 20, max = 200) {
  const numeric = Number(value || fallback);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.min(Math.max(1, Math.floor(numeric)), max);
}

export function detectAuctionKeyword(rawPayload) {
  const keywords = Array.isArray(rawPayload?.palavrasChave) ? rawPayload.palavrasChave : [];
  return keywords.map((item) => normalizeKeyword(item)).some((item) => item === "LEILAO" || item === "LEILOES");
}

export function parsePartesFromText(text) {
  const source = String(text || "");
  const match = source.match(/Parte\(s\):\s*([^\n]+(?:\n(?!Advogado|Processo)[^\n]+)*)/i);
  if (!match?.[1]) return [];
  const output = [];
  const regex = /([^()\r\n]{3,}?)\s*\(([AP])\)/g;
  let hit;
  while ((hit = regex.exec(match[1])) !== null) {
    const nome = cleanPartyName(hit[1]);
    if (nome.length < 3) continue;
    output.push({ nome, polo: hit[2] === "A" ? "ativo" : "passivo", tipo_pessoa: /\b(LTDA|S\.A\.|S\/A|ME|EPP|EIRELI|BANCO|FUND|ASSOC|SIND|CORP|GRUPO|EMPRESA|CONSTRUTORA|COMERCIAL|SERVI|INCORPORA)\b/i.test(nome) ? "JURIDICA" : "FISICA", fonte: "publicacao" });
  }
  return output.reduce((acc, item) => {
    const key = partyKey(item.nome, item.polo);
    if (!acc.some((row) => partyKey(row.nome, row.polo) === key)) acc.push(item);
    return acc;
  }, []);
}
