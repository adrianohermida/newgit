import { FALLBACK_BLOG_POSTS } from "./fallback-posts";

function formatFallbackDate(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00-03:00`));
}

function mapFallbackPost(post) {
  return {
    slug: post.slug,
    category: post.category,
    date: formatFallbackDate(post.date),
    isoDate: post.date,
    title: post.title,
    excerpt: post.excerpt,
    image: post.image,
    seoTitle: post.seoTitle,
    seoDescription: post.seoDescription,
    content: post.content,
  };
}

function mapSupabasePost(post) {
  const publishedAt = post.published_at || post.created_at;
  return {
    slug: post.slug,
    category: post.category || "BLOG",
    date: publishedAt
      ? new Intl.DateTimeFormat("pt-BR", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }).format(new Date(publishedAt))
      : "",
    isoDate: publishedAt ? new Date(publishedAt).toISOString().slice(0, 10) : null,
    title: post.title,
    excerpt: post.excerpt,
    image: post.cover_image_url || null,
    seoTitle: post.seo_title || post.title,
    seoDescription: post.seo_description || post.excerpt,
    content: post.content,
  };
}

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}

async function fetchFromSupabase(path) {
  const config = getSupabaseConfig();
  if (!config) {
    return null;
  }

  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase blog fetch failed with status ${response.status}`);
  }

  return response.json();
}

export async function getPublishedBlogPosts() {
  try {
    const posts = await fetchFromSupabase(
      "blog_posts?select=slug,title,excerpt,content,cover_image_url,category,seo_title,seo_description,published_at,created_at,status&status=eq.published&order=published_at.desc.nullslast,created_at.desc"
    );

    if (Array.isArray(posts) && posts.length > 0) {
      return posts.map(mapSupabasePost);
    }
  } catch (error) {
    console.warn("[blog] fallback local acionado na listagem:", error.message);
  }

  return FALLBACK_BLOG_POSTS.map(mapFallbackPost);
}

export async function getPublishedBlogPostBySlug(slug) {
  try {
    const posts = await fetchFromSupabase(
      `blog_posts?select=slug,title,excerpt,content,cover_image_url,category,seo_title,seo_description,published_at,created_at,status&slug=eq.${encodeURIComponent(
        slug
      )}&status=eq.published&limit=1`
    );

    if (Array.isArray(posts) && posts[0]) {
      return mapSupabasePost(posts[0]);
    }
  } catch (error) {
    console.warn("[blog] fallback local acionado no detalhe:", error.message);
  }

  const fallback = FALLBACK_BLOG_POSTS.find((post) => post.slug === slug);
  return fallback ? mapFallbackPost(fallback) : null;
}

export function getFallbackBlogHighlights(limit = 3) {
  return FALLBACK_BLOG_POSTS.slice(0, limit).map(mapFallbackPost);
}
