import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const DEFAULT_MAX_INDEXED_NOTES = 256;
const INDEX_CACHE_MAX_SIZE = 16;
const INDEX_CACHE = new Map();

function getClean(value) {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function getObsidianVaultPath(env) {
  return (
    getClean(env.DOTOBOT_OBSIDIAN_VAULT_PATH) ||
    getClean(env.LAWDESK_OBSIDIAN_VAULT_PATH) ||
    getClean(env.OBSIDIAN_VAULT_PATH) ||
    null
  );
}

export function canUseObsidian(env) {
  return Boolean(getObsidianVaultPath(env));
}

export function buildObsidianHealthConfig(env) {
  const vaultPath = getObsidianVaultPath(env);
  return {
    enabled: canUseObsidian(env),
    vaultPathConfigured: Boolean(vaultPath),
    vaultPath: vaultPath || null,
    memoryDir: vaultPath ? path.join(vaultPath, "Dotobot", "Memory") : null,
  };
}

function getMaxIndexedNotes(env) {
  const raw = getClean(env?.DOTOBOT_OBSIDIAN_RAG_MAX_FILES);
  if (!raw) return DEFAULT_MAX_INDEXED_NOTES;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_INDEXED_NOTES;
}

function normalizeTokenSet(value) {
  return new Set(
    String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 2)
  );
}

function escapeFrontmatterValue(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

function parseFrontmatter(source) {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/m.exec(source);
  if (!match) {
    return { frontmatter: {}, body: source };
  }

  const frontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) continue;
    const key = trimmed.slice(0, colonIndex).trim();
    const rawValue = trimmed.slice(colonIndex + 1).trim();
    frontmatter[key] = rawValue.replace(/^"|"$/g, "").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }

  return { frontmatter, body: match[2] || "" };
}

function stripMarkdownSections(body) {
  return String(body || "")
    .replace(/^#\s+Query\s*$/im, "")
    .replace(/^#\s+Response\s*$/im, "")
    .replace(/^#\s+Metadata\s*$/im, "")
    .replace(/^\s*-\s+/gm, "")
    .trim();
}

function buildNoteContent(payload) {
  const query = String(payload.query || "").trim();
  const responseText = String(payload.responseText || "").trim();
  const summary = String(payload.summary || responseText.slice(0, 280)).trim();
  const createdAt = String(payload.created_at || payload.createdAt || new Date().toISOString());
  const updatedAt = String(payload.updated_at || payload.updatedAt || createdAt);

  const frontmatter = [
    "---",
    `source: dotobot`,
    `source_key: "${escapeFrontmatterValue(payload.source_key)}"`,
    `session_id: "${escapeFrontmatterValue(payload.session_id || "anonymous")}"`,
    `route: "${escapeFrontmatterValue(payload.route || "/interno")}"`,
    `role: "${escapeFrontmatterValue(payload.role || "")}"`,
    `status: "${escapeFrontmatterValue(payload.status || "ok")}"`,
    `steps_count: "${escapeFrontmatterValue(payload.steps_count ?? 0)}"`,
    `embedding_model: "${escapeFrontmatterValue(payload.embedding_model || "supabase/gte-small")}"`,
    `embedding_dimensions: "${escapeFrontmatterValue(payload.embedding_dimensions ?? 768)}"`,
    `created_at: "${escapeFrontmatterValue(createdAt)}"`,
    `updated_at: "${escapeFrontmatterValue(updatedAt)}"`,
    "---",
  ].join("\n");

  return [
    frontmatter,
    "# Query",
    query,
    "",
    "# Response",
    responseText,
    "",
    "# Metadata",
    `- Summary: ${summary}`,
    payload.fallback_reason ? `- Fallback: ${payload.fallback_reason}` : null,
    payload.note_type ? `- Type: ${payload.note_type}` : null,
    payload.tags?.length ? `- Tags: ${payload.tags.join(", ")}` : null,
    "",
  ]
    .filter(Boolean)
    .join("\n");
}

function scoreNote(queryTokens, title, body) {
  if (!queryTokens.size) return 0;

  const bodyTokens = normalizeTokenSet(body);
  const titleTokens = normalizeTokenSet(title);
  let score = 0;

  for (const token of queryTokens) {
    if (bodyTokens.has(token)) score += 1;
    if (titleTokens.has(token)) score += 1.5;
  }

  const normalizedBody = String(body || "").toLowerCase();
  const queryPhrase = Array.from(queryTokens).join(" ");
  if (queryPhrase && normalizedBody.includes(queryPhrase)) {
    score += 2;
  }

  return score;
}

async function collectMarkdownFiles(rootDir) {
  const stack = [rootDir];
  const files = [];

  while (stack.length) {
    const currentDir = stack.pop();
    let entries = [];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.name === ".obsidian") continue;
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function getCacheEntry(cacheKey) {
  const entry = INDEX_CACHE.get(cacheKey) || null;
  if (!entry) return null;
  INDEX_CACHE.delete(cacheKey);
  INDEX_CACHE.set(cacheKey, entry);
  return entry;
}

function setCacheEntry(cacheKey, value) {
  if (INDEX_CACHE.has(cacheKey)) {
    INDEX_CACHE.delete(cacheKey);
  }
  while (INDEX_CACHE.size >= INDEX_CACHE_MAX_SIZE) {
    const oldestKey = INDEX_CACHE.keys().next().value;
    INDEX_CACHE.delete(oldestKey);
  }
  INDEX_CACHE.set(cacheKey, value);
}

export async function writeObsidianMemory(env, payload = {}) {
  if (!canUseObsidian(env)) {
    return { stored: false, skipped: true };
  }

  const vaultPath = getObsidianVaultPath(env);
  if (!vaultPath) {
    return { stored: false, skipped: true };
  }

  const sourceKey = String(payload.source_key || "").trim() || createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const memoryDir = path.join(vaultPath, "Dotobot", "Memory");
  const notePath = path.join(memoryDir, `${sourceKey}.md`);
  const content = buildNoteContent({
    ...payload,
    source_key: sourceKey,
  });

  await fs.mkdir(memoryDir, { recursive: true });
  await fs.writeFile(notePath, content, "utf8");

  return {
    stored: true,
    path: notePath,
    source_key: sourceKey,
  };
}

export async function queryObsidianMemory(env, { query, topK = 5 } = {}) {
  if (!canUseObsidian(env) || !query) {
    return [];
  }

  const vaultPath = getObsidianVaultPath(env);
  if (!vaultPath) {
    return [];
  }

  const memoryDir = path.join(vaultPath, "Dotobot", "Memory");
  const files = await collectMarkdownFiles(memoryDir);
  const maxIndexedNotes = getMaxIndexedNotes(env);
  const recentFiles = [];
  for (const filePath of files) {
    try {
      const stats = await fs.stat(filePath);
      recentFiles.push({ filePath, mtimeMs: stats.mtimeMs });
    } catch {
      // Ignore files that disappear between discovery and stat.
    }
  }

  recentFiles.sort((left, right) => right.mtimeMs - left.mtimeMs);
  const selectedFiles = recentFiles.slice(0, maxIndexedNotes);
  const queryTokens = normalizeTokenSet(query);
  const candidates = [];
  const cacheKey = path.resolve(memoryDir);
  const cache = getCacheEntry(cacheKey) || { notes: new Map() };
  const activePaths = new Set(selectedFiles.map((item) => item.filePath));

  for (const existingPath of Array.from(cache.notes.keys())) {
    if (!activePaths.has(existingPath)) {
      cache.notes.delete(existingPath);
    }
  }

  for (const { filePath, mtimeMs } of selectedFiles) {
    try {
      const cached = cache.notes.get(filePath);
      let entry = cached;
      if (!entry || entry.mtimeMs !== mtimeMs) {
        const raw = await fs.readFile(filePath, "utf8");
        const { frontmatter, body } = parseFrontmatter(raw);
        entry = {
          mtimeMs,
          frontmatter,
          searchableText: stripMarkdownSections(body),
        };
        cache.notes.set(filePath, entry);
      }

      const score = scoreNote(
        queryTokens,
        entry.frontmatter.title || path.basename(filePath, ".md"),
        entry.searchableText
      );
      if (score <= 0) continue;

      candidates.push({
        id: entry.frontmatter.source_key || path.basename(filePath, ".md"),
        score,
        text: entry.searchableText.slice(0, 1200),
        metadata: {
          source: "obsidian",
          source_key: entry.frontmatter.source_key || path.basename(filePath, ".md"),
          file_path: filePath,
          title: entry.frontmatter.title || path.basename(filePath, ".md"),
          session_id: entry.frontmatter.session_id || null,
          route: entry.frontmatter.route || null,
          role: entry.frontmatter.role || null,
          status: entry.frontmatter.status || null,
          created_at: entry.frontmatter.created_at || new Date().toISOString(),
        },
      });
    } catch {
      // Ignore unreadable files and keep scanning other notes.
      cache.notes.delete(filePath);
    }
  }

  setCacheEntry(cacheKey, cache);

  return candidates
    .sort((left, right) => right.score - left.score)
    .slice(0, topK);
}
