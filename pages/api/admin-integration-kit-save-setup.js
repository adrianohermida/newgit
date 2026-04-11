const fs = require("fs");
const path = require("path");

const { requireAdminNode } = require("../../lib/admin/node-auth.js");
const {
  buildSetupPreview,
  ensureSetupStructure,
  getSetupSecretsPath,
  materializeSetupTemplates,
} = require("../../lib/integration-kit/bootstrap");
const { getIntegrationKitCapabilities } = require("../../lib/integration-kit/runtime");

module.exports = async function handler(req, res) {
  const auth = await requireAdminNode(req);
  if (!auth.ok) {
    return res.status(auth.status).json({
      ok: false,
      error: auth.error,
      errorType: auth.errorType || "authentication",
      details: auth.details || null,
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  try {
    const capabilities = getIntegrationKitCapabilities(process.env, process.cwd());
    if (!capabilities.canServerSaveSetup) {
      return res.status(403).json({
        ok: false,
        mode: capabilities.mode,
        capabilities,
        error: "Persistencia server-side de setup.secrets.json esta bloqueada. Use apenas em runtime local explicito com INTEGRATION_KIT_ALLOW_SERVER_FILE_WRITE=true.",
      });
    }

    const setup = req.body && typeof req.body === "object" ? req.body : {};
    materializeSetupTemplates(process.cwd());
    ensureSetupStructure(process.cwd());

    const preview = buildSetupPreview(setup, process.env);
    const setupPath = getSetupSecretsPath(process.cwd());
    fs.writeFileSync(setupPath, `${JSON.stringify(preview.setupFile, null, 2)}\n`, "utf8");

    return res.status(200).json({
      ok: true,
      mode: capabilities.mode,
      capabilities,
      setupPath,
      rootDir: path.dirname(setupPath),
      message: "setup.secrets.json salvo localmente com sucesso.",
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "Falha ao salvar setup.secrets.json.",
    });
  }
};
