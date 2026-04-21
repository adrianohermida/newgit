const fs = require("fs");
const path = require("path");

function getExtensionSourceDir() {
  const configured = String(process.env.UNIVERSAL_LLM_EXTENSION_SOURCE_DIR || "").trim();
  // extension-app e a fonte primaria da extensao. O staging legado so entra se for apontado explicitamente por env.
  const candidates = [
    configured,
    path.resolve(__dirname, "extension-app"),
  ].filter(Boolean);

  const found = candidates.find((candidate) => fs.existsSync(path.join(candidate, "manifest.json")));
  if (!found) {
    throw new Error(`Nao foi possivel localizar a fonte da extensao. Candidatos: ${candidates.join(", ")}`);
  }
  return found;
}

module.exports = {
  getExtensionSourceDir,
};
