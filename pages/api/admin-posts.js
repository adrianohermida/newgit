import { fetchSupabaseAdmin, requireAdminApiAccess } from "../../lib/admin/server";

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function mapRowToEditor(row) {
  const metadata = row.metadata || {};

  return {
    id: row.id,
    title: row.titulo || "",
    slug: row.slug || "",
    excerpt: row.resumo || "",
    content: row.conteudo || "",
    cover_image_url: row.thumbnail_url || "",
    category: metadata.category || "",
    status: row.status || "draft",
    seo_title: metadata.seo_title || row.titulo || "",
    seo_description: metadata.seo_description || row.resumo || "",
    published_at: row.published_at || null,
    updated_at: row.updated_at || row.created_at || null,
  };
}

function buildPayload(body, profile, isUpdate = false) {
  const title = String(body.title || "").trim();
  const slug = slugify(body.slug || body.title || "");
  const excerpt = String(body.excerpt || "").trim();
  const content = String(body.content || "").trim();
  const coverImageUrl = String(body.cover_image_url || "").trim() || null;
  const category = String(body.category || "").trim() || null;
  const status = String(body.status || "draft").trim();
  const seoTitle = String(body.seo_title || title).trim() || null;
  const seoDescription = String(body.seo_description || excerpt).trim() || null;

  if (!isUpdate && (!title || !slug || !excerpt || !content)) {
    return { error: "Preencha titulo, slug, resumo e conteudo para salvar o post." };
  }

  if (!["draft", "published", "archived"].includes(status)) {
    return { error: "Status invalido. Use draft, published ou archived." };
  }

  const payload = {
    updated_at: new Date().toISOString(),
  };

  if (title) payload.titulo = title;
  if (slug) payload.slug = slug;
  if (excerpt) payload.resumo = excerpt;
  if (content) payload.conteudo = content;
  if (body.cover_image_url !== undefined) payload.thumbnail_url = coverImageUrl;
  if (body.status !== undefined || !isUpdate) payload.status = status;

  payload.metadata = {
    category,
    seo_title: seoTitle,
    seo_description: seoDescription,
  };

  if (!isUpdate) {
    payload.autor_email = profile.email || null;
    payload.created_at = new Date().toISOString();
    if (status === "published") {
      payload.published_at = new Date().toISOString();
    }
  } else if (body.status === "published" && !body.published_at) {
    payload.published_at = new Date().toISOString();
  }

  return { payload };
}

export default async function handler(req, res) {
  const auth = await requireAdminApiAccess(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  try {
    if (req.method === "GET") {
      const params = new URLSearchParams();
      params.set("select", "id,titulo,slug,resumo,conteudo,status,thumbnail_url,metadata,published_at,created_at,updated_at");
      params.set("order", "updated_at.desc,created_at.desc");

      if (req.query.id) {
        params.set("id", `eq.${String(req.query.id)}`);
        params.set("limit", "1");
        const rows = await fetchSupabaseAdmin(`blog_posts?${params.toString()}`);
        return res.status(rows.length ? 200 : 404).json({ ok: true, item: rows[0] ? mapRowToEditor(rows[0]) : null });
      }

      if (req.query.status) {
        params.set("status", `eq.${String(req.query.status)}`);
      }

      params.set("limit", String(req.query.limit || "100"));
      const rows = await fetchSupabaseAdmin(`blog_posts?${params.toString()}`);
      return res.status(200).json({ ok: true, items: rows.map(mapRowToEditor) });
    }

    if (req.method === "POST") {
      const { payload, error } = buildPayload(req.body || {}, auth.profile, false);
      if (error) {
        return res.status(400).json({ ok: false, error });
      }

      const rows = await fetchSupabaseAdmin("blog_posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(payload),
      });

      return res.status(201).json({ ok: true, item: rows[0] ? mapRowToEditor(rows[0]) : null });
    }

    if (req.method === "PATCH") {
      const id = String(req.body?.id || "").trim();
      if (!id) {
        return res.status(400).json({ ok: false, error: "Informe o id do post para atualizar." });
      }

      const { payload, error } = buildPayload(req.body || {}, auth.profile, true);
      if (error) {
        return res.status(400).json({ ok: false, error });
      }

      const rows = await fetchSupabaseAdmin(`blog_posts?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(payload),
      });

      return res.status(200).json({ ok: true, item: rows[0] ? mapRowToEditor(rows[0]) : null });
    }

    res.setHeader("Allow", "GET, POST, PATCH");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Falha ao carregar posts.",
    });
  }
}
