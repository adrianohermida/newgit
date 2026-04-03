import { createFreshchatJwt } from "../../functions/lib/freshchat-web.js";

function clean(value) {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  return trimmed || null;
}

function buildReferenceId(prefix, rawId) {
  const cleaned = String(rawId || "").trim().replace(/[^a-zA-Z0-9:_-]/g, "-");
  return `${prefix}:${cleaned || "anon"}`;
}

function splitFullName(fullName) {
  const normalized = String(fullName || "").trim().replace(/\s+/g, " ");
  if (!normalized) return { firstName: "", lastName: "" };
  const [firstName, ...rest] = normalized.split(" ");
  return { firstName, lastName: rest.join(" ").trim() };
}

async function resolvePortalIdentity(req) {
  const authorization = req.headers.authorization || "";
  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  const baseUrl = clean(process.env.SUPABASE_URL) || clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const apiKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY) || clean(process.env.SUPABASE_ANON_KEY);
  if (!baseUrl || !apiKey) {
    return null;
  }

  const accessToken = authorization.slice("Bearer ".length).trim();
  const userResponse = await fetch(`${baseUrl}/auth/v1/user`, {
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${accessToken}`,
    },
  }).catch(() => null);

  if (!userResponse?.ok) {
    return null;
  }

  const user = await userResponse.json().catch(() => null);
  if (!user?.id) {
    return null;
  }

  const profileResponse = await fetch(
    `${baseUrl}/rest/v1/client_profiles?select=id,email,full_name,whatsapp&id=eq.${encodeURIComponent(user.id)}&limit=1`,
    {
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    }
  ).catch(() => null);

  const profileRows = profileResponse?.ok ? await profileResponse.json().catch(() => []) : [];
  const profile = Array.isArray(profileRows) ? profileRows[0] || null : null;
  const fullName = profile?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || "";
  const { firstName, lastName } = splitFullName(fullName);

  return {
    referenceId: buildReferenceId("portal", profile?.id || user.id),
    firstName: firstName || "Cliente",
    lastName,
    email: profile?.email || user.email || null,
    phoneNumber: profile?.whatsapp || user.user_metadata?.whatsapp || null,
    identityMode: "portal_client",
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  try {
    const body = typeof req.body === "object" && req.body ? req.body : {};
    const freshchatUuid = String(body.freshchatUuid || body.freshchat_uuid || "").trim();
    if (!freshchatUuid) {
      return res.status(400).json({ ok: false, error: "freshchat_uuid ausente para autenticacao do widget." });
    }

    const portalIdentity = await resolvePortalIdentity(req);
    const visitorId = String(body.visitorId || body.visitor_id || "").trim();
    const providedReferenceId = String(body.referenceId || body.reference_id || "").trim();

    const identity = {
      freshchatUuid,
      referenceId: providedReferenceId || buildReferenceId("visitor", visitorId || "anon"),
      firstName: clean(body.firstName || body.first_name) || "Visitante",
      lastName: clean(body.lastName || body.last_name) || "",
      email: clean(body.email)?.toLowerCase() || null,
      phoneNumber: clean(body.phoneNumber || body.phone_number) || null,
      identityMode: "visitor",
      ...(portalIdentity || {}),
    };

    const jwt = await createFreshchatJwt(process.env, identity);

    return res.status(200).json({
      ok: true,
      token: jwt.token,
      mode: jwt.mode,
      identity: {
        referenceId: jwt.payload.reference_id,
        firstName: jwt.payload.first_name || "",
        lastName: jwt.payload.last_name || "",
        email: jwt.payload.email || "",
        phoneNumber: jwt.payload.phone_number || "",
      },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "Falha ao gerar JWT do Freshchat.",
    });
  }
}
