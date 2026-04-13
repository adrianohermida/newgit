"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_PROJECT_ROOT = path.resolve(/*turbopackIgnore: true*/ __dirname, "../..");

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

function loadEnvFile(filePath, target = process.env) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { loaded: false, filePath, keys: [] };
  }

  const keys = [];
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1);
    if (!key || target[key] !== undefined) continue;
    target[key] = value;
    keys.push(key);
  }

  return { loaded: true, filePath, keys };
}

function loadPreferredEnvFiles(cwd = DEFAULT_PROJECT_ROOT, target = process.env) {
  return [
    loadEnvFile(path.join(/* turbopackIgnore: true */ cwd, ".env.local"), target),
    loadEnvFile(path.join(/* turbopackIgnore: true */ cwd, ".env"), target),
    loadEnvFile(path.join(/* turbopackIgnore: true */ cwd, ".dev.vars"), target),
  ];
}

function firstEnv(names, env = process.env) {
  for (const name of names) {
    const value = cleanValue(env[name]);
    if (value) return value;
  }
  return null;
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

function parseJsonEnv(value, fallback) {
  const text = cleanValue(value);
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function formatEnvFile(definitions, env = process.env) {
  const lines = [];
  let currentGroup = null;

  for (const definition of definitions) {
    if (definition.group !== currentGroup) {
      currentGroup = definition.group;
      if (lines.length) lines.push("");
      lines.push(`# ${currentGroup}`);
    }

    if (definition.description) {
      lines.push(`# ${definition.description}`);
    }

    const currentValue = cleanValue(env[definition.key]);
    const value = definition.secret
      ? ""
      : currentValue || definition.placeholder || definition.defaultValue || "";

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
  loadEnvFile,
  loadPreferredEnvFiles,
  parseJsonEnv,
  toEnvKey,
};
