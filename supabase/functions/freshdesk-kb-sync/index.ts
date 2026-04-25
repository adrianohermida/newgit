/**
 * freshdesk-kb-sync
 * Sincroniza artigos do helpdesk Freshdesk com a base de conhecimento do Supabase.
 * Indexa conteúdo, calcula score de qualidade e popula agentlab_knowledge_chunks para o RAG da Cida.
 *
 * Endpoints:
 *   POST /freshdesk-kb-sync          → executa sincronização completa
 *   POST /freshdesk-kb-sync?mode=validate → valida qualidade dos artigos existentes
 *   GET  /freshdesk-kb-sync?mode=status   → retorna status da última sincronização
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ── Tipos ──────────────────────────────────────────────────────────────────

interface FdCategory {
  id: number;
  name: string;
  description: string;
  folders: FdFolder[];
}

interface FdFolder {
  id: number;
  category_id: number;
  name: string;
  description: string;
  visibility: number;
  articles?: FdArticle[];
}

interface FdArticle {
  id: number;
  folder_id: number;
  title: string;
  description: string;
  desc_un_html: string;
  status: number;       // 1=draft, 2=published
  art_type: number;     // 1=permanent, 2=workaround
  hits: number;
  thumbs_up: number;
  thumbs_down: number;
  created_at: string;
  updated_at: string;
  modified_at: string;
  seo_data: { meta_title?: string; meta_description?: string; meta_keywords?: string };
  tags?: Array<{ name: string }>;
}

interface QualityFlags {
  empty_content: boolean;
  very_short: boolean;
  no_seo_title: boolean;
  no_seo_description: boolean;
  no_tags: boolean;
  draft_status: boolean;
  zero_hits_published: boolean;
  negative_feedback: boolean;
  no_description: boolean;
}

interface QualityResult {
  score: number;          // 0–100
  flags: QualityFlags;
  issues: string[];
  confidence: 'high' | 'medium' | 'low';
}

// ── Avaliação de Qualidade ─────────────────────────────────────────────────

function evaluateArticleQuality(article: FdArticle, folderName: string, categoryName: string): QualityResult {
  const flags: QualityFlags = {
    empty_content: false,
    very_short: false,
    no_seo_title: false,
    no_seo_description: false,
    no_tags: false,
    draft_status: false,
    zero_hits_published: false,
    negative_feedback: false,
    no_description: false,
  };
  const issues: string[] = [];
  let score = 100;

  // 1. Conteúdo vazio ou ausente (-30)
  const plainText = (article.desc_un_html || '').trim();
  if (!plainText || plainText.length === 0) {
    flags.empty_content = true;
    flags.no_description = true;
    issues.push('Artigo sem conteúdo (corpo vazio)');
    score -= 30;
  } else if (plainText.length < 100) {
    // 2. Conteúdo muito curto (-15)
    flags.very_short = true;
    issues.push(`Conteúdo muito curto (${plainText.length} caracteres)`);
    score -= 15;
  }

  // 3. Sem título SEO (-10)
  if (!article.seo_data?.meta_title || article.seo_data.meta_title.trim() === '') {
    flags.no_seo_title = true;
    issues.push('Sem meta_title (SEO)');
    score -= 10;
  }

  // 4. Sem descrição SEO (-10)
  if (!article.seo_data?.meta_description || article.seo_data.meta_description.trim() === '') {
    flags.no_seo_description = true;
    issues.push('Sem meta_description (SEO)');
    score -= 10;
  }

  // 5. Sem tags (-5)
  if (!article.tags || article.tags.length === 0) {
    flags.no_tags = true;
    issues.push('Sem tags');
    score -= 5;
  }

  // 6. Status rascunho (-10)
  if (article.status === 1) {
    flags.draft_status = true;
    issues.push('Artigo em rascunho (não publicado)');
    score -= 10;
  }

  // 7. Publicado mas sem visualizações (-5)
  if (article.status === 2 && article.hits === 0) {
    flags.zero_hits_published = true;
    issues.push('Publicado mas sem nenhuma visualização');
    score -= 5;
  }

  // 8. Feedback negativo dominante (-15)
  const totalFeedback = (article.thumbs_up || 0) + (article.thumbs_down || 0);
  if (totalFeedback > 0 && (article.thumbs_down || 0) > (article.thumbs_up || 0)) {
    flags.negative_feedback = true;
    issues.push(`Feedback negativo dominante (👍${article.thumbs_up} 👎${article.thumbs_down})`);
    score -= 15;
  }

  // Garantir que o score fique entre 0 e 100
  score = Math.max(0, Math.min(100, score));

  // Classificar confiança
  let confidence: 'high' | 'medium' | 'low';
  if (score >= 75) confidence = 'high';
  else if (score >= 45) confidence = 'medium';
  else confidence = 'low';

  return { score, flags, issues, confidence };
}

// ── Chunking para RAG ──────────────────────────────────────────────────────

function chunkText(text: string, maxChunkSize = 800): string[] {
  if (!text || text.trim().length === 0) return [];

  // Dividir por parágrafos primeiro
  const paragraphs = text.split(/\n{2,}|\r\n{2,}/).map(p => p.trim()).filter(p => p.length > 0);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const para of paragraphs) {
    if (currentChunk.length + para.length + 2 <= maxChunkSize) {
      currentChunk += (currentChunk ? '\n\n' : '') + para;
    } else {
      if (currentChunk) chunks.push(currentChunk);
      // Se o parágrafo sozinho é maior que o limite, dividir por frases
      if (para.length > maxChunkSize) {
        const sentences = para.split(/(?<=[.!?])\s+/);
        let sentChunk = '';
        for (const sent of sentences) {
          if (sentChunk.length + sent.length + 1 <= maxChunkSize) {
            sentChunk += (sentChunk ? ' ' : '') + sent;
          } else {
            if (sentChunk) chunks.push(sentChunk);
            sentChunk = sent;
          }
        }
        if (sentChunk) currentChunk = sentChunk;
        else currentChunk = '';
      } else {
        currentChunk = para;
      }
    }
  }
  if (currentChunk) chunks.push(currentChunk);

  return chunks.filter(c => c.trim().length > 20);
}

// ── Cliente Freshdesk ──────────────────────────────────────────────────────

class FreshdeskClient {
  private baseUrl: string;
  private authHeader: string;

  constructor(domain: string, apiKey: string) {
    // Normalizar domínio
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    this.baseUrl = `https://${cleanDomain}`;
    // Autenticação básica: API_KEY:X (o Freshdesk aceita qualquer senha)
    this.authHeader = 'Basic ' + btoa(`${apiKey}:X`);
  }

  async get<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      headers: {
        'Authorization': this.authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Freshdesk API error ${res.status} on ${path}: ${body.slice(0, 200)}`);
    }

    return res.json() as Promise<T>;
  }

  async getAllCategories(): Promise<FdCategory[]> {
    const data = await this.get<Array<{ category: FdCategory }>>('/solution/categories.json');
    return data.map(d => d.category);
  }

  async getCategoryWithFolders(categoryId: number): Promise<FdCategory> {
    const data = await this.get<{ category: FdCategory }>(`/solution/categories/${categoryId}.json`);
    return data.category;
  }

  async getFolderWithArticles(categoryId: number, folderId: number): Promise<FdFolder> {
    const data = await this.get<{ folder: FdFolder }>(`/solution/categories/${categoryId}/folders/${folderId}.json`);
    return data.folder;
  }

  async getArticle(categoryId: number, folderId: number, articleId: number): Promise<FdArticle> {
    const data = await this.get<{ article: FdArticle }>(`/solution/categories/${categoryId}/folders/${folderId}/articles/${articleId}.json`);
    return data.article;
  }
}

// ── Supabase REST ──────────────────────────────────────────────────────────

class SupabaseClient {
  private url: string;
  private key: string;

  constructor(url: string, key: string) {
    this.url = url.replace(/\/$/, '');
    this.key = key;
  }

  private headers(extra?: Record<string, string>) {
    return {
      'apikey': this.key,
      'Authorization': `Bearer ${this.key}`,
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  async upsertArticle(article: FdArticle, folder: FdFolder, category: FdCategory, quality: QualityResult): Promise<void> {
    const tags = article.tags?.map(t => t.name) || [];
    const payload = {
      fd_article_id: article.id,
      fd_folder_id: article.folder_id,
      fd_category_id: category.id,
      title: article.title,
      description: article.description || '',
      desc_plain: article.desc_un_html || '',
      status: article.status,
      art_type: article.art_type,
      tags: tags,
      seo_title: article.seo_data?.meta_title || null,
      seo_description: article.seo_data?.meta_description || null,
      seo_keywords: article.seo_data?.meta_keywords || null,
      hits: article.hits || 0,
      thumbs_up: article.thumbs_up || 0,
      thumbs_down: article.thumbs_down || 0,
      folder_name: folder.name,
      category_name: category.name,
      fd_created_at: article.created_at,
      fd_updated_at: article.updated_at || article.modified_at,
      synced_at: new Date().toISOString(),
      quality_score: quality.score,
      quality_flags: quality.flags,
      quality_notes: quality.issues.join('; ') || null,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    const res = await fetch(`${this.url}/rest/v1/freshdesk_articles`, {
      method: 'POST',
      headers: this.headers({ 'Prefer': 'resolution=merge-duplicates,return=representation' }),
      body: JSON.stringify([payload]),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Supabase upsert error: ${body.slice(0, 300)}`);
    }
  }

  async upsertKnowledgeSource(articleId: number, title: string, categoryName: string, folderName: string, articleUrl: string): Promise<string> {
    const sourceRef = `freshdesk:${articleId}`;
    const payload = {
      agent_ref: 'cida',
      source_type: 'freshdesk_article',
      title: title,
      status: 'active',
      source_url: articleUrl,
      source_ref: sourceRef,
      notes: `Categoria: ${categoryName} / Pasta: ${folderName}`,
      updated_at: new Date().toISOString(),
    };

    const res = await fetch(`${this.url}/rest/v1/agentlab_knowledge_sources?source_ref=eq.${encodeURIComponent(sourceRef)}&agent_ref=eq.cida`, {
      method: 'GET',
      headers: this.headers(),
    });

    let sourceId: string | null = null;
    if (res.ok) {
      const existing = await res.json();
      if (existing.length > 0) sourceId = existing[0].id;
    }

    if (sourceId) {
      // Atualizar
      await fetch(`${this.url}/rest/v1/agentlab_knowledge_sources?id=eq.${sourceId}`, {
        method: 'PATCH',
        headers: this.headers({ 'Prefer': 'return=minimal' }),
        body: JSON.stringify({ ...payload }),
      });
    } else {
      // Criar
      const createRes = await fetch(`${this.url}/rest/v1/agentlab_knowledge_sources`, {
        method: 'POST',
        headers: this.headers({ 'Prefer': 'return=representation' }),
        body: JSON.stringify([payload]),
      });
      if (createRes.ok) {
        const created = await createRes.json();
        sourceId = created[0]?.id || null;
      }
    }

    return sourceId || '';
  }

  async replaceKnowledgeChunks(sourceId: string, chunks: string[], articleTitle: string, categoryName: string): Promise<void> {
    if (!sourceId) return;

    // Deletar chunks antigos
    await fetch(`${this.url}/rest/v1/agentlab_knowledge_chunks?source_id=eq.${sourceId}`, {
      method: 'DELETE',
      headers: this.headers(),
    });

    if (chunks.length === 0) return;

    // Inserir novos chunks
    const chunkPayloads = chunks.map((content, idx) => ({
      source_id: sourceId,
      agent_ref: 'cida',
      chunk_index: idx,
      content: `[${categoryName}] ${articleTitle}\n\n${content}`,
      token_count: Math.ceil(content.length / 4),
      metadata: { article_title: articleTitle, category: categoryName, chunk_index: idx },
    }));

    const res = await fetch(`${this.url}/rest/v1/agentlab_knowledge_chunks`, {
      method: 'POST',
      headers: this.headers({ 'Prefer': 'return=minimal' }),
      body: JSON.stringify(chunkPayloads),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[chunks] insert error: ${body.slice(0, 200)}`);
    }
  }

  async createSyncRun(): Promise<string> {
    const res = await fetch(`${this.url}/rest/v1/freshdesk_sync_runs`, {
      method: 'POST',
      headers: this.headers({ 'Prefer': 'return=representation' }),
      body: JSON.stringify([{ status: 'running', started_at: new Date().toISOString() }]),
    });
    const data = await res.json();
    return data[0]?.id || '';
  }

  async finishSyncRun(runId: string, stats: Record<string, unknown>): Promise<void> {
    await fetch(`${this.url}/rest/v1/freshdesk_sync_runs?id=eq.${runId}`, {
      method: 'PATCH',
      headers: this.headers({ 'Prefer': 'return=minimal' }),
      body: JSON.stringify({
        status: 'completed',
        finished_at: new Date().toISOString(),
        ...stats,
      }),
    });
  }

  async failSyncRun(runId: string, error: string): Promise<void> {
    await fetch(`${this.url}/rest/v1/freshdesk_sync_runs?id=eq.${runId}`, {
      method: 'PATCH',
      headers: this.headers({ 'Prefer': 'return=minimal' }),
      body: JSON.stringify({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error_message: error,
      }),
    });
  }

  async getLastSyncRun(): Promise<Record<string, unknown> | null> {
    const res = await fetch(`${this.url}/rest/v1/freshdesk_sync_runs?order=started_at.desc&limit=1`, {
      headers: this.headers(),
    });
    if (res.ok) {
      const data = await res.json();
      return data[0] || null;
    }
    return null;
  }

  async getQualityReport(): Promise<Record<string, unknown>> {
    const res = await fetch(
      `${this.url}/rest/v1/freshdesk_articles?select=id,fd_article_id,title,quality_score,quality_notes,status,category_name,folder_name&order=quality_score.asc&limit=100`,
      { headers: this.headers() }
    );
    const articles = res.ok ? await res.json() : [];

    const total = articles.length;
    const highQuality = articles.filter((a: Record<string, unknown>) => (a.quality_score as number) >= 75).length;
    const mediumQuality = articles.filter((a: Record<string, unknown>) => (a.quality_score as number) >= 45 && (a.quality_score as number) < 75).length;
    const lowQuality = articles.filter((a: Record<string, unknown>) => (a.quality_score as number) < 45).length;
    const avgScore = total > 0 ? Math.round(articles.reduce((s: number, a: Record<string, unknown>) => s + (a.quality_score as number), 0) / total) : 0;

    return {
      total,
      high_quality: highQuality,
      medium_quality: mediumQuality,
      low_quality: lowQuality,
      avg_score: avgScore,
      issues: articles
        .filter((a: Record<string, unknown>) => (a.quality_score as number) < 75 && a.quality_notes)
        .slice(0, 20)
        .map((a: Record<string, unknown>) => ({
          id: a.fd_article_id,
          title: a.title,
          score: a.quality_score,
          category: a.category_name,
          issues: a.quality_notes,
        })),
    };
  }
}

// ── Sincronização Principal ────────────────────────────────────────────────

async function runSync(fd: FreshdeskClient, sb: SupabaseClient, fdDomain: string): Promise<Record<string, unknown>> {
  const runId = await sb.createSyncRun();
  const stats = {
    articles_found: 0,
    articles_created: 0,
    articles_updated: 0,
    articles_skipped: 0,
    quality_issues: 0,
    summary: {} as Record<string, unknown>,
  };

  try {
    console.log('[sync] Fetching categories...');
    const categories = await fd.getAllCategories();
    console.log(`[sync] Found ${categories.length} categories`);

    const qualityReport: Array<Record<string, unknown>> = [];

    for (const category of categories) {
      console.log(`[sync] Processing category: ${category.name} (id=${category.id})`);

      // Buscar pastas da categoria
      let categoryWithFolders: FdCategory;
      try {
        categoryWithFolders = await fd.getCategoryWithFolders(category.id);
      } catch (e) {
        console.error(`[sync] Error fetching category ${category.id}:`, e);
        continue;
      }

      const folders = categoryWithFolders.folders || [];
      console.log(`[sync]   ${folders.length} folders in category`);

      for (const folder of folders) {
        console.log(`[sync]   Processing folder: ${folder.name} (id=${folder.id})`);

        // Buscar artigos da pasta
        let folderWithArticles: FdFolder;
        try {
          folderWithArticles = await fd.getFolderWithArticles(category.id, folder.id);
        } catch (e) {
          console.error(`[sync]   Error fetching folder ${folder.id}:`, e);
          continue;
        }

        const articles = folderWithArticles.articles || [];
        console.log(`[sync]   ${articles.length} articles in folder`);
        stats.articles_found += articles.length;

        for (const articleSummary of articles) {
          try {
            // Buscar artigo completo com tags e SEO
            let article: FdArticle;
            try {
              article = await fd.getArticle(category.id, folder.id, articleSummary.id);
            } catch (_e) {
              // Fallback: usar o resumo da pasta
              article = articleSummary;
            }

            // Avaliar qualidade
            const quality = evaluateArticleQuality(article, folder.name, category.name);

            if (quality.issues.length > 0) {
              stats.quality_issues++;
              qualityReport.push({
                id: article.id,
                title: article.title,
                score: quality.score,
                confidence: quality.confidence,
                issues: quality.issues,
                category: category.name,
                folder: folder.name,
              });
            }

            // Salvar no Supabase
            await sb.upsertArticle(article, folder, category, quality);

            // Indexar para RAG (apenas artigos publicados com conteúdo)
            if (article.status === 2 && article.desc_un_html && article.desc_un_html.trim().length > 50) {
              const articleUrl = `https://${fdDomain.replace(/^https?:\/\//, '')}/solution/articles/${article.id}`;
              const sourceId = await sb.upsertKnowledgeSource(
                article.id,
                article.title,
                category.name,
                folder.name,
                articleUrl
              );

              if (sourceId) {
                const chunks = chunkText(article.desc_un_html || '');
                await sb.replaceKnowledgeChunks(sourceId, chunks, article.title, category.name);
                console.log(`[sync]     ✓ Indexed article ${article.id}: "${article.title}" (${chunks.length} chunks, quality=${quality.score})`);
              }
            } else {
              console.log(`[sync]     ⚠ Skipped indexing article ${article.id}: "${article.title}" (status=${article.status}, quality=${quality.score})`);
              stats.articles_skipped++;
            }

            stats.articles_created++;

            // Rate limit: pequena pausa para não sobrecarregar a API
            await new Promise(r => setTimeout(r, 150));

          } catch (e) {
            console.error(`[sync]   Error processing article ${articleSummary.id}:`, e);
            stats.articles_skipped++;
          }
        }
      }
    }

    stats.summary = {
      quality_report: qualityReport.slice(0, 50),
      categories_processed: categories.length,
    };

    await sb.finishSyncRun(runId, stats);
    console.log('[sync] Completed:', stats);
    return { success: true, run_id: runId, ...stats };

  } catch (e) {
    const errorMsg = String(e);
    console.error('[sync] Fatal error:', errorMsg);
    await sb.failSyncRun(runId, errorMsg);
    throw e;
  }
}

// ── Handler Principal ──────────────────────────────────────────────────────

serve(async (req) => {
  const url = new URL(req.url);
  const mode = url.searchParams.get('mode') || 'sync';

  // Variáveis de ambiente
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const FRESHDESK_DOMAIN = Deno.env.get('FRESHDESK_DOMAIN') || 'hmdesk.freshdesk.com';
  const FRESHDESK_API_KEY = Deno.env.get('FRESHDESK_API_KEY') || '';
  const FRESHDESK_BASIC_TOKEN = Deno.env.get('FRESHDESK_BASIC_TOKEN') || '';

  // Suporta autenticação via token básico OU via API key
  const effectiveApiKey = FRESHDESK_API_KEY || (
    FRESHDESK_BASIC_TOKEN
      ? atob(FRESHDESK_BASIC_TOKEN).split(':')[0]
      : ''
  );

  if (!effectiveApiKey) {
    return new Response(JSON.stringify({ error: 'FRESHDESK_API_KEY ou FRESHDESK_BASIC_TOKEN não configurado' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const fd = new FreshdeskClient(FRESHDESK_DOMAIN, effectiveApiKey);
  const sb = new SupabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    if (mode === 'status') {
      // Retornar status da última sincronização
      const lastRun = await sb.getLastSyncRun();
      const qualityReport = await sb.getQualityReport();
      return new Response(JSON.stringify({ last_run: lastRun, quality: qualityReport }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (mode === 'validate') {
      // Apenas retornar relatório de qualidade dos artigos já sincronizados
      const qualityReport = await sb.getQualityReport();
      return new Response(JSON.stringify({ quality: qualityReport }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Modo padrão: sincronização completa
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Use POST para sincronizar' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await runSync(fd, sb, FRESHDESK_DOMAIN);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (e) {
    console.error('[freshdesk-kb-sync] Error:', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
