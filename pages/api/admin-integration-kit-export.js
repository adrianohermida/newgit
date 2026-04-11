const { requireAdminNode } = require("../../lib/admin/node-auth.js");
const { formatEnvFile } = require("../../lib/integration-kit/env");
const { ENV_DEFINITIONS, buildEnvStatus, buildPortableIntegrationBundle, buildRequiredChecks } = require("../../lib/integration-kit/config");

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

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  try {
    const bundle = buildPortableIntegrationBundle(process.env);
    return res.status(200).json({
      ok: true,
      bundle,
      envTemplate: formatEnvFile(ENV_DEFINITIONS, process.env),
      envStatus: buildEnvStatus(process.env),
      requiredChecks: buildRequiredChecks(process.env),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "Falha ao montar bundle do integration kit.",
    });
  }
};
