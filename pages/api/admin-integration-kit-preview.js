const { requireAdminNode } = require("../../lib/admin/node-auth.js");
const { buildRequiredChecks } = require(/*turbopackIgnore: true*/ "../../lib/integration-kit/config");
const { buildSetupPreview } = require(/*turbopackIgnore: true*/ "../../lib/integration-kit/bootstrap");
const { getIntegrationKitCapabilities } = require(/*turbopackIgnore: true*/ "../../lib/integration-kit/runtime");

const path = require("path");
const PROJECT_ROOT = path.join(/*turbopackIgnore: true*/ __dirname, "..", "..");

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
    const setup = req.body && typeof req.body === "object" ? req.body : {};
    const preview = buildSetupPreview(setup, process.env);
    return res.status(200).json({
      ok: true,
      preview: {
        bundle: preview.bundle,
        authorize: preview.authorize,
        credentialChecklist: preview.credentialChecklist,
        envBootstrap: preview.envBootstrap,
        setupFile: preview.setupFile,
        requiredChecks: buildRequiredChecks(preview.env),
      },
      capabilities: getIntegrationKitCapabilities(process.env, PROJECT_ROOT),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "Falha ao montar a pre-visualizacao do setup.",
    });
  }
};
