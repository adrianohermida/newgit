import { fetchSupabaseAdmin } from "./supabase-rest.js";

const BLOG_POSTS_SELECT =
  "id,slug,title,excerpt,content,cover_image_url,category,status,seo_title,seo_description,published_at,author_id,created_at,updated_at";

function encodeValue(value) {
  return encodeURIComponent(value);
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

  return fetchSupabaseAdmin(env, `blog_posts?${params.toString()}`);
}

export async function getBlogPostForAdmin(env, id) {
  const rows = await fetchSupabaseAdmin(
    env,
    `blog_posts?select=${encodeURIComponent(BLOG_POSTS_SELECT)}&id=eq.${encodeValue(id)}&limit=1`
  );

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
  const rows = await fetchSupabaseAdmin(env, `blog_posts?id=eq.${encodeValue(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });

  return Array.isArray(rows) ? rows[0] || null : null;
}
