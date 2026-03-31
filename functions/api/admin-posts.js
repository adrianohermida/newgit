import { requireAdminAccess } from "../lib/admin-auth.js";
import {
  createBlogPostForAdmin,
  getBlogPostForAdmin,
  listBlogPostsForAdmin,
  updateBlogPostForAdmin,
} from "../lib/blog-admin.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizePayload(body, profile, isUpdate = false) {
  const title = String(body.title || "").trim();
  const slug = slugify(body.slug || body.title || "");
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
  if (status && !allowedStatus.includes(status)) {
    return { error: "Status invalido. Use draft, published ou archived." };
  }

  const payload = {
    updated_at: new Date().toISOString(),
  };

  if (title) payload.title = title;
  if (slug) payload.slug = slug;
  if (excerpt) payload.excerpt = excerpt;
  if (content) payload.content = content;
  if (body.cover_image_url !== undefined) payload.cover_image_url = coverImageUrl;
  if (body.category !== undefined) payload.category = category;
  if (body.status !== undefined || !isUpdate) payload.status = status;
  if (body.seo_title !== undefined || !isUpdate) payload.seo_title = seoTitle;
  if (body.seo_description !== undefined || !isUpdate) payload.seo_description = seoDescription;

  if (!isUpdate) {
    payload.author_id = profile.id;
    payload.created_at = new Date().toISOString();
    if (status === "published") {
      payload.published_at = new Date().toISOString();
    }
  } else if (body.status === "published" && !body.published_at) {
    payload.published_at = new Date().toISOString();
  }

  return { payload };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await requireAdminAccess(request, env);

  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: auth.error }), {
      status: auth.status,
      headers: JSON_HEADERS,
    });
  }

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (id) {
      const item = await getBlogPostForAdmin(env, id);
      return new Response(JSON.stringify({ ok: true, item }), {
        status: item ? 200 : 404,
        headers: JSON_HEADERS,
      });
    }

    const status = url.searchParams.get("status") || undefined;
    const limit = Number(url.searchParams.get("limit") || "50");
    const items = await listBlogPostsForAdmin(env, { status, limit });
    return new Response(JSON.stringify({ ok: true, items }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message || "Falha ao carregar posts." }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await requireAdminAccess(request, env);

  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: auth.error }), {
      status: auth.status,
      headers: JSON_HEADERS,
    });
  }

  try {
    const body = await request.json();
    const { payload, error } = normalizePayload(body, auth.profile, false);

    if (error) {
      return new Response(JSON.stringify({ ok: false, error }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const item = await createBlogPostForAdmin(env, payload);
    return new Response(JSON.stringify({ ok: true, item }), {
      status: 201,
      headers: JSON_HEADERS,
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message || "Falha ao criar post." }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
}

export async function onRequestPatch(context) {
  const { request, env } = context;
  const auth = await requireAdminAccess(request, env);

  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: auth.error }), {
      status: auth.status,
      headers: JSON_HEADERS,
    });
  }

  try {
    const body = await request.json();
    const id = String(body.id || "").trim();
    if (!id) {
      return new Response(JSON.stringify({ ok: false, error: "Informe o id do post para atualizar." }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const { payload, error } = normalizePayload(body, auth.profile, true);
    if (error) {
      return new Response(JSON.stringify({ ok: false, error }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const item = await updateBlogPostForAdmin(env, id, payload);
    return new Response(JSON.stringify({ ok: true, item }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message || "Falha ao atualizar post." }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
}
