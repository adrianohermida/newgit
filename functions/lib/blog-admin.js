import { fetchSupabaseAdmin } from "./supabase-rest.js";

const BLOG_POSTS_SELECT =
  "id,title,slug,excerpt,content,cover_image_url,category,status,seo_title,seo_description,published_at,author_id,created_at,updated_at";

function encodeValue(value) {
  return encodeURIComponent(value);
}

function mapRowToEditor(row) {
  return {
    id: row.id,
    title: row.title || "",
    slug: row.slug || "",
    excerpt: row.excerpt || "",
    content: row.content || "",
    cover_image_url: row.cover_image_url || "",
    category: row.category || "",
    status: row.status || "draft",
    seo_title: row.seo_title || row.title || "",
    seo_description: row.seo_description || row.excerpt || "",
    published_at: row.published_at || null,
    updated_at: row.updated_at || row.created_at || null,
  };
}

export function normalizeBlogPostPayload(body, profile, isUpdate = false) {
  const title = String(body.title || "").trim();
  const slug = String(body.slug || "").trim();
  const excerpt = String(body.excerpt || "").trim();
  const content = String(body.content || "").trim();
  const status = String(body.status || "draft").trim();
  const category = String(body.category || "").trim() || null;
  const coverImageUrl = String(body.cover_image_url || "").trim() || null;
  const seoTitle = String(body.seo_title || title).trim() || null;
  const seoDescription = String(body.seo_description || excerpt).trim() || null;

  if (!isUpdate && (!title || !slug || !excerpt || !content)) {
    return { error: "Preencha titulo, slug, resumo e conteudo para salvar o post." };
  }

  const allowedStatus = ["draft", "published", "archived"];
  if (!allowedStatus.includes(status)) {
    return { error: "Status invalido. Use draft, published ou archived." };
  }

  const payload = {
    updated_at: new Date().toISOString(),
    category,
    seo_title: seoTitle,
    seo_description: seoDescription,
  };

  if (title) payload.title = title;
  if (slug) payload.slug = slug;
  if (excerpt) payload.excerpt = excerpt;
  if (content) payload.content = content;
  if (body.cover_image_url !== undefined) payload.cover_image_url = coverImageUrl;
  if (body.status !== undefined || !isUpdate) payload.status = status;

  if (!isUpdate) {
    payload.created_at = new Date().toISOString();
    if (status === "published") {
      payload.published_at = new Date().toISOString();
    }
  } else if (body.status === "published" && !body.published_at) {
    payload.published_at = new Date().toISOString();
  }

  return { payload };
}

export async function listBlogPostsForAdmin(env, filters = {}) {
  const params = new URLSearchParams();
  params.set("select", BLOG_POSTS_SELECT);
  params.set("order", "updated_at.desc,created_at.desc");

  if (filters.status) {
    params.set("status", `eq.${filters.status}`);
  }

  if (filters.limit) {
    params.set("limit", String(filters.limit));
  }

  const rows = await fetchSupabaseAdmin(env, `blog_posts?${params.toString()}`);
  return Array.isArray(rows) ? rows.map(mapRowToEditor) : [];
}

export async function getBlogPostForAdmin(env, id) {
  const rows = await fetchSupabaseAdmin(
    env,
    `blog_posts?select=${encodeURIComponent(BLOG_POSTS_SELECT)}&id=eq.${encodeValue(id)}&limit=1`
  );

  return Array.isArray(rows) && rows[0] ? mapRowToEditor(rows[0]) : null;
}

export async function createBlogPostForAdmin(env, payload) {
  const rows = await fetchSupabaseAdmin(env, "blog_posts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });

  return Array.isArray(rows) && rows[0] ? mapRowToEditor(rows[0]) : null;
}

export async function updateBlogPostForAdmin(env, id, payload) {
  const rows = await fetchSupabaseAdmin(env, `blog_posts?id=eq.${encodeValue(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });

  return Array.isArray(rows) && rows[0] ? mapRowToEditor(rows[0]) : null;
}
