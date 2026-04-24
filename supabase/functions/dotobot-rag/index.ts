import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    const body = await req.json();
    const { query, agent_ref = "dotobot", top_k = 5, threshold = 0.75, include_workflows = true } = body;
    if (!query?.trim()) return Response.json({ error: "query required" }, { status: 400, headers: corsHeaders });

    // Gerar embedding
    const embedRes = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-3-small", input: query.trim() }),
    });
    if (!embedRes.ok) throw new Error(`OpenAI embedding: ${await embedRes.text()}`);
    const embedData = await embedRes.json();
    const queryEmbedding = embedData.data[0].embedding;

    // Busca vetorial nos chunks
    const { data: chunks } = await supabase.rpc("match_knowledge_chunks", {
      query_embedding: queryEmbedding,
      match_agent_ref: agent_ref,
      match_threshold: threshold,
      match_count: top_k,
    });

    // Busca em workflows por frases
    let workflows = [];
    if (include_workflows) {
      const { data: wfData } = await supabase.from("agentlab_workflow_library").select("id, title, type, trigger_phrases, steps, required_params, freshsales_action").eq("agent_ref", agent_ref).eq("status", "active");
      if (wfData) {
        const ql = query.toLowerCase();
        workflows = wfData.map(wf => {
          const phrases = wf.trigger_phrases || [];
          const score = phrases.reduce((s, p) => ql.includes(p.toLowerCase()) ? s + 0.3 : s + (p.toLowerCase().split(" ").filter(w => ql.includes(w)).length / p.split(" ").length) * 0.15, 0);
          return { ...wf, similarity: Math.min(score, 1.0) };
        }).filter(w => w.similarity > 0.1).sort((a, b) => b.similarity - a.similarity).slice(0, 3);
      }
    }

    const knowledgeContext = (chunks || []).map((c, i) => `[Fonte ${i+1} — ${c.source_type} "${c.title}" (${(c.similarity*100).toFixed(0)}%)]\n${c.content}`).join("\n\n");
    const workflowContext = workflows.length > 0 ? workflows.map(w => `WORKFLOW: "${w.title}" (${w.type}, ${(w.similarity*100).toFixed(0)}%)\nParâmetros: ${(w.required_params||[]).join(", ")}`).join("\n") : null;

    return Response.json({
      query, agent_ref,
      knowledge_chunks: chunks || [],
      workflows_detected: workflows,
      context: { knowledge: knowledgeContext || null, workflows: workflowContext, has_knowledge: (chunks||[]).length > 0, has_workflow: workflows.length > 0, top_workflow: workflows[0] || null },
    }, { headers: corsHeaders });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
  }
});
