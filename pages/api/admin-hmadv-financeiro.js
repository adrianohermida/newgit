import { requireAdminNode } from "../../lib/admin/node-auth.js";
import { spawn } from "node:child_process";
import path from "node:path";
import {
  backfillHmadvFinanceAccounts,
  getHmadvFinanceAdminConfig,
  getHmadvFinanceAdminOverview,
  getHmadvFinanceOperationGuidance,
  updateHmadvFinanceAdminConfig,
  resolveHmadvFinancePendingAccounts,
  resolveHmadvFinancePendingContacts,
  searchHmadvFinanceProcessCandidates,
} from "../../functions/lib/hmadv-finance-admin.js";

const SCRIPT_ACTIONS = {
  refresh_freshsales_token: { script: "refresh-freshsales-token.js", args: [] },
  diagnose_freshsales_auth: { script: "diagnose-freshsales-auth.js", args: [] },
  materialize_latest_run: { script: "materialize-hmadv-billing.js", args: [] },
  reprocess_billing: { script: "reprocess-hmadv-billing.js", args: ["--limit", "3000"] },
  publish_deals: { script: "publish-hmadv-deals.js", args: ["50"] },
  sync_existing_deals: { script: "sync-freshsales-deals.js", args: ["50"] },
  sync_bidirectional_deals: { script: "sync-hmadv-deals-bidirectional.js", args: ["50", "50", "50"] },
  process_crm_events: { script: "process-hmadv-crm-events.js", args: ["50"] },
  export_accounts_import: { script: "export-freshsales-sales-accounts-import.js", args: [] },
  export_deals_import: { script: "export-freshsales-deals-import.js", args: [] },
  report_ops: { script: "report-hmadv-ops.js", args: [] },
};

function parseJsonOutput(stdoutText) {
  const text = String(stdoutText || "").trim();
  if (!text) return null;

  const directJson = text.match(/\{[\s\S]*\}$/);
  if (!directJson) return null;

  try {
    return JSON.parse(directJson[0]);
  } catch {
    return null;
  }
}

function pushIfPresent(target, ...values) {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) target.push(text);
  }
}

function buildScriptArgs(operation, settings = {}, body = {}) {
  if (operation === "refresh_freshsales_token") return [];
  if (operation === "diagnose_freshsales_auth") return [];
  if (operation === "report_ops") return [];
  if (operation === "export_accounts_import") return [];
  if (operation === "export_deals_import") return [];

  if (operation === "backfill_textual_accounts") {
    return [String(body.limit || settings.backfill_limit || 50)];
  }

  if (operation === "materialize_latest_run") {
    const args = [];
    pushIfPresent(args, body.import_run_id);
    pushIfPresent(args, body.workspace_id || settings.materialize_workspace_id);
    return args;
  }

  if (operation === "reprocess_billing") {
    const args = [];
    if (body.workspace_id || settings.materialize_workspace_id) {
      args.push("--workspace-id", String(body.workspace_id || settings.materialize_workspace_id));
    }
    args.push("--limit", String(body.limit || settings.reprocess_limit || 3000));
    return args;
  }

  if (operation === "publish_deals") {
    const args = [String(body.limit || settings.publish_limit || 50)];
    pushIfPresent(args, body.receivable_id);
    return args;
  }

  if (operation === "sync_existing_deals") {
    const args = [String(body.limit || settings.publish_limit || 50)];
    pushIfPresent(args, body.deal_id);
    if (body.apply_status === true) args.push("--apply-status");
    return args;
  }

  if (operation === "sync_bidirectional_deals") {
    const args = [
      String(body.import_limit || body.limit || settings.publish_limit || 50),
      String(body.publish_limit || body.limit || settings.publish_limit || 50),
      String(body.crm_limit || body.limit || settings.crm_events_limit || 50),
    ];
    if (body.apply_status === true) args.push("--apply-status");
    return args;
  }

  if (operation === "process_crm_events") {
    return [String(body.limit || settings.crm_events_limit || 50)];
  }

  return [];
}

async function runNodeScript(scriptName, args = []) {
  const cwd = process.cwd();
  const scriptPath = path.join(cwd, "scripts", scriptName);

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd,
      env: process.env,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const output = {
        code,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        json: parseJsonOutput(stdout),
      };

      if (code !== 0) {
        const message = output.stderr || output.stdout || `Falha ao executar ${scriptName}.`;
        const error = new Error(message);
        error.output = output;
        reject(error);
        return;
      }

      resolve(output);
    });
  });
}

export default async function handler(req, res) {
  const auth = await requireAdminNode(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  try {
    if (req.method === "GET") {
      const action = String(req.query.action || "overview");
      if (action === "overview") {
        const data = await getHmadvFinanceAdminOverview(process.env);
        return res.status(200).json({ ok: true, data });
      }
      if (action === "config") {
        const data = await getHmadvFinanceAdminConfig(process.env);
        return res.status(200).json({ ok: true, data });
      }
      if (action === "search_processes") {
        const data = await searchHmadvFinanceProcessCandidates(
          process.env,
          req.query.query,
          Number(req.query.limit || 20)
        );
        return res.status(200).json({ ok: true, data });
      }
      return res.status(400).json({ ok: false, error: "Acao GET invalida." });
    }

    if (req.method === "POST") {
      const action = String(req.body?.action || "");
      if (action === "backfill_textual_accounts") {
        const config = await getHmadvFinanceAdminConfig(process.env);
        const data = await backfillHmadvFinanceAccounts(process.env, {
          limit: Number(req.body?.limit || config.settings?.value?.backfill_limit || 50),
          ownerId: req.body?.ownerId || config.settings?.value?.freshsales_owner_id || null,
        });
        return res.status(200).json({ ok: true, data });
      }
      if (action === "resolve_account_rows") {
        const data = await resolveHmadvFinancePendingAccounts(process.env, req.body || {});
        return res.status(200).json({ ok: true, data });
      }
      if (action === "resolve_contact_rows") {
        const data = await resolveHmadvFinancePendingContacts(process.env, req.body || {});
        return res.status(200).json({ ok: true, data });
      }
      if (action === "run_operation") {
        const operation = String(req.body?.operation || "").trim();
        const config = await getHmadvFinanceAdminConfig(process.env);
        const allowedKeys = new Set((config.operations || []).map((item) => item.key));
        const selected = allowedKeys.has(operation) ? SCRIPT_ACTIONS[operation] : null;
        if (!selected) {
          return res.status(400).json({ ok: false, error: "Operacao administrativa invalida." });
        }
        const settings = config.settings?.value || {};
        const dynamicArgs = buildScriptArgs(operation, settings, req.body || {});
        const data = await runNodeScript(selected.script, dynamicArgs);
        const guidance = await getHmadvFinanceOperationGuidance(process.env, operation);
        return res.status(200).json({
          ok: true,
          data: {
            operation,
            script: selected.script,
            guidance,
            ...data,
          },
        });
      }
      if (action === "update_config") {
        const data = await updateHmadvFinanceAdminConfig(process.env, req.body || {});
        return res.status(200).json({ ok: true, data });
      }
      return res.status(400).json({ ok: false, error: "Acao POST invalida." });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Falha ao carregar a visao administrativa do financeiro." });
  }
}
