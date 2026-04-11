import { requireClientAccess } from "../lib/client-auth.js";
import { createPortalAdminJob, listAdminJobs } from "../lib/hmadv-ops.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

function getPortalVisibleJobs(items = [], clientId, clientEmail) {
  return (Array.isArray(items) ? items : []).filter((item) => {
    const payload = item?.payload && typeof item.payload === "object" ? item.payload : {};
    const control = payload?.jobControl && typeof payload.jobControl === "object" ? payload.jobControl : payload;
    if (!Boolean(control?.visibleToPortal || control?.visible_to_portal)) return false;
    const sameClientId = String(payload?.clientId || "") === String(clientId || "");
    const sameClientEmail = String(payload?.clientEmail || "").toLowerCase() === String(clientEmail || "").toLowerCase();
    return sameClientId || sameClientEmail;
  });
}

export async function onRequestGet(context) {
  const auth = await requireClientAccess(context.request, context.env, { allowMissingProfile: true });
  if (!auth.ok) return jsonResponse({ ok: false, error: auth.error }, auth.status);

  try {
    const jobs = await listAdminJobs(context.env, { modulo: "portal", limit: 30 });
    const items = getPortalVisibleJobs(jobs.items || [], auth.user.id, auth.user.email);
    return jsonResponse({ ok: true, items });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message || "Falha ao carregar jobs do portal." }, 500);
  }
}

export async function onRequestPost(context) {
  const auth = await requireClientAccess(context.request, context.env, { allowMissingProfile: true });
  if (!auth.ok) return jsonResponse({ ok: false, error: auth.error }, auth.status);

  try {
    const body = await context.request.json();
    const action = String(body.action || "").trim();
    if (!action) return jsonResponse({ ok: false, error: "action obrigatoria." }, 400);

    const data = await createPortalAdminJob(context.env, {
      action,
      payload: {
        ...body.payload,
        clientId: auth.user.id,
        clientEmail: auth.user.email,
        jobControl: {
          source: "portal",
          priority: Number(body?.jobControl?.priority || body?.payload?.jobControl?.priority || 3),
          rateLimitKey: String(body?.jobControl?.rateLimitKey || body?.payload?.jobControl?.rateLimitKey || "portal_requests"),
          visibleToPortal: body?.jobControl?.visibleToPortal !== undefined
            ? Boolean(body.jobControl.visibleToPortal)
            : body?.payload?.jobControl?.visibleToPortal !== undefined
              ? Boolean(body.payload.jobControl.visibleToPortal)
              : true,
        },
      },
    });

    return jsonResponse({ ok: true, data });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message || "Falha ao criar job do portal." }, 500);
  }
}
