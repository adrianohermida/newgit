const { spawnSync } = require(/*turbopackIgnore: true*/ "child_process");

const { requireAdminNode } = require(/*turbopackIgnore: true*/ "../../lib/admin/node-auth.js");
const {
  getIntegrationKitCapabilities,
  parseBoolean,
} = require(/*turbopackIgnore: true*/ "../../lib/integration-kit/runtime");

const COMMANDS = {
  validate: ["npm", "run", "integration:validate"],
  bootstrap: ["npm", "run", "integration:bootstrap"],
  go: ["npm", "run", "integration:go"],
  sync: ["npm", "run", "integration:sync"],
  ops: ["npm", "run", "integration:ops"],
};

const DANGEROUS_MODES = new Set(["go", "ops"]);

function getConfirmationPhrase(mode) {
  return `EXECUTAR ${String(mode || "").toUpperCase()}`;
}

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
    const mode = String(req.body?.mode || "").trim();
    const command = COMMANDS[mode];
    if (!command) {
      return res.status(400).json({ ok: false, error: "Modo de execucao invalido." });
    }

    const capabilities = getIntegrationKitCapabilities(process.env);
    const allowProduction = parseBoolean(process.env.INTEGRATION_KIT_COMMAND_RUNNER_ALLOW_PRODUCTION, false);
    const isProduction = String(process.env.NODE_ENV || "").trim() === "production";

    if (!capabilities.canRunCommands) {
      return res.status(403).json({
        ok: false,
        mode: capabilities.mode,
        capabilities,
        error: "Runner do integration kit bloqueado. Ele so pode rodar em runtime local explicito com INTEGRATION_KIT_COMMAND_RUNNER_ENABLED=true.",
      });
    }

    if (isProduction && !allowProduction) {
      return res.status(403).json({
        ok: false,
        mode: capabilities.mode,
        capabilities,
        error: "Runner bloqueado em producao. Defina INTEGRATION_KIT_COMMAND_RUNNER_ALLOW_PRODUCTION=true se quiser liberar.",
      });
    }

    if (DANGEROUS_MODES.has(mode)) {
      const confirmation = String(req.body?.confirmation || "").trim();
      const expected = getConfirmationPhrase(mode);
      if (confirmation !== expected) {
        return res.status(400).json({
          ok: false,
          mode: capabilities.mode,
          capabilities,
          error: `Confirmacao obrigatoria ausente. Digite exatamente: ${expected}`,
          expectedConfirmation: expected,
        });
      }
    }

    const [bin, ...args] = command;
    const result = spawnSync(bin, args, {
      env: process.env,
      encoding: "utf8",
      shell: process.platform === "win32",
      timeout: 240_000,
    });

    return res.status(200).json({
      ok: result.status === 0,
      mode: capabilities.mode,
      capabilities,
      runMode: mode,
      command: command.join(" "),
      exitCode: result.status,
      signal: result.signal || null,
      stdout: String(result.stdout || "").trim() || null,
      stderr: String(result.stderr || "").trim() || null,
      timedOut: Boolean(result.error && /timed out/i.test(String(result.error.message || ""))),
      error: result.error ? String(result.error.message || result.error) : null,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "Falha ao executar comando do integration kit.",
    });
  }
};
