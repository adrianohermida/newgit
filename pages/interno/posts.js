import Link from "next/link";
import { useEffect, useState } from "react";
import InternoLayout from "../../components/interno/InternoLayout";
import RequireAdmin from "../../components/interno/RequireAdmin";
import { adminFetch } from "../../lib/admin/api";
import { appendActivityLog, setModuleHistory } from "../../lib/admin/activity-log";
import { buildModuleSnapshot } from "../../lib/admin/module-registry";

export default function InternoPostsPage() {
  const [state, setState] = useState({ loading: true, error: null, items: [] });

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="Posts"
      description="Área editorial para produzir, revisar e publicar conteúdo com mais consistência."
        >
          <PostsContent state={state} setState={setState} />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

function PostsContent({ state, setState }) {
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const payload = await adminFetch("/api/admin-posts?limit=100");
        if (!cancelled) {
          appendActivityLog({
            label: "Leitura do modulo de posts",
            action: "posts_load",
            method: "UI",
            module: "posts",
            page: "/interno/posts",
            status: "success",
            response: `Posts carregados: ${payload.items?.length || 0}.`,
            tags: ["posts", "manual", "conteudo"],
          });
          setState({ loading: false, error: null, items: payload.items || [] });
        }
      } catch (error) {
        if (!cancelled) {
          appendActivityLog({
            label: "Falha ao carregar posts",
            action: "posts_load",
            method: "UI",
            module: "posts",
            page: "/interno/posts",
            status: "error",
            error: error.message || "Falha ao carregar posts.",
            tags: ["posts", "manual", "conteudo"],
          });
          setState({ loading: false, error: error.message, items: [] });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [setState]);

  useEffect(() => {
    setModuleHistory(
      "posts",
      buildModuleSnapshot("posts", {
        routePath: "/interno/posts",
        loading: state.loading,
        error: state.error,
        total: state.items.length,
        drafts: state.items.filter((item) => String(item.status || "").toLowerCase().includes("draft")).length,
        published: state.items.filter((item) => String(item.status || "").toLowerCase().includes("publish")).length,
        recentItems: state.items.slice(0, 8).map((item) => ({
          id: item.id,
          title: item.title,
          status: item.status,
          slug: item.slug,
        })),
        coverage: {
          routeTracked: true,
          consoleIntegrated: true,
        },
      }),
    );
  }, [state]);

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-6">
        <Link href="/interno/posts/novo" className="bg-[#C5A059] px-5 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-[#050706]">
          Novo post
        </Link>
      </div>

      {state.loading ? (
        <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">Carregando posts...</div>
      ) : null}

      {!state.loading && state.error ? (
        <div className="border border-[#7f1d1d] bg-[rgba(127,29,29,0.22)] p-6 text-sm">{state.error}</div>
      ) : null}

      {!state.loading && !state.error && !state.items.length ? (
        <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6 text-sm opacity-70">
          Nenhum post encontrado. Crie o primeiro rascunho pelo painel.
        </div>
      ) : null}

      {!state.loading && !state.error ? (
        <div className="space-y-4">
          {state.items.map((post) => (
            <article key={post.id} className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-5">
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <span className="text-[10px] font-semibold tracking-[0.2em]" style={{ color: "#C5A059" }}>
                  {post.category || "SEM CATEGORIA"}
                </span>
                <span className="text-[10px] uppercase tracking-[0.15em] opacity-40">{post.status}</span>
              </div>
              <h3 className="font-serif text-2xl mb-2">{post.title}</h3>
              <p className="text-sm opacity-65 leading-relaxed mb-4">{post.excerpt}</p>
              <div className="flex flex-wrap gap-3 text-xs opacity-45 mb-4">
                <span>slug: {post.slug}</span>
                <span>atualizado: {post.updated_at}</span>
              </div>
              <Link
                href={`/interno/posts/editar?id=${post.id}`}
                className="inline-flex border border-[#2D2E2E] px-4 py-2 text-sm hover:border-[#C5A059] hover:text-[#C5A059]"
              >
                Editar post
              </Link>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
