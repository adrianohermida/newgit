#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { loadRuntimeEnv, resolveWorkspaceId } = require('../lib/integration-kit/runtime');

const runtime = loadRuntimeEnv(process.cwd(), process.env);

async function main() {
  const args = process.argv.slice(2);
  const applyStatus = args.includes('--apply-status');
  const filteredArgs = args.filter((item) => item !== '--apply-status');

  const importLimit = sanitizePositiveInt(filteredArgs[0], 200);
  const publishLimit = sanitizePositiveInt(filteredArgs[1], 200);
  const crmLimit = sanitizePositiveInt(filteredArgs[2], 200);
  const workspaceId = cleanValue(filteredArgs[3]) || cleanValue(resolveWorkspaceId(runtime));

  const steps = [
    {
      label: 'Sincronizar contatos do Freshsales',
      command: ['node', 'scripts/sync-freshsales-contacts.js'],
    },
    {
      label: 'Importar deals legados para staging',
      command: ['node', 'scripts/import-hmadv-freshsales-deals.js', String(importLimit), ...(workspaceId ? [workspaceId] : [])],
      materializeImportedRun: true,
    },
    {
      label: 'Importar deals existentes do Freshsales',
      command: ['node', 'scripts/sync-freshsales-deals.js', String(importLimit), ...(applyStatus ? ['--apply-status'] : [])],
    },
    {
      label: 'Publicar deals locais pendentes',
      command: ['node', 'scripts/publish-hmadv-deals.js', String(publishLimit)],
    },
    {
      label: 'Processar fila CRM',
      command: ['node', 'scripts/process-hmadv-crm-events.js', String(crmLimit)],
    },
  ];

  const summary = {
    ok: true,
    apply_status: applyStatus,
    steps: [],
  };

  for (const step of steps) {
    const result = runStep(step.command);
    summary.steps.push({
      label: step.label,
      command: step.command.join(' '),
      exit_code: result.status,
      stdout: cleanOutput(result.stdout),
      stderr: cleanOutput(result.stderr),
    });

    const currentStep = summary.steps[summary.steps.length - 1];
    if (result.status !== 0 && !isSkippableContactsAuthFailure(currentStep)) {
      summary.ok = false;
      break;
    }
    if (result.status !== 0 && isSkippableContactsAuthFailure(currentStep)) {
      currentStep.warning = 'sync_contacts_skipped_auth';
    }

    if (step.materializeImportedRun) {
      const payload = parseJsonOutput(result.stdout);
      const importRunId = cleanValue(payload?.import_run_id);
      if (importRunId) {
        const materializeCommand = ['node', 'scripts/materialize-hmadv-billing.js', importRunId, ...(workspaceId ? [workspaceId] : [])];
        const materializeResult = runStep(materializeCommand);
        summary.steps.push({
          label: 'Materializar deals legados importados',
          command: materializeCommand.join(' '),
          exit_code: materializeResult.status,
          stdout: cleanOutput(materializeResult.stdout),
          stderr: cleanOutput(materializeResult.stderr),
        });
        if (materializeResult.status !== 0) {
          summary.ok = false;
          break;
        }
      }
    }
  }

  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) process.exit(1);
}

function sanitizePositiveInt(value, fallback) {
  const text = String(value || '').trim();
  if (!/^\d+$/.test(text)) return fallback;
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function cleanValue(value) {
  const text = String(value || '').trim();
  return text || null;
}

function cleanOutput(value) {
  const text = String(value || '').trim();
  return text || null;
}

function parseJsonOutput(value) {
  const text = cleanOutput(value);
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}$/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function runStep(command) {
  const [bin, ...stepArgs] = command;
  return spawnSync(bin, stepArgs, {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    shell: false,
  });
}

function isSkippableContactsAuthFailure(step) {
  const combined = `${step?.stdout || ''}\n${step?.stderr || ''}`;
  return step?.label === 'Sincronizar contatos do Freshsales' && /contacts request failed: 401|contacts request returned 403|Seguindo sem sync direto de contacts/i.test(combined);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
