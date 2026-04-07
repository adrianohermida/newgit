import { handleFreddyGetContact360 } from "../lib/freddy-memory-gateway.js";

export async function onRequestPost(context) {
  return handleFreddyGetContact360(context.request, context.env);
}

export async function onRequestOptions() {
  return new Response("", { status: 204 });
}
