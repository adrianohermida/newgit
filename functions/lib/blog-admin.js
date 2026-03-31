import { fetchSupabaseAdmin } from "./supabase-rest.js";

const BLOG_SELECT =
  "id,slug,title,excerpt,content,cover_image_url,category,status,seo_title,seo_description,author_id,published_at,created_at,updated_at";

export async function listBlogPostsForAdmin(env, options = {}) {
  const params = new URLSearchParams();
  params.set("select", BLOG_SELECT);
  params.set("order", "updated_at.desc.nullslast,created_at.desc");
  params.set("limit", String(Math.min(Number(options.limit || 50), 100)));

  if (options.status) {
    params.set("status", `eq.${options.status}`);
  }

  return fetchSupabaseAdmin(env, `blog_posts?${params.toString()}`);
}

export async function getBlogPostForAdmin(env, id) {
  const params = new URLSearchParams();
  params.set("select", BLOG_SELECT);
  params.set("id", `eq.${id}`);
  params.set("limit", "1");

  const rows = await fetchSupabaseAdmin(env, `blog_posts?${params.toString()}`);
  return Array.isArray(rows) ? rows[0] || null : null;
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

  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function updateBlogPostForAdmin(env, id, payload) {
  const rows = await fetchSupabaseAdmin(env, `blog_posts?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });

  return Array.isArray(rows) ? rows[0] || null : null;
}
