import { useState } from "react";

const INITIAL_FORM = {
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  cover_image_url: "",
  category: "",
  status: "draft",
  seo_title: "",
  seo_description: "",
};

export default function PostEditorForm({ initialValues, onSubmit, submitLabel, loading }) {
  const [form, setForm] = useState({ ...INITIAL_FORM, ...(initialValues || {}) });

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    await onSubmit(form);
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="grid gap-5 lg:grid-cols-2">
        <Field label="Titulo">
          <input
            value={form.title}
            onChange={(event) => updateField("title", event.target.value)}
            className="w-full border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
            required
          />
        </Field>

        <Field label="Slug">
          <input
            value={form.slug}
            onChange={(event) => updateField("slug", event.target.value)}
            className="w-full border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
            placeholder="gerado-do-titulo-ou-editado-manualmente"
          />
        </Field>
      </div>

      <Field label="Resumo">
        <textarea
          value={form.excerpt}
          onChange={(event) => updateField("excerpt", event.target.value)}
          className="w-full min-h-[120px] border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
          required
        />
      </Field>

      <Field label="Conteudo">
        <textarea
          value={form.content}
          onChange={(event) => updateField("content", event.target.value)}
          className="w-full min-h-[320px] border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
          required
        />
      </Field>

      <div className="grid gap-5 lg:grid-cols-3">
        <Field label="Categoria">
          <input
            value={form.category}
            onChange={(event) => updateField("category", event.target.value)}
            className="w-full border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
          />
        </Field>

        <Field label="Status">
          <select
            value={form.status}
            onChange={(event) => updateField("status", event.target.value)}
            className="w-full border border-[#2D2E2E] bg-[#050706] px-4 py-3 outline-none focus:border-[#C5A059]"
          >
            <option value="draft">draft</option>
            <option value="published">published</option>
            <option value="archived">archived</option>
          </select>
        </Field>

        <Field label="Capa">
          <input
            value={form.cover_image_url}
            onChange={(event) => updateField("cover_image_url", event.target.value)}
            className="w-full border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
            placeholder="https://..."
          />
        </Field>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Field label="SEO Title">
          <input
            value={form.seo_title}
            onChange={(event) => updateField("seo_title", event.target.value)}
            className="w-full border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
          />
        </Field>

        <Field label="SEO Description">
          <textarea
            value={form.seo_description}
            onChange={(event) => updateField("seo_description", event.target.value)}
            className="w-full min-h-[120px] border border-[#2D2E2E] bg-transparent px-4 py-3 outline-none focus:border-[#C5A059]"
          />
        </Field>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="bg-[#C5A059] px-5 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-[#050706] disabled:opacity-60"
      >
        {loading ? "Salvando..." : submitLabel}
      </button>
    </form>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block mb-2 text-xs font-semibold tracking-[0.15em] uppercase">{label}</span>
      {children}
    </label>
  );
}
