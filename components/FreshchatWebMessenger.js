import { useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { getSupabaseBrowserClient } from "../lib/supabase";

const VISITOR_ID_KEY = "hmadv:freshchat:visitor-id";
const UUID_KEY = "hmadv:freshchat:uuid";
const REFERENCE_ID_KEY = "hmadv:freshchat:reference-id";
const SCRIPT_ID = "hmadv_freshchat_widget_script";
const INIT_KEY = "hmadv:freshchat:initialized";

function createVisitorId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `visitor-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readStorage(key) {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  if (typeof window === "undefined" || !value) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore local storage failures
  }
}

function buildAnonymousIdentity() {
  const currentVisitorId = readStorage(VISITOR_ID_KEY) || createVisitorId();
  const referenceId = `visitor:${currentVisitorId}`;
  writeStorage(VISITOR_ID_KEY, currentVisitorId);
  writeStorage(REFERENCE_ID_KEY, referenceId);
  return {
    visitorId: currentVisitorId,
    referenceId,
    firstName: "Visitante",
    lastName: "",
    email: "",
    phoneNumber: "",
    identityMode: "visitor",
  };
}

async function fetchPortalIdentity() {
  try {
    const supabase = await getSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return null;
    }

    const response = await fetch("/api/client-profile", {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        Accept: "application/json",
      },
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false || !payload.profile) {
      return null;
    }

    const profile = payload.profile;
    const fullName = String(profile.full_name || "").trim().replace(/\s+/g, " ");
    const [firstName, ...rest] = fullName.split(" ").filter(Boolean);

    return {
      accessToken: session.access_token,
      visitorId: session.user?.id || "",
      referenceId: `portal:${profile.id || session.user?.id || "cliente"}`,
      firstName: firstName || "Cliente",
      lastName: rest.join(" "),
      email: profile.email || session.user?.email || "",
      phoneNumber: profile.whatsapp || "",
      identityMode: "portal_client",
    };
  } catch {
    return null;
  }
}

async function resolveIdentity(isPortalRoute) {
  const anonymous = buildAnonymousIdentity();
  if (!isPortalRoute) {
    return anonymous;
  }

  const portalIdentity = await fetchPortalIdentity();
  return portalIdentity || anonymous;
}

async function fetchFreshchatConfig() {
  const response = await fetch("/api/public-chat-config", {
    headers: { Accept: "application/json" },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || "Configuracao publica do Freshchat indisponivel.");
  }

  return payload;
}

async function requestJwt(identity, freshchatUuid, authorization) {
  const response = await fetch("/api/freshchat-jwt", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: JSON.stringify({
      visitorId: identity.visitorId,
      referenceId: identity.referenceId,
      firstName: identity.firstName,
      lastName: identity.lastName,
      email: identity.email,
      phoneNumber: identity.phoneNumber,
      freshchatUuid,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || "Falha ao obter JWT do Freshchat.");
  }

  return payload;
}

function appendWidgetScript(scriptUrl) {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      if (window.fcWidget) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Falha ao carregar script do Freshchat.")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = scriptUrl;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Falha ao carregar script do Freshchat."));
    document.body.appendChild(script);
  });
}

export default function FreshchatWebMessenger() {
  const router = useRouter();
  const authInFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const pathname = String(router.pathname || "");
    const isInternalRoute = pathname.startsWith("/interno");
    const isPortalRoute = pathname.startsWith("/portal");

    if (isInternalRoute || typeof window === "undefined") {
      return undefined;
    }

    let cancelled = false;

    async function boot() {
      const config = await fetchFreshchatConfig().catch(() => null);
      if (!config?.enabled || cancelled) {
        return;
      }

      const identity = await resolveIdentity(isPortalRoute);
      if (cancelled) {
        return;
      }

      const authorization = identity.accessToken ? `Bearer ${identity.accessToken}` : null;
      const storedUuid = readStorage(UUID_KEY);

      if (config.jwtEnabled && storedUuid) {
        try {
          const preloaded = await requestJwt(identity, storedUuid, authorization);
          window.fcWidgetMessengerConfig = {
            ...(window.fcWidgetMessengerConfig || {}),
            jwtAuthToken: preloaded.token,
          };
        } catch (error) {
          console.warn("Freshchat: falha ao preaquecer JWT do widget.", error);
        }
      }
      await appendWidgetScript(config.runtimeScriptUrl || config.scriptUrl);
      if (cancelled) {
        return;
      }

      const widget = window.fcWidget || window.fwcrm;
      if (!widget || typeof widget.init !== "function") {
        return;
      }

      const syncIdentity = () => {
        if (typeof widget.setExternalId === "function" && identity.referenceId) {
          widget.setExternalId(identity.referenceId);
        }
        if (widget.user?.setFirstName && identity.firstName) {
          widget.user.setFirstName(identity.firstName);
        }
        if (widget.user?.setLastName && identity.lastName) {
          widget.user.setLastName(identity.lastName);
        }
        if (widget.user?.setEmail && identity.email) {
          widget.user.setEmail(identity.email);
        }
        if (widget.user?.setPhone && identity.phoneNumber) {
          widget.user.setPhone(identity.phoneNumber);
        }
      };

      const authenticateUser = async (userData) => {
        if (authInFlight.current || !config.jwtEnabled) {
          return;
        }

        authInFlight.current = true;
        try {
          let freshchatUuid = userData?.freshchat_uuid || readStorage(UUID_KEY);
          if (!freshchatUuid && widget.user?.getUUID) {
            const uuidResponse = await widget.user.getUUID();
            freshchatUuid = uuidResponse?.data?.uuid || null;
          }

          if (!freshchatUuid) {
            return;
          }

          writeStorage(UUID_KEY, freshchatUuid);
          syncIdentity();

          const jwtPayload = await requestJwt(identity, freshchatUuid, authorization);
          if (typeof widget.authenticate === "function") {
            widget.authenticate(jwtPayload.token);
          }
        } catch (error) {
          console.warn("Freshchat: falha ao autenticar widget JWT.", error);
        } finally {
          authInFlight.current = false;
        }
      };

      const registerHandlers = () => {
        if (window[INIT_KEY]) {
          syncIdentity();
          return;
        }

        window[INIT_KEY] = true;
        widget.on?.("frame:statechange", (data) => {
          if (data?.success === false && data?.data?.frameState === "not_authenticated") {
            authenticateUser(data.data);
          }
        });

        widget.on?.("user:statechange", (data) => {
          const userData = data?.data || {};
          if (userData?.freshchat_uuid) {
            writeStorage(UUID_KEY, userData.freshchat_uuid);
          }

          if (data?.success) {
            syncIdentity();
            return;
          }

          if (
            userData?.userState === "not_loaded" ||
            userData?.userState === "unloaded" ||
            userData?.userState === "not_created" ||
            userData?.userState === "not_authenticated"
          ) {
            authenticateUser(userData);
          }
        });

        syncIdentity();
      };

      if (window[INIT_KEY]) {
        syncIdentity();
        return;
      }

      widget.init({
        token: config.messengerToken,
        host: config.widgetHost,
        externalId: identity.referenceId,
        firstName: identity.firstName,
        lastName: identity.lastName,
        email: identity.email,
        phone: identity.phoneNumber,
        config: {
          headerProperty: {
            hideChatButton: false,
          },
        },
        onInit: function onInit() {
          registerHandlers();
        },
      });
    }

    boot().catch((error) => {
      if (!cancelled) {
        console.warn("Freshchat: falha ao inicializar o Web Messenger.", error);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [router.pathname]);

  return null;
}
