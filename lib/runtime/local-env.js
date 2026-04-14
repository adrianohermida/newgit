import fs from "fs";
import path from "path";

function stripQuotes(value) {
  const text = String(value || "").trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1).trim();
  }
  return text;
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const values = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = String(line || "").trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1);
    if (!key) continue;
    values[key] = stripQuotes(value);
  }
  return values;
}

export function getRuntimeEnv(overrides = {}) {
  const rootDir = process.cwd();
  const localEnv = {
    ...readEnvFile(path.join(rootDir, ".dev.vars")),
    ...readEnvFile(path.join(rootDir, ".env.local")),
  };

  return {
    ...localEnv,
    ...process.env,
    ...overrides,
  };
}
