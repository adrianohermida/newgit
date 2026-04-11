import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import InternoLayout from "../../../components/interno/InternoLayout";
import PostEditorForm from "../../../components/interno/PostEditorForm";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import { adminFetch } from "../../../lib/admin/api";
import { appendActivityLog, setModuleHistory } from "../../../lib/admin/activity-log";
import { buildModuleSnapshot } from "../../../lib/admin/module-registry";

export default function EditarPostPage() {
  const router = useRouter();
  const [state, setState] = useState({
    loading: true,
    saving: false,
    error: null,
    item: null,
  });

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    const { id } = router.query;
    if (!id || typeof id !== "string") {
      setState({ loading: false, saving: false, error: "Informe o id do post para editar.", item: null });
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const payload = await adminFetch(`/api/admin-posts?id=${encodeURIComponent(id)}`);
        if (!cancelled) {
          appendActivityLog({
            label: "Leitura de post para edicao",
            action: "post_edit_load",
            method: "UI",
            module: "posts",
            page: "/interno/posts/editar",
            status: "success",
            response: `Post ${id} carregado para edicao.`,
            tags: ["posts", "manual", "conteudo"],
          });
          setState({ loading: false, saving: false, error: null, item: payload.item });
        }
      } catch (error) {
        if (!cancelled) {
          appendActivityLog({
            label: "Falha ao carregar post para edicao",
            action: "post_edit_load",
            method: "UI",
            module: "posts",
            page: "/interno/posts/editar",
            status: "error",
            error: error.message || "Falha ao carregar post.",
            tags: ["posts", "manual", "conteudo"],
          });
          setState({ loading: false, saving: false, error: error.message, item: null });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit(form) {
    setState((current) => ({ ...current, saving: true, error: null }));
    try {
      const payload = await adminFetch("/api/admin-posts", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: state.item.id,
          ...form,
        }),
      });

      appendActivityLog({
        label: "Post atualizado",
        action: "post_update",
        method: "UI",
        module: "posts",
        page: "/interno/posts/editar",
        status: "success",
        response: `Post ${state.item.id} salvo com status ${payload.item?.status || "n/d"}.`,
        tags: ["posts", "manual", "conteudo"],
      });
      setState({ loading: false, saving: false, error: null, item: payload.item });
    } catch (error) {
      appendActivityLog({
        label: "Falha ao atualizar post",
        action: "post_update",
        method: "UI",
        module: "posts",
        page: "/interno/posts/editar",
        status: "error",
        error: error.message || "Falha ao atualizar post.",
        tags: ["posts", "manual", "conteudo"],
      });
      setState((current) => ({ ...current, saving: false, error: error.message }));
    }
  }

  useEffect(() => {
    setModuleHistory(
      "posts-editar",
      buildModuleSnapshot("posts", {
        routePath: "/interno/posts/editar",
        loading: state.loading,
        saving: state.saving,
        error: state.error,
        itemId: state.item?.id || null,
        title: state.item?.title || null,
        slug: state.item?.slug || null,
        status: state.item?.status || null,
        coverage: {
          routeTracked: true,
          consoleIntegrated: true,
          actionsTracked: true,
        },
      }),
    );
  }, [state]);

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="Editar post"
          description="Edicao administrativa do conteudo do blog com persistencia no Supabase."
        >
          {state.loading ? <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">Carregando post...</div> : null}
          {!state.loading && state.error ? (
            <div className="border border-[#7f1d1d] bg-[rgba(127,29,29,0.22)] p-6 text-sm">{state.error}</div>
          ) : null}
          {!state.loading && state.item ? (
            <>
              <div className="mb-6 text-sm opacity-55">ID: {state.item.id}</div>
              <PostEditorForm
                initialValues={state.item}
                onSubmit={handleSubmit}
                submitLabel="Salvar alteracoes"
                loading={state.saving}
              />
            </>
          ) : null}
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}
