import { getCleanEnvValue } from "./env.js";

function parseJsonEnv(value, fallback = {}) {
  const raw = getCleanEnvValue(value);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function getFreshsalesBillingConfig(env) {
  return {
    defaultDealStageId: getCleanEnvValue(env.FRESHSALES_DEFAULT_DEAL_STAGE_ID) || null,
    ownerId: getCleanEnvValue(env.FRESHSALES_OWNER_ID) || null,
    dealFieldMap: parseJsonEnv(env.FRESHSALES_BILLING_DEAL_FIELD_MAP, {
      external_reference: "cf_hmadv_external_reference",
      invoice_number: "cf_hmadv_invoice_number",
      receivable_status: "cf_hmadv_receivable_status",
      billing_type: "cf_hmadv_billing_type",
      balance_due: "cf_hmadv_balance_due",
      amount_original: "cf_hmadv_amount_original",
      correction_amount: "cf_hmadv_correction_amount",
      late_fee_amount: "cf_hmadv_late_fee_amount",
      interest_mora_amount: "cf_hmadv_interest_mora_amount",
      interest_compensatory_amount: "cf_hmadv_interest_compensatory_amount",
      process_reference: "cf_hmadv_process_reference",
    }),
  };
}

export function buildFreshsalesBillingCustomFields(fieldMap, values) {
  const output = {};
  for (const [key, fieldName] of Object.entries(fieldMap || {})) {
    if (!fieldName) continue;
    const value = values[key];
    if (value == null || value === "") continue;
    output[fieldName] = value;
  }
  return output;
}
