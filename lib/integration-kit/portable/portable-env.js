"use strict";

function cleanValue(value) {
  const text = String(value || "").trim();
  return text || null;
}

function toEnvKey(label) {
  return String(label || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function ensureHttps(value, fallback = null) {
  const text = cleanValue(value);
  if (!text) return fallback;
  if (/^https?:\/\//i.test(text)) return text.replace(/\/+$/, "");
  return `https://${text.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

function hostOnly(value) {
  const text = cleanValue(value);
  if (!text) return null;
  return text.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

function firstEnv(names, env = {}) {
  for (const name of names) {
    const value = cleanValue(env[name]);
    if (value) return value;
  }
  return null;
}

function parseJsonEnv(value, fallback) {
  const text = cleanValue(value);
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function formatEnvFile(definitions, env = {}) {
  const lines = [];
  let currentGroup = null;

  for (const definition of definitions) {
    if (definition.group !== currentGroup) {
      currentGroup = definition.group;
      if (lines.length) lines.push("");
      lines.push(`# ${currentGroup}`);
    }

    if (definition.description) lines.push(`# ${definition.description}`);
    const currentValue = cleanValue(env[definition.key]);
    const value = definition.secret ? "" : currentValue || definition.placeholder || definition.defaultValue || "";
    lines.push(`${definition.key}=${value}`);
  }

  return `${lines.join("\n")}\n`;
}

module.exports = {
  cleanValue,
  ensureHttps,
  firstEnv,
  formatEnvFile,
  hostOnly,
  parseJsonEnv,
  toEnvKey,
};
