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
    .in("key", ["SLACK_BOT_TOKEN", "SLACK_SIGNING_SECRET", "AI_CORE_URL", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"]);
  
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
    
    // 1. Slack URL Verification (Challenge)
    if (req.method === "POST") {
      const clonedReq = req.clone();
      const body = await clonedReq.json();
      if (body.type === "url_verification") {
        return new Response(JSON.stringify({ challenge: body.challenge }), {
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // 2. Verify Signature
    const isVerified = await verifySlackSignature(req, config.SLACK_SIGNING_SECRET);
    if (!isVerified) {
      console.error("Slack signature verification failed");
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await req.json();

    if (body.event) {
      const { event } = body;
      
      // Ignore bot messages to prevent loops
      if (event.bot_id || event.subtype === "bot_message") return new Response("OK");

      // 3. Immediate Feedback (Eyes reaction) - Bolt Pattern
      EdgeRuntime.waitUntil(fetch("https://slack.com/api/reactions.add", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.SLACK_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel: event.channel,
          timestamp: event.ts,
          name: "eyes",
        }),
      }));

      // 4. "Thinking" message (UX Pattern from pasted_content_2)
      const thinkingMsg = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.SLACK_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel: event.channel,
          thread_ts: event.thread_ts || event.ts,
          text: "⏳ *DotoBot v5.2* está analisando sua solicitação...",
        }),
      }).then(res => res.json());

      // 5. Background Orchestration
      EdgeRuntime.waitUntil((async () => {
        try {
          const orchestrator = new AiOrchestrator(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, config);
          
          // Clean mention from text (Bolt Pattern)
          const cleanText = event.text.replace(/<@.*?>/, "").trim();
          
          const result = await orchestrator.orchestrate(cleanText, event.user);

          // 6. Update message with final answer (Production Pattern)
          await fetch("https://slack.com/api/chat.update", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${config.SLACK_BOT_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              channel: event.channel,
              ts: thinkingMsg.ts,
              text: result.answer,
              blocks: [
                {
                  type: "section",
                  text: { type: "mrkdwn", text: result.answer }
                },
                {
                  type: "context",
                  elements: [
                    { type: "mrkdwn", text: `*DotoBot v5.2* | Passos: ${result.steps} | Memória: ${result.context_used ? "Ativa" : "Inativa"}` }
                  ]
                }
              ]
            }),
          });
        } catch (err) {
          console.error("Orchestration error:", err);
          await fetch("https://slack.com/api/chat.update", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${config.SLACK_BOT_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              channel: event.channel,
              ts: thinkingMsg.ts,
              text: "❌ Erro ao processar sua solicitação. Por favor, tente novamente mais tarde.",
            }),
          });
        }
      })());
    }

    return new Response("OK");
  } catch (err) {
    console.error("Global error:", err);
    return new Response(err.message, { status: 500 });
  }
});
