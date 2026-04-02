function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase() || null;
}

export function normalizePhone(value) {
  const digits = String(value || "").replace(/\D+/g, "");
  return digits || null;
}

export function parseMoneyBRL(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  if (!text || /^#(REF|VALUE)!$/i.test(text)) return null;
  const normalized = text
    .replace(/[R$\s]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseBrazilDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const text = String(value).trim();
  const match = text.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (!match) return null;
  const [, day, month, year] = match;
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const parsed = new Date(`${iso}T00:00:00-03:00`);
  return Number.isNaN(parsed.getTime()) ? null : iso;
}

export function canonicalFinanceStatus(status) {
  const normalized = normalizeText(status);
  if (!normalized) return "em_aberto";
  if (normalized.includes("pago") || normalized.includes("quitado")) return "pago";
  if (normalized.includes("parcial")) return "parcial";
  if (normalized.includes("aberto")) return "em_aberto";
  if (normalized.includes("venc")) return "vencido";
  return "em_aberto";
}

export function inferBillingType(row) {
  const joined = [
    row?.Categoria,
    row?.Tipo,
    row?.Comentário,
    row?.["Pago para / Recebido de"],
    row?.Negócio,
  ]
    .filter(Boolean)
    .join(" | ");
  const normalized = normalizeText(joined);

  if (normalized.includes("assinatura") || normalized.includes("recorrent") || normalized.includes("mensal")) {
    return "recorrente";
  }
  if (normalized.includes("parcela") || normalized.includes("parcelad")) {
    return "parcelado";
  }
  if (normalized.includes("despesa")) {
    return "reembolso";
  }
  return "unitario";
}

export function inferProductFamily(row) {
  const category = normalizeText(row?.Categoria);
  const comment = normalizeText(row?.Comentário);
  const type = inferBillingType(row);

  if (category.includes("honorario")) {
    return type === "recorrente" ? "Honorarios Recorrentes" : "Honorarios Unitarios";
  }
  if (category.includes("despesa")) return "Despesa do Cliente";
  if (type === "parcelado") return "Parcela Contratual";
  if (type === "recorrente") return "Honorarios Recorrentes";
  if (comment.includes("encargo") || comment.includes("multa") || comment.includes("juros")) return "Encargos de Atraso";
  return "Fatura Avulsa";
}

export function buildDedupeKey(row) {
  const parts = [
    normalizeText(row?.["Pago para / Recebido de"]),
    normalizeEmail(row?.["E-mail"]),
    String(row?.Fatura || "").trim(),
    parseBrazilDate(row?.["Data de vencimento"]) || "",
    parseMoneyBRL(row?.["Valor Original"]) ?? "",
    normalizeText(row?.Tipo),
  ];
  return parts.join("|");
}

export function computeFinancialSnapshot(receivable, options = {}) {
  const asOfDate = options.asOfDate ? new Date(`${options.asOfDate}T00:00:00-03:00`) : new Date();
  const dueDateIso = parseBrazilDate(receivable?.due_date || receivable?.["Data de vencimento"]);
  const dueDate = dueDateIso ? new Date(`${dueDateIso}T00:00:00-03:00`) : null;
  const amountOriginal = parseMoneyBRL(receivable?.amount_original ?? receivable?.["Valor Original"]) ?? 0;
  const paymentAmount = parseMoneyBRL(receivable?.payment_amount ?? receivable?.["Pagamento (-)"] ?? receivable?.Pagamento) ?? 0;
  const lateFeePercent = Number(receivable?.late_fee_percent ?? 10);
  const interestMoraPercentMonth = Number(receivable?.interest_mora_percent_month ?? 1);
  const interestCompensatoryPercentMonth = Number(receivable?.interest_compensatory_percent_month ?? 1);
  const dueIndex = Number(receivable?.correction_index_due);
  const currentIndex = Number(receivable?.correction_index_current);

  const amountPrincipal = Number((amountOriginal - paymentAmount).toFixed(2));
  const daysOverdue = dueDate && asOfDate > dueDate
    ? Math.floor((asOfDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  const monthsOverdue = daysOverdue / 30;

  const correctionFactor = dueIndex > 0 && currentIndex > 0
    ? Number((currentIndex / dueIndex).toFixed(8))
    : null;
  const amountCorrected = correctionFactor != null
    ? Number((amountPrincipal * correctionFactor).toFixed(2))
    : amountPrincipal;
  const correctionPercent = correctionFactor != null
    ? Number(((correctionFactor - 1) * 100).toFixed(8))
    : null;
  const correctionAmount = Number((amountCorrected - amountPrincipal).toFixed(2));
  const lateFeeAmount = Number((amountOriginal * (lateFeePercent / 100)).toFixed(2));
  const interestMoraAmount = Number((amountOriginal * (interestMoraPercentMonth / 100) * monthsOverdue).toFixed(2));
  const interestCompensatoryAmount = Number((amountOriginal * (interestCompensatoryPercentMonth / 100) * monthsOverdue).toFixed(2));
  const balanceDue = Number((amountOriginal + lateFeeAmount + interestMoraAmount + interestCompensatoryAmount).toFixed(2));
  const balanceDueCorrected = Number((amountCorrected + lateFeeAmount + interestMoraAmount + interestCompensatoryAmount).toFixed(2));

  return {
    amount_original: amountOriginal,
    payment_amount: paymentAmount,
    amount_principal: amountPrincipal,
    correction_factor: correctionFactor,
    correction_percent: correctionPercent,
    correction_amount: correctionAmount,
    amount_corrected: amountCorrected,
    late_fee_amount: lateFeeAmount,
    interest_mora_amount: interestMoraAmount,
    interest_compensatory_amount: interestCompensatoryAmount,
    interest_start_date: dueDateIso ? new Date(new Date(`${dueDateIso}T00:00:00-03:00`).getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10) : null,
    days_overdue: daysOverdue,
    balance_due: balanceDue,
    balance_due_corrected: balanceDueCorrected,
  };
}
