import { fetchSupabaseAdmin } from "./supabase-rest.js";
import { freshsalesRequest, listFreshsalesSalesAccountsFromViews } from "./freshsales-crm.js";
import { getCleanEnvValue } from "./env.js";

function safeJsonParse(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toNumber(value) {
  if (value == null || value === "") return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function uniqueBy(items, getKey) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = String(getKey(item) || "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function basename(value) {
  return String(value || "").split(/[\\/]/).filter(Boolean).pop() || String(value || "");
}

async function fetchSupabaseAdminAll(env, path, { schema = "public", pageSize = 1000 } = {}) {
  const rows = [];
  let from = 0;

  while (true) {
    const page = await fetchSupabaseAdmin(env, path, {
      headers: {
        Range: `${from}-${from + pageSize - 1}`,
        Prefer: "count=exact",
        "Accept-Profile": schema,
        "Content-Profile": schema,
      },
    });

    if (!Array.isArray(page) || !page.length) break;
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function fetchSupabaseSchema(env, path, { schema = "public", init = {} } = {}) {
  return fetchSupabaseAdmin(env, path, {
    ...init,
    headers: {
      "Accept-Profile": schema,
      "Content-Profile": schema,
      ...(init.headers || {}),
    },
  });
}

function buildStatusCounts(items, field = "status") {
  return items.reduce((acc, item) => {
    const key = String(item?.[field] || "sem_status").trim() || "sem_status";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function buildImportSourceCounts(rows, runsById) {
  return rows.reduce((acc, row) => {
    const run = runsById.get(String(row.import_run_id || "").trim()) || null;
    const key = basename(run?.source_file || run?.source_name || "desconhecido");
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function formatRecentReceivable(row, contractsById, contactsById) {
  const contract = contractsById.get(String(row.contract_id || "").trim()) || null;
  const contact = contactsById.get(String(row.contact_id || "").trim()) || null;
  return {
    id: row.id,
    title: contract?.title || row.description || row.invoice_number || "Recebivel",
    invoice_number: row.invoice_number || null,
    receivable_type: row.receivable_type || null,
    status: row.status || null,
    due_date: row.due_date || null,
    amount_original: toNumber(row.amount_original),
    balance_due: toNumber(row.balance_due_corrected ?? row.balance_due ?? row.amount_original),
    process_reference: contract?.process_reference || null,
    freshsales_account_id: row.freshsales_account_id || contract?.freshsales_account_id || null,
    freshsales_deal_id: row.freshsales_deal_id || null,
    contact_name: contact?.name || null,
    contact_email: contact?.email || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

function formatPendingRow(row, contactsById, runsById) {
  const contact = contactsById.get(String(row.resolved_contact_id || "").trim()) || null;
  const run = runsById.get(String(row.import_run_id || "").trim()) || null;
  const validationErrors = Array.isArray(row.validation_errors)
    ? row.validation_errors
    : Object.values(safeJsonParse(row.validation_errors, {})).filter(Boolean);

  return {
    id: row.id,
    source_file: basename(run?.source_file || run?.source_name || ""),
    person_name: row.person_name || null,
    email: row.email || null,
    invoice_number: row.invoice_number || null,
    due_date: row.due_date || null,
    matching_status: row.matching_status || null,
    resolved_contact_name: contact?.name || null,
    resolved_contact_email: contact?.email || null,
    resolved_account_id_freshsales: row.resolved_account_id_freshsales || null,
    resolved_process_reference: row.resolved_process_reference || null,
    deal_reference_raw: row.deal_reference_raw || null,
    product_family_inferred: row.product_family_inferred || null,
    billing_type_inferred: row.billing_type_inferred || null,
    validation_errors: validationErrors,
    updated_at: row.created_at || null,
  };
}

function deriveResolutionStats(importRows, receivables, contracts) {
  const textualContracts = contracts.filter((item) => safeJsonParse(item.metadata, {}).account_resolution_status === "textual_only").length;
  const resolvedContracts = contracts.filter((item) => item.freshsales_account_id).length;
  const receivablesWithAccount = receivables.filter((item) => item.freshsales_account_id).length;
  const receivablesWithoutAccount = receivables.length - receivablesWithAccount;

  return {
    pending_contact: importRows.filter((item) => item.matching_status === "pendente_contato").length,
    pending_account: importRows.filter((item) => item.matching_status === "pendente_account").length,
    pending_review: importRows.filter((item) => item.matching_status === "pendente_revisao").length,
    matched: importRows.filter((item) => item.matching_status === "pareado").length,
    contracts_resolved: resolvedContracts,
    contracts_textual_only: textualContracts,
    receivables_with_account: receivablesWithAccount,
    receivables_without_account: receivablesWithoutAccount,
  };
}

export async function getHmadvFinanceAdminOverview(env) {
  const [
    importRuns,
    importRows,
    contracts,
    receivables,
    contacts,
    dealsRegistry,
    crmQueue,
  ] = await Promise.all([
    fetchSupabaseAdminAll(
      env,
      "billing_import_runs?select=id,source_name,source_file,status,total_rows,valid_rows,error_rows,started_at,completed_at,summary&order=started_at.desc"
    ),
    fetchSupabaseAdminAll(
      env,
      "billing_import_rows?select=id,import_run_id,person_name,email,invoice_number,due_date,matching_status,resolved_contact_id,resolved_account_id_freshsales,resolved_process_reference,deal_reference_raw,product_family_inferred,billing_type_inferred,validation_errors,created_at&order=created_at.desc"
    ),
    fetchSupabaseAdminAll(
      env,
      "billing_contracts?select=id,title,status,process_reference,freshsales_contact_id,freshsales_account_id,metadata,created_at,updated_at&order=created_at.desc"
    ),
    fetchSupabaseAdminAll(
      env,
      "billing_receivables?select=id,contract_id,contact_id,freshsales_deal_id,freshsales_account_id,receivable_type,invoice_number,description,due_date,status,amount_original,balance_due,balance_due_corrected,created_at,updated_at&order=created_at.desc"
    ),
    fetchSupabaseAdminAll(
      env,
      "freshsales_contacts?select=id,name,email,freshsales_contact_id,created_at,updated_at&order=updated_at.desc"
    ),
    fetchSupabaseAdminAll(
      env,
      "freshsales_deals_registry?select=id,billing_receivable_id,freshsales_deal_id,freshsales_account_id,last_sync_status,last_sync_error,last_synced_at,created_at&order=created_at.desc"
    ),
    fetchSupabaseAdminAll(
      env,
      "crm_event_queue?select=id,event_type,status,error,attempts,scheduled_at,processed_at,created_at&order=created_at.desc"
    ),
  ]);

  const contractsById = new Map(contracts.map((item) => [String(item.id), item]));
  const contactsById = new Map(contacts.map((item) => [String(item.id), item]));
  const runsById = new Map(importRuns.map((item) => [String(item.id), item]));
  const importStatusCounts = buildStatusCounts(importRows, "matching_status");
  const receivableStatusCounts = buildStatusCounts(receivables, "status");
  const dealSyncCounts = buildStatusCounts(dealsRegistry, "last_sync_status");
  const crmQueueCounts = buildStatusCounts(crmQueue, "status");
  const sourceCounts = buildImportSourceCounts(importRows, runsById);
  const resolution = deriveResolutionStats(importRows, receivables, contracts);

  const publishReady = receivables.filter((item) => item.contact_id && item.freshsales_account_id && !item.freshsales_deal_id).length;
  const portalReady = receivables.filter((item) => item.contact_id).length;
  const canonicalAmount = receivables.reduce((sum, item) => sum + toNumber(item.balance_due_corrected ?? item.balance_due ?? item.amount_original), 0);
  const openAmount = receivables
    .filter((item) => !["pago", "encerrado"].includes(normalizeText(item.status)))
    .reduce((sum, item) => sum + toNumber(item.balance_due_corrected ?? item.balance_due ?? item.amount_original), 0);

  return {
    generated_at: new Date().toISOString(),
    overview: {
      import_runs: importRuns.length,
      import_rows: importRows.length,
      contacts: contacts.length,
      contracts: contracts.length,
      receivables: receivables.length,
      deals_registry: dealsRegistry.length,
      crm_queue: crmQueue.length,
      publish_ready: publishReady,
      portal_ready: portalReady,
      canonical_amount: canonicalAmount,
      open_amount: openAmount,
    },
    resolution,
    counts: {
      import_status: importStatusCounts,
      receivable_status: receivableStatusCounts,
      deal_sync_status: dealSyncCounts,
      crm_queue_status: crmQueueCounts,
      import_sources: sourceCounts,
    },
    recent_import_runs: importRuns.slice(0, 8).map((row) => ({
      id: row.id,
      source_name: row.source_name || null,
      source_file: basename(row.source_file || ""),
      status: row.status || null,
      total_rows: row.total_rows || 0,
      valid_rows: row.valid_rows || 0,
      error_rows: row.error_rows || 0,
      started_at: row.started_at || null,
      completed_at: row.completed_at || null,
    })),
    recent_receivables: receivables.slice(0, 20).map((row) => formatRecentReceivable(row, contractsById, contactsById)),
    pending_account_rows: importRows
      .filter((item) => item.matching_status === "pendente_account")
      .slice(0, 30)
      .map((row) => formatPendingRow(row, contactsById, runsById)),
    pending_contact_rows: importRows
      .filter((item) => item.matching_status === "pendente_contato")
      .slice(0, 20)
      .map((row) => formatPendingRow(row, contactsById, runsById)),
    deal_failures: dealsRegistry
      .filter((item) => normalizeText(item.last_sync_status) === "error")
      .slice(0, 15)
      .map((item) => ({
        id: item.id,
        billing_receivable_id: item.billing_receivable_id || null,
        freshsales_deal_id: item.freshsales_deal_id || null,
        freshsales_account_id: item.freshsales_account_id || null,
        last_sync_error: item.last_sync_error || null,
        last_synced_at: item.last_synced_at || null,
      })),
    crm_queue_backlog: crmQueue
      .filter((item) => normalizeText(item.status) !== "processed")
      .slice(0, 20)
      .map((item) => ({
        id: item.id,
        event_type: item.event_type || null,
        status: item.status || null,
        attempts: item.attempts || 0,
        error: item.error || null,
        created_at: item.created_at || null,
      })),
    diagnostics: {
      contracts_textual_only_share: contracts.length
        ? Number(((resolution.contracts_textual_only / contracts.length) * 100).toFixed(2))
        : 0,
      receivables_without_account_share: receivables.length
        ? Number(((resolution.receivables_without_account / receivables.length) * 100).toFixed(2))
        : 0,
      import_sources_detected: Object.keys(sourceCounts).length,
      ready_for_freshsales_publish: publishReady > 0,
    },
  };
}

function formatProcessCandidate(item, source = "processos", matchedBy = "query") {
  return {
    id: item.id,
    numero_cnj: item.numero_cnj || null,
    numero_processo: item.numero_processo || null,
    titulo: item.titulo || null,
    account_id_freshsales: item.account_id_freshsales || null,
    status: item.status_atual_processo || item.status || null,
    source,
    matched_by: matchedBy,
    label: item.numero_cnj || item.numero_processo || item.titulo || item.id,
  };
}

export async function searchHmadvFinanceProcessCandidates(env, rawQuery, limit = 20) {
  const query = String(rawQuery || "").trim();
  if (!query) {
    return { items: [], query };
  }

  const normalizedLimit = Math.max(1, Math.min(50, Number(limit) || 20));
  const encodedLike = `*${query.replace(/\*/g, "")}*`;
  const processPath = `processos?select=id,numero_cnj,numero_processo,titulo,account_id_freshsales,status_atual_processo,updated_at&or=(numero_cnj.ilike.${encodeURIComponent(encodedLike)},numero_processo.ilike.${encodeURIComponent(encodedLike)},titulo.ilike.${encodeURIComponent(encodedLike)},account_id_freshsales.ilike.${encodeURIComponent(encodedLike)})&order=updated_at.desc&limit=${normalizedLimit}`;

  const [directProcesses, relatedPartes] = await Promise.all([
    fetchSupabaseSchema(env, processPath, { schema: "judiciario" }).catch(() => []),
    fetchSupabaseSchema(
      env,
      `partes?select=processo_id,nome,polo,tipo_contato&nome=ilike.${encodeURIComponent(encodedLike)}&limit=${normalizedLimit * 3}`,
      { schema: "judiciario" }
    ).catch(() => []),
  ]);

  const processIdsFromPartes = uniqueBy(
    (Array.isArray(relatedPartes) ? relatedPartes : []).map((item) => item?.processo_id).filter(Boolean),
    (item) => item
  );

  let parteProcesses = [];
  if (processIdsFromPartes.length) {
    parteProcesses = await fetchSupabaseSchema(
      env,
      `processos?select=id,numero_cnj,numero_processo,titulo,account_id_freshsales,status_atual_processo,updated_at&id=in.(${processIdsFromPartes.map((item) => `"${item}"`).join(",")})&limit=${normalizedLimit * 2}`,
      { schema: "judiciario" }
    ).catch(() => []);
  }

  const merged = uniqueBy(
    [
      ...(Array.isArray(directProcesses) ? directProcesses.map((item) => formatProcessCandidate(item, "processos", "query")) : []),
      ...(Array.isArray(parteProcesses) ? parteProcesses.map((item) => formatProcessCandidate(item, "partes", "nome_da_parte")) : []),
    ],
    (item) => item.id
  ).slice(0, normalizedLimit);

  return {
    query,
    items: merged,
  };
}

export async function resolveHmadvFinancePendingAccounts(env, payload = {}) {
  const rowIds = uniqueBy(Array.isArray(payload.rowIds) ? payload.rowIds.filter(Boolean) : [], (item) => item);
  if (!rowIds.length) {
    throw new Error("Nenhuma linha pendente foi informada para reconciliacao.");
  }

  let processRow = null;
  if (payload.processId) {
    const rows = await fetchSupabaseSchema(
      env,
      `processos?select=id,numero_cnj,numero_processo,titulo,account_id_freshsales,status_atual_processo&id=eq.${encodeURIComponent(payload.processId)}&limit=1`,
      { schema: "judiciario" }
    );
    processRow = Array.isArray(rows) ? rows[0] || null : null;
  }

  const explicitAccountId = String(payload.freshsalesAccountId || processRow?.account_id_freshsales || "").trim() || null;
  const explicitProcessReference =
    String(payload.processReference || processRow?.numero_cnj || processRow?.numero_processo || processRow?.titulo || "").trim() || null;
  const explicitProcessId = processRow?.id || payload.processId || null;

  if (!explicitAccountId && !explicitProcessReference) {
    throw new Error("Informe um processo ou account do Freshsales para concluir a reconciliacao.");
  }

  const rows = await fetchSupabaseSchema(
    env,
    `billing_import_rows?select=id,resolved_contact_id,matching_status&id=in.(${rowIds.map((item) => `"${item}"`).join(",")})`,
    { schema: "public" }
  );

  const updates = await Promise.all(
    (Array.isArray(rows) ? rows : []).map(async (row) => {
      const nextStatus = row?.resolved_contact_id ? "pareado" : "pendente_contato";
      await fetchSupabaseSchema(
        env,
        `billing_import_rows?id=eq.${encodeURIComponent(row.id)}`,
        {
          schema: "public",
          init: {
            method: "PATCH",
            headers: {
              Prefer: "return=minimal",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              resolved_process_id: explicitProcessId,
              resolved_account_id_freshsales: explicitAccountId,
              resolved_process_reference: explicitProcessReference,
              matching_status: nextStatus,
            }),
          },
        }
      );
      return {
        id: row.id,
        matching_status: nextStatus,
      };
    })
  );

  return {
    updated: updates.length,
    process: processRow ? formatProcessCandidate(processRow, "processos", "manual") : null,
    freshsales_account_id: explicitAccountId,
    process_reference: explicitProcessReference,
    rows: updates,
  };
}

function extractSalesAccountProcessReference(account) {
  return firstNonEmpty(
    account?.custom_field?.cf_processo,
    account?.custom_fields?.cf_processo,
    account?.cf_processo,
    account?.name
  );
}

function mapSalesAccountByReference(accounts = []) {
  const byReference = new Map();
  for (const account of accounts) {
    const keys = [
      normalizeText(account?.name),
      normalizeText(extractSalesAccountProcessReference(account)),
    ].filter(Boolean);
    for (const key of keys) {
      if (!byReference.has(key)) byReference.set(key, account);
    }
  }
  return byReference;
}

async function createTextualFreshsalesAccount(env, processReference) {
  const title = String(processReference || "").trim();
  if (!title) {
    throw new Error("Referencia textual do processo ausente para criar Sales Account.");
  }

  const ownerId = Number(getCleanEnvValue(env.FRESHSALES_OWNER_ID) || getCleanEnvValue(env.FS_OWNER_ID) || "31000147944");
  const { payload } = await freshsalesRequest(env, "/sales_accounts", {
    method: "POST",
    body: JSON.stringify({
      sales_account: {
        name: title.slice(0, 255),
        owner_id: ownerId,
        custom_field: {
          cf_processo: title,
        },
        custom_fields: {
          cf_processo: title,
        },
      },
    }),
  });

  const account = payload?.sales_account || payload || null;
  const accountId = String(account?.id || "").trim();
  if (!accountId) {
    throw new Error("Freshsales nao retornou Sales Account para a referencia textual.");
  }

  return {
    id: accountId,
    name: account?.name || title,
    cf_processo: title,
    source: "created",
  };
}

export async function backfillHmadvFinanceAccounts(env, { limit = 50 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit || 50), 200));
  const contracts = await fetchSupabaseAdminAll(
    env,
    `billing_contracts?select=id,process_reference,freshsales_account_id,metadata&freshsales_account_id=is.null&process_reference=not.is.null&order=created_at.asc&limit=${safeLimit}`
  );

  if (!contracts.length) {
    return {
      scanned: 0,
      linked_existing: 0,
      created_accounts: 0,
      updated_contracts: 0,
      updated_receivables: 0,
      items: [],
    };
  }

  const accounts = await listFreshsalesSalesAccountsFromViews(env, { maxPages: 8, perPage: 100 });
  const byReference = mapSalesAccountByReference(accounts);

  const items = [];
  let linkedExisting = 0;
  let createdAccounts = 0;
  let updatedContracts = 0;
  let updatedReceivables = 0;

  for (const contract of contracts) {
    const processReference = String(contract.process_reference || "").trim();
    if (!processReference) continue;

    const key = normalizeText(processReference);
    let account = byReference.get(key) || null;
    let mode = "linked_existing";

    if (!account) {
      account = await createTextualFreshsalesAccount(env, processReference);
      byReference.set(key, account);
      mode = "created";
      createdAccounts += 1;
    } else {
      linkedExisting += 1;
    }

    await fetchSupabaseSchema(
      env,
      `billing_contracts?id=eq.${encodeURIComponent(contract.id)}`,
      {
        schema: "public",
        init: {
          method: "PATCH",
          headers: {
            Prefer: "return=minimal",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            freshsales_account_id: String(account.id),
            metadata: {
              ...safeJsonParse(contract.metadata, {}),
              account_resolution_status: mode === "created" ? "created_textual_account" : "linked_textual_account",
            },
          }),
        },
      }
    );
    updatedContracts += 1;

    await fetchSupabaseSchema(
      env,
      `billing_receivables?contract_id=eq.${encodeURIComponent(contract.id)}`,
      {
        schema: "public",
        init: {
          method: "PATCH",
          headers: {
            Prefer: "return=minimal",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            freshsales_account_id: String(account.id),
          }),
        },
      }
    );

    const receivableRows = await fetchSupabaseSchema(
      env,
      `billing_receivables?select=id&contract_id=eq.${encodeURIComponent(contract.id)}&limit=1000`,
      { schema: "public" }
    );
    updatedReceivables += Array.isArray(receivableRows) ? receivableRows.length : 0;

    items.push({
      contract_id: contract.id,
      process_reference: processReference,
      freshsales_account_id: String(account.id),
      mode,
      account_name: account.name || processReference,
    });
  }

  return {
    scanned: contracts.length,
    linked_existing: linkedExisting,
    created_accounts: createdAccounts,
    updated_contracts: updatedContracts,
    updated_receivables: updatedReceivables,
    items,
  };
}
