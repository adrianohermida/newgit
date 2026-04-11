import { requireAdminAccess } from "../lib/admin-auth.js";
import {
  createBlogPostForAdmin,
  getBlogPostForAdmin,
  listBlogPostsForAdmin,
  normalizeBlogPostPayload,
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
  return normalizeBlogPostPayload(
    {
      ...body,
      title,
      slug,
    },
    profile,
    isUpdate
  );
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
