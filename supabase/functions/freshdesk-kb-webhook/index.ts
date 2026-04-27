/**
 * freshdesk-kb-webhook
 * Recebe notificações do Freshdesk quando artigos da base de conhecimento
 * são criados, atualizados ou excluídos, e re-indexa automaticamente no RAG da Cida.
 *
 * Configuração no Freshdesk:
 *   Admin → Automações → Artigos → Criar regra:
 *     Evento: "Artigo criado" ou "Artigo atualizado"
 *     Ação: Webhook → POST para esta URL
 *     Payload: { "article_id": "{{article.id}}", "event": "{{event.type}}" }
 *
 * Variáveis de ambiente (Supabase secrets):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   FRESHDESK_API_KEY, FRESHDESK_DOMAIN
 *   FREDDY_ACTION_SHARED_SECRET (para validação HMAC opcional)
 *   HUGGINGFACE_API_KEY (para geração de embeddings)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FD_DOMAIN = Deno.env.get("FRESHDESK_DOMAIN") || "hermidamaia.freshdesk.com";
const FD_API_KEY = Deno.env.get("FRESHDESK_API_KEY") || "";
const SHARED_SECRET = Deno.env.get("FREDDY_ACTION_SHARED_SECRET") || "";
const HF_API_KEY = Deno.env.get("HUGGINGFACE_API_KEY") || "";

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface FdArticle {
  id: number;
  title: string;
  description: string;
  desc_un_html?: string;
  status: number;
  folder_id: number;
  hits: number;
  thumbs_up: number;
  thumbs_down: number;
  created_at: string;
  updated_at: string;
  modified_at?: string;
  seo_data?: { meta_title?: string; meta_description?: string; meta_keywords?: string };
  tags?: Array<{ name: string }>;
}

interface FdFolder {
  id: number;
  name: string;
  category_id: number;
}

interface FdCategory {
  id: number;
  name: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function chunkText(text: string, maxChars = 800, overlap = 100): string[] {
  if (text.length <= maxChars) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    chunks.push(text.slice(start, end));
    start = end - overlap;
    if (start >= text.length) break;
  }
  return chunks;
}

async function generateEmbedding(text: string): Promise<number[] | null> {
  // Tentar Cloudflare AI primeiro
  const cfAccountId = await getAppConfig("CLOUDFLARE_ACCOUNT_ID");
  const cfToken = await getAppConfig("CLOUDFLARE_API_TOKEN");
  if (cfAccountId && cfToken) {
    try {
      const resp = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/ai/run/@cf/baai/bge-base-en-v1.5`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${cfToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ text: [text] }),
        }
      );
      if (resp.ok) {
        const data = await resp.json();
        const vec = data?.result?.data?.[0];
        if (vec && vec.length === 768) return vec;
      }
    } catch (_) { /* fallback */ }
  }

  // Fallback: HuggingFace
  const hfKey = HF_API_KEY || (await getAppConfig("HUGGINGFACE_API_KEY"));
  if (!hfKey) return null;
  try {
    const resp = await fetch(
      "https://router.huggingface.co/hf-inference/models/sentence-transformers/paraphrase-multilingual-mpnet-base-v2/pipeline/feature-extraction",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${hfKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: [text], options: { wait_for_model: true } }),
      }
    );
    if (resp.ok) {
      const data = await resp.json();
      const vec = Array.isArray(data[0]) ? data[0] : data;
      if (vec && vec.length === 768) return vec;
    }
  } catch (_) { /* ignore */ }
  return null;
}

// Cache simples para app_config
const configCache: Record<string, string> = {};
async function getAppConfig(key: string): Promise<string> {
  if (configCache[key]) return configCache[key];
  const { data } = await sb.from("app_config").select("value").eq("key", key).single();
  const val = data?.value || "";
  if (val) configCache[key] = val;
  return val;
}

// ─── Buscar artigo completo no Freshdesk ──────────────────────────────────────
async function fetchArticle(articleId: number): Promise<FdArticle | null> {
  const apiKey = FD_API_KEY || (await getAppConfig("FRESHDESK_API_KEY"));
  const basicToken = await getAppConfig("FRESHDESK_BASIC_TOKEN");
  const effectiveKey = apiKey || (basicToken ? atob(basicToken).split(":")[0] : "");
  if (!effectiveKey) return null;

  const domain = FD_DOMAIN.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const resp = await fetch(`https://${domain}/api/v2/solutions/articles/${articleId}`, {
    headers: {
      Authorization: "Basic " + btoa(`${effectiveKey}:X`),
      "Content-Type": "application/json",
    },
  });
  if (!resp.ok) return null;
  return resp.json();
}

async function fetchFolder(folderId: number): Promise<FdFolder | null> {
  const apiKey = FD_API_KEY || (await getAppConfig("FRESHDESK_API_KEY"));
  const basicToken = await getAppConfig("FRESHDESK_BASIC_TOKEN");
  const effectiveKey = apiKey || (basicToken ? atob(basicToken).split(":")[0] : "");
  if (!effectiveKey) return null;

  const domain = FD_DOMAIN.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const resp = await fetch(`https://${domain}/api/v2/solutions/folders/${folderId}`, {
    headers: {
      Authorization: "Basic " + btoa(`${effectiveKey}:X`),
      "Content-Type": "application/json",
    },
  });
  if (!resp.ok) return null;
  return resp.json();
}

async function fetchCategory(categoryId: number): Promise<FdCategory | null> {
  const apiKey = FD_API_KEY || (await getAppConfig("FRESHDESK_API_KEY"));
  const basicToken = await getAppConfig("FRESHDESK_BASIC_TOKEN");
  const effectiveKey = apiKey || (basicToken ? atob(basicToken).split(":")[0] : "");
  if (!effectiveKey) return null;

  const domain = FD_DOMAIN.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const resp = await fetch(`https://${domain}/api/v2/solutions/categories/${categoryId}`, {
    headers: {
      Authorization: "Basic " + btoa(`${effectiveKey}:X`),
      "Content-Type": "application/json",
    },
  });
  if (!resp.ok) return null;
  return resp.json();
}

// ─── Calcular score de qualidade ──────────────────────────────────────────────
function calcQualityScore(article: FdArticle, plainText: string): { score: number; flags: Record<string, boolean> } {
  const flags: Record<string, boolean> = {
    empty_content: !plainText || plainText.length < 10,
    very_short: plainText.length < 100,
    no_seo_title: !article.seo_data?.meta_title,
    no_seo_description: !article.seo_data?.meta_description,
    no_tags: !article.tags || article.tags.length === 0,
    draft_status: article.status === 1,
    zero_hits_published: article.status === 2 && article.hits === 0,
    negative_feedback: article.thumbs_down > article.thumbs_up,
    no_description: !article.description || article.description.length < 20,
  };
  let score = 100;
  if (flags.empty_content) score -= 50;
  if (flags.very_short) score -= 20;
  if (flags.no_seo_title) score -= 10;
  if (flags.no_seo_description) score -= 10;
  if (flags.no_tags) score -= 5;
  if (flags.draft_status) score -= 5;
  if (flags.zero_hits_published) score -= 5;
  if (flags.negative_feedback) score -= 10;
  if (flags.no_description) score -= 30;
  return { score: Math.max(0, score), flags };
}

// ─── Indexar artigo no RAG ────────────────────────────────────────────────────
async function indexArticle(
  article: FdArticle,
  folderName: string,
  categoryName: string,
  event: string
): Promise<{ success: boolean; chunks: number; message: string }> {
  const plainText = stripHtml(article.description || "");
  const { score, flags } = calcQualityScore(article, plainText);

  // 1. Upsert na tabela freshdesk_articles
  const articleData = {
    fd_article_id: article.id,
    fd_folder_id: article.folder_id,
    title: article.title,
    description: article.description || "",
    desc_plain: plainText,
    status: article.status,
    art_type: article.art_type || 1,
    tags: article.tags?.map((t) => t.name) || [],
    seo_title: article.seo_data?.meta_title || null,
    seo_description: article.seo_data?.meta_description || null,
    seo_keywords: article.seo_data?.meta_keywords || null,
    hits: article.hits || 0,
    thumbs_up: article.thumbs_up || 0,
    thumbs_down: article.thumbs_down || 0,
    folder_name: folderName,
    category_name: categoryName,
    fd_created_at: article.created_at,
    fd_updated_at: article.updated_at,
    synced_at: new Date().toISOString(),
    quality_score: score,
    quality_flags: flags,
    is_active: true,
  };

  const { error: upsertErr } = await sb
    .from("freshdesk_articles")
    .upsert(articleData, { onConflict: "fd_article_id" });

  if (upsertErr) {
    return { success: false, chunks: 0, message: `Erro ao salvar artigo: ${upsertErr.message}` };
  }

  // 2. Se artigo foi excluído ou é rascunho sem conteúdo, remover chunks
  if (event === "deleted" || (article.status === 1 && plainText.length < 10)) {
    await sb
      .from("agentlab_knowledge_sources")
      .update({ status: "inactive" })
      .eq("source_ref", `freshdesk:${article.id}`)
      .eq("agent_ref", "cida");
    return { success: true, chunks: 0, message: `Artigo ${article.id} marcado como inativo` };
  }

  // 3. Remover chunks antigos deste artigo
  const { data: oldSource } = await sb
    .from("agentlab_knowledge_sources")
    .select("id")
    .eq("source_ref", `freshdesk:${article.id}`)
    .eq("agent_ref", "cida")
    .single();

  if (oldSource?.id) {
    await sb.from("agentlab_knowledge_chunks").delete().eq("source_id", oldSource.id);
  }

  // 4. Criar/atualizar source
  const sourceData = {
    agent_ref: "cida",
    source_type: "freshdesk_article",
    source_ref: `freshdesk:${article.id}`,
    title: article.title,
    status: "active",
    content: plainText.slice(0, 5000),
    source_url: `https://${FD_DOMAIN.replace(/^https?:\/\//, "")}/support/solutions/articles/${article.id}`,
    metadata: {
      fd_article_id: article.id,
      category: categoryName,
      folder: folderName,
      quality_score: score,
      status: article.status,
      tags: article.tags?.map((t) => t.name) || [],
    },
    updated_at: new Date().toISOString(),
  };

  let sourceId: string;
  if (oldSource?.id) {
    await sb.from("agentlab_knowledge_sources").update(sourceData).eq("id", oldSource.id);
    sourceId = oldSource.id;
  } else {
    const { data: newSource, error: sourceErr } = await sb
      .from("agentlab_knowledge_sources")
      .insert(sourceData)
      .select("id")
      .single();
    if (sourceErr || !newSource) {
      return { success: false, chunks: 0, message: `Erro ao criar source: ${sourceErr?.message}` };
    }
    sourceId = newSource.id;
  }

  // 5. Criar chunks com embeddings
  const fullText = [
    `Título: ${article.title}`,
    categoryName ? `Categoria: ${categoryName}` : "",
    folderName ? `Pasta: ${folderName}` : "",
    article.tags?.length ? `Tags: ${article.tags.map((t) => t.name).join(", ")}` : "",
    "",
    plainText,
  ]
    .filter(Boolean)
    .join("\n");

  const textChunks = chunkText(fullText, 800, 100);
  let chunksCreated = 0;

  for (let i = 0; i < textChunks.length; i++) {
    const chunkText = textChunks[i];
    const embedding = await generateEmbedding(chunkText);

    const chunkData: Record<string, unknown> = {
      source_id: sourceId,
      agent_ref: "cida",
      chunk_index: i,
      content: chunkText,
      metadata: {
        article_id: article.id,
        title: article.title,
        category: categoryName,
        folder: folderName,
        chunk_index: i,
        total_chunks: textChunks.length,
      },
    };
    if (embedding) chunkData.embedding = JSON.stringify(embedding);

    const { error: chunkErr } = await sb.from("agentlab_knowledge_chunks").insert(chunkData);
    if (!chunkErr) chunksCreated++;
  }

  // 6. Atualizar chunk_count na source
  await sb
    .from("agentlab_knowledge_sources")
    .update({ chunk_count: chunksCreated })
    .eq("id", sourceId);

  return {
    success: true,
    chunks: chunksCreated,
    message: `Artigo "${article.title}" indexado: ${chunksCreated} chunks, score ${score}`,
  };
}

// ─── Handler principal ────────────────────────────────────────────────────────
serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-freshdesk-signature",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // Modo status: GET /freshdesk-kb-webhook?mode=status
  if (req.method === "GET" && url.searchParams.get("mode") === "status") {
    const { data: syncRuns } = await sb
      .from("freshdesk_sync_runs")
      .select("status, articles_found, articles_created, articles_updated, started_at, finished_at")
      .order("started_at", { ascending: false })
      .limit(3);

    const { count: totalChunks } = await sb
      .from("agentlab_knowledge_chunks")
      .select("*", { count: "exact", head: true })
      .eq("agent_ref", "cida");

    const { count: chunksWithEmbed } = await sb
      .from("agentlab_knowledge_chunks")
      .select("*", { count: "exact", head: true })
      .eq("agent_ref", "cida")
      .not("embedding", "is", null);

    return new Response(
      JSON.stringify({
        status: "ok",
        total_chunks: totalChunks,
        chunks_with_embedding: chunksWithEmbed,
        embedding_coverage: totalChunks ? Math.round((chunksWithEmbed! / totalChunks) * 100) : 0,
        recent_syncs: syncRuns,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Modo sincronização incremental: POST com body { mode: "incremental_sync" }
  if (req.method === "POST") {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch (_) { /* body vazio */ }

    // Modo incremental: sincroniza apenas artigos atualizados nas últimas N horas
    if (body.mode === "incremental_sync") {
      const hoursBack = (body.hours_back as number) || 2;
      const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

      // Buscar artigos atualizados no Freshdesk desde 'since'
      const apiKey = FD_API_KEY || (await getAppConfig("FRESHDESK_API_KEY"));
      const basicToken = await getAppConfig("FRESHDESK_BASIC_TOKEN");
      const effectiveKey = apiKey || (basicToken ? atob(basicToken).split(":")[0] : "");

      if (!effectiveKey) {
        return new Response(
          JSON.stringify({ error: "FRESHDESK_API_KEY não configurada" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const domain = FD_DOMAIN.replace(/^https?:\/\//, "").replace(/\/$/, "");
      const authHeader = "Basic " + btoa(`${effectiveKey}:X`);

      // Buscar artigos atualizados recentemente
      const searchResp = await fetch(
        `https://${domain}/api/v2/solutions/articles?per_page=30&page=1&updated_since=${since}`,
        { headers: { Authorization: authHeader, "Content-Type": "application/json" } }
      );

      if (!searchResp.ok) {
        return new Response(
          JSON.stringify({ error: `Freshdesk API error: ${searchResp.status}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const articles: FdArticle[] = await searchResp.json();
      const results = [];

      for (const article of articles) {
        const folder = await fetchFolder(article.folder_id);
        const category = folder ? await fetchCategory(folder.category_id) : null;
        const result = await indexArticle(
          article,
          folder?.name || "Desconhecida",
          category?.name || "Desconhecida",
          "updated"
        );
        results.push({ id: article.id, title: article.title, ...result });
      }

      return new Response(
        JSON.stringify({ mode: "incremental_sync", articles_processed: results.length, results }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Modo webhook: recebe notificação do Freshdesk sobre um artigo específico
    // Payload esperado: { article_id: number, event: "created"|"updated"|"deleted" }
    const articleId = body.article_id as number;
    const event = (body.event as string) || "updated";

    if (!articleId) {
      return new Response(
        JSON.stringify({ error: "article_id é obrigatório", received: body }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[kb-webhook] Evento: ${event} | Artigo: ${articleId}`);

    // Buscar dados completos do artigo
    const article = await fetchArticle(articleId);
    if (!article) {
      return new Response(
        JSON.stringify({ error: `Artigo ${articleId} não encontrado no Freshdesk` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar pasta e categoria
    const folder = await fetchFolder(article.folder_id);
    const category = folder ? await fetchCategory(folder.category_id) : null;

    // Indexar artigo
    const result = await indexArticle(
      article,
      folder?.name || "Desconhecida",
      category?.name || "Desconhecida",
      event
    );

    console.log(`[kb-webhook] Resultado: ${result.message}`);

    return new Response(
      JSON.stringify({
        success: result.success,
        article_id: articleId,
        event,
        chunks_created: result.chunks,
        message: result.message,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(JSON.stringify({ error: "Método não suportado" }), {
    status: 405,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
