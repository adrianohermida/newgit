import { requireAdminAccess } from "../lib/admin-auth.js";
import {
  createContact,
  createOrUpdateContactByNameOnly,
  deleteContact,
  enrichContactViaCep,
  enrichContactViaDirectData,
  getContactDetail,
  getContactsOverview,
  linkPartesToExistingContact,
  listContacts,
  listDuplicateContacts,
  listLinkedPartes,
  listUnlinkedPartes,
  mergeContacts,
  reclassifyLinkedPartes,
  reconcilePartesContacts,
  syncFreshsalesContactsMirror,
  unlinkPartesFromContact,
  updateContact,
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
    if (action === "duplicates") {
      const data = await listDuplicateContacts(context.env, {
        page: Number(url.searchParams.get("page") || 1),
        pageSize: Number(url.searchParams.get("pageSize") || 20),
      });
      return jsonOk({ data });
    }
    if (action === "partes_pendentes") {
      const data = await listUnlinkedPartes(context.env, {
        page: Number(url.searchParams.get("page") || 1),
        pageSize: Number(url.searchParams.get("pageSize") || 20),
        query: String(url.searchParams.get("query") || ""),
      });
      return jsonOk({ data });
    }
    if (action === "partes_vinculadas") {
      const data = await listLinkedPartes(context.env, {
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
    if (action === "create_contact") {
      const data = await createContact(context.env, body);
      return jsonOk({ data });
    }
    if (action === "update_contact") {
      const data = await updateContact(context.env, body);
      return jsonOk({ data });
    }
    if (action === "delete_contact") {
      const data = await deleteContact(context.env, { contactId: body.contactId });
      return jsonOk({ data });
    }
    if (action === "merge_contacts") {
      const data = await mergeContacts(context.env, {
        primaryContactId: body.primaryContactId,
        duplicateContactId: body.duplicateContactId,
      });
      return jsonOk({ data });
    }
    if (action === "reconcile_partes") {
      const processNumbers = Array.isArray(body.processNumbers)
        ? body.processNumbers
        : String(body.processNumbers || "")
            .split(/\r?\n|,|;/)
            .map((item) => item.trim())
            .filter(Boolean);
      const data = await reconcilePartesContacts(context.env, {
        processNumbers,
        limit: Number(body.limit || 20),
        apply: Boolean(body.apply),
      });
      return jsonOk({ data });
    }
    if (action === "vincular_partes") {
      const parteIds = Array.isArray(body.parteIds)
        ? body.parteIds
        : String(body.parteIds || "")
            .split(/\r?\n|,|;/)
            .map((item) => item.trim())
            .filter(Boolean);
      const data = await linkPartesToExistingContact(context.env, {
        parteIds,
        contactId: body.contactId,
        type: body.type || "",
      });
      return jsonOk({ data });
    }
    if (action === "desvincular_partes") {
      const parteIds = Array.isArray(body.parteIds)
        ? body.parteIds
        : String(body.parteIds || "")
            .split(/\r?\n|,|;/)
            .map((item) => item.trim())
            .filter(Boolean);
      const data = await unlinkPartesFromContact(context.env, { parteIds });
      return jsonOk({ data });
    }
    if (action === "reclassificar_partes") {
      const parteIds = Array.isArray(body.parteIds)
        ? body.parteIds
        : String(body.parteIds || "")
            .split(/\r?\n|,|;/)
            .map((item) => item.trim())
            .filter(Boolean);
      const data = await reclassifyLinkedPartes(context.env, {
        parteIds,
        type: body.type || "",
      });
      return jsonOk({ data });
    }
    return jsonError(new Error("Acao POST invalida."), 400);
  } catch (error) {
    return jsonError(error, 500);
  }
}
