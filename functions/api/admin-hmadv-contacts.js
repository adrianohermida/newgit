import { requireAdminAccess } from "../lib/admin-auth.js";
import {
  createOrUpdateContactByNameOnly,
  enrichContactViaCep,
  enrichContactViaDirectData,
  getContactDetail,
  getContactsOverview,
  listContacts,
  syncFreshsalesContactsMirror,
} from "../lib/hmadv-contacts.js";
import { jsonError, jsonOk } from "../lib/hmadv-ops.js";

export async function onRequestGet(context) {
  const auth = await requireAdminAccess(context.request, context.env);
  if (!auth.ok) {
    return jsonError(new Error(auth.error), auth.status);
  }

  try {
    const url = new URL(context.request.url);
    const action = String(url.searchParams.get("action") || "overview");
    if (action === "overview") {
      const data = await getContactsOverview(context.env);
      return jsonOk({ data });
    }
    if (action === "list") {
      const data = await listContacts(context.env, {
        page: Number(url.searchParams.get("page") || 1),
        pageSize: Number(url.searchParams.get("pageSize") || 20),
        query: String(url.searchParams.get("query") || ""),
        type: String(url.searchParams.get("type") || ""),
      });
      return jsonOk({ data });
    }
    if (action === "detail") {
      const contactId = String(url.searchParams.get("contactId") || "");
      if (!contactId) {
        return jsonError(new Error("contactId obrigatorio."), 400);
      }
      const data = await getContactDetail(context.env, contactId);
      return jsonOk({ data });
    }
    return jsonError(new Error("Acao GET invalida."), 400);
  } catch (error) {
    return jsonError(error, 500);
  }
}

export async function onRequestPost(context) {
  const auth = await requireAdminAccess(context.request, context.env);
  if (!auth.ok) {
    return jsonError(new Error(auth.error), auth.status);
  }

  try {
    const body = await context.request.json();
    const action = String(body.action || "");
    if (action === "sync_contacts") {
      const data = await syncFreshsalesContactsMirror(context.env, {
        limit: Number(body.limit || 50),
        dryRun: Boolean(body.dryRun),
      });
      return jsonOk({ data });
    }
    if (action === "enrich_cep") {
      const data = await enrichContactViaCep(context.env, {
        contactId: body.contactId,
        cep: body.cep,
      });
      return jsonOk({ data });
    }
    if (action === "enrich_directdata") {
      const data = await enrichContactViaDirectData(context.env, {
        contactId: body.contactId,
        personType: body.personType || "pf",
      });
      return jsonOk({ data });
    }
    if (action === "create_name_only") {
      const data = await createOrUpdateContactByNameOnly(context.env, {
        name: body.name,
        type: body.type,
        externalId: body.externalId || null,
      });
      return jsonOk({ data });
    }
    return jsonError(new Error("Acao POST invalida."), 400);
  } catch (error) {
    return jsonError(error, 500);
  }
}
