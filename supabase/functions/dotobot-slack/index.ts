import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { AiOrchestrator } from "./ai-orchestrator.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function getAppConfig() {
  const { data, error } = await supabase
    .from("app_config")
    .select("key, value")
    .in("key", ["SLACK_BOT_TOKEN", "SLACK_SIGNING_SECRET", "AI_CORE_URL"]);
  
  if (error) throw error;
  return Object.fromEntries(data.map(item => [item.key, item.value]));
}

async function verifySlackSignature(req: Request, signingSecret: string) {
  const timestamp = req.headers.get("x-slack-request-timestamp");
  const signature = req.headers.get("x-slack-signature");
  const body = await req.clone().text();

  if (!timestamp || !signature) return false;

  const baseString = "v0:" + timestamp + ":" + body;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(baseString));
  const sigHex = "v0=" + Array.from(new Uint8Array(sigBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");

  return sigHex === signature;
}

serve(async (req) => {
  try {
    const config = await getAppConfig();
    const isVerified = await verifySlackSignature(req, config.SLACK_SIGNING_SECRET);
    
    if (!isVerified) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await req.json();

    // Slack URL Verification
    if (body.type === "url_verification") {
      return new Response(JSON.stringify({ challenge: body.challenge }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Process Event
    if (body.event) {
      const { event } = body;
      
      // Ignore bot messages
      if (event.bot_id) return new Response("OK");

      // Immediate feedback
      await fetch("https://slack.com/api/reactions.add", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + config.SLACK_BOT_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel: event.channel,
          timestamp: event.ts,
          name: "eyes",
        }),
      });

      // Orchestration
      const orchestrator = new AiOrchestrator(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const result = await orchestrator.orchestrate(event.text, "");

      // Send Response
      await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + config.SLACK_BOT_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel: event.channel,
          text: result.answer,
          blocks: [
            {
              type: "section",
              text: { type: "mrkdwn", text: result.answer }
            },
            {
              type: "context",
              elements: [
                { type: "mrkdwn", text: "*DotoBot v5.2* | Orquestração: " + result.steps + " passos | Memória: " + (result.context_used ? "Ativa" : "Inativa") }
              ]
            }
          ]
        }),
      });
    }

    return new Response("OK");
  } catch (err) {
    console.error(err);
    return new Response(err.message, { status: 500 });
  }
});
