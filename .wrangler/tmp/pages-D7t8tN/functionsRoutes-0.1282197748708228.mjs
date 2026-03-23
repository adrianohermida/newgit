import { onRequestPost as __api_agendar_js_onRequestPost } from "/workspaces/newgit/functions/api/agendar.js"
import { onRequestGet as __api_confirmar_js_onRequestGet } from "/workspaces/newgit/functions/api/confirmar.js"
import { onRequestPost as __api_freshdesk_ticket_js_onRequestPost } from "/workspaces/newgit/functions/api/freshdesk-ticket.js"
import { onRequestGet as __api_slots_js_onRequestGet } from "/workspaces/newgit/functions/api/slots.js"
import { onRequestGet as __api_slots_month_js_onRequestGet } from "/workspaces/newgit/functions/api/slots-month.js"
import { onRequestOptions as __api_slots_month_js_onRequestOptions } from "/workspaces/newgit/functions/api/slots-month.js"
import { onRequestGet as __api_slots2_js_onRequestGet } from "/workspaces/newgit/functions/api/slots2.js"
import { onRequest as ___middleware_js_onRequest } from "/workspaces/newgit/functions/_middleware.js"
import { onRequest as __index_js_onRequest } from "/workspaces/newgit/functions/index.js"

export const routes = [
    {
      routePath: "/api/agendar",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_agendar_js_onRequestPost],
    },
  {
      routePath: "/api/confirmar",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_confirmar_js_onRequestGet],
    },
  {
      routePath: "/api/freshdesk-ticket",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_freshdesk_ticket_js_onRequestPost],
    },
  {
      routePath: "/api/slots",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_slots_js_onRequestGet],
    },
  {
      routePath: "/api/slots-month",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_slots_month_js_onRequestGet],
    },
  {
      routePath: "/api/slots-month",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_slots_month_js_onRequestOptions],
    },
  {
      routePath: "/api/slots2",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_slots2_js_onRequestGet],
    },
  {
      routePath: "/",
      mountPath: "/",
      method: "",
      middlewares: [___middleware_js_onRequest],
      modules: [__index_js_onRequest],
    },
  ]