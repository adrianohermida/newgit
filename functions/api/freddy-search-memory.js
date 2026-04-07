import { handleFreddySearchMemory } from "../lib/freddy-memory-gateway.js";

export async function onRequestPost(context) {
  return handleFreddySearchMemory(context.request, context.env);
}

export async function onRequestOptions() {
  return new Response("", { status: 204 });
}
