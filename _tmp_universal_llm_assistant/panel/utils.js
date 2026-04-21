export const $ = (id) => document.getElementById(id);

export function escHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderMarkdown(text) {
  const lines = String(text || "").split("\n");
  const out = [];
  let inCodeBlock = false;
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];

    // fenced code blocks
    if (raw.trimStart().startsWith("```")) {
      if (inList) { out.push("</ul>"); inList = false; }
      inCodeBlock = !inCodeBlock;
      out.push(inCodeBlock ? "<pre><code>" : "</code></pre>");
      continue;
    }
    if (inCodeBlock) { out.push(escHtml(raw)); continue; }

    // close list when non-list line appears
    const listMatch = raw.match(/^(\s*[-*+]|\s*\d+\.)\s+(.*)$/);
    if (!listMatch && inList) { out.push("</ul>"); inList = false; }

    // headings
    const h3 = raw.match(/^###\s+(.+)$/);
    const h2 = raw.match(/^##\s+(.+)$/);
    const h1 = raw.match(/^#\s+(.+)$/);
    if (h1) { out.push(`<strong style="display:block;font-size:1.1em;margin:.4em 0">${inlineMarkdown(h1[1])}</strong>`); continue; }
    if (h2) { out.push(`<strong style="display:block;margin:.3em 0">${inlineMarkdown(h2[1])}</strong>`); continue; }
    if (h3) { out.push(`<strong>${inlineMarkdown(h3[1])}</strong><br>`); continue; }

    // unordered / ordered list items
    if (listMatch) {
      if (!inList) { out.push("<ul style='margin:.2em 0;padding-left:1.2em'>"); inList = true; }
      out.push(`<li>${inlineMarkdown(listMatch[2])}</li>`);
      continue;
    }

    // horizontal rule
    if (/^[-*_]{3,}$/.test(raw.trim())) { out.push("<hr style='border:none;border-top:1px solid #e2e8f0;margin:.4em 0'>"); continue; }

    // blank line → paragraph break
    if (!raw.trim()) { out.push("<br>"); continue; }

    out.push(inlineMarkdown(raw) + "<br>");
  }

  if (inList) out.push("</ul>");
  if (inCodeBlock) out.push("</code></pre>");

  return out.join("");
}

function inlineMarkdown(text) {
  return escHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

export function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export async function safeFetch(url, opts = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Timeout ao consultar ${url} em ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function parseJsonResponse(res) {
  const raw = await res.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Resposta nao-JSON (${res.status}). Trecho: ${raw.slice(0, 120).replace(/\s+/g, " ")}`);
  }
}
