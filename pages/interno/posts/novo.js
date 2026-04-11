import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import InternoLayout from "../../../components/interno/InternoLayout";
import PostEditorForm from "../../../components/interno/PostEditorForm";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import { adminFetch } from "../../../lib/admin/api";
import { appendActivityLog, setModuleHistory } from "../../../lib/admin/activity-log";
import { buildModuleSnapshot } from "../../../lib/admin/module-registry";

export default function NovoPostPage() {
  const router = useRouter();
  const [state, setState] = useState({ saving: false, error: null });

  async function handleSubmit(form) {
    setState({ saving: true, error: null });
    try {
      const payload = await adminFetch("/api/admin-posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });
      appendActivityLog({
        label: "Novo post criado",
        action: "post_create",
        method: "UI",
        module: "posts",
        page: "/interno/posts/novo",
        status: "success",
        response: `Post ${payload.item?.id || "n/d"} criado com slug ${payload.item?.slug || "n/d"}.`,
        tags: ["posts", "manual", "conteudo"],
      });
      router.replace(`/interno/posts/editar?id=${payload.item.id}`);
    } catch (error) {
      appendActivityLog({
        label: "Falha ao criar post",
        action: "post_create",
        method: "UI",
        module: "posts",
        page: "/interno/posts/novo",
        status: "error",
        error: error.message || "Falha ao criar post.",
        tags: ["posts", "manual", "conteudo"],
      });
      setState({ saving: false, error: error.message });
    }
  }

  useEffect(() => {
    setModuleHistory(
      "posts-novo",
      buildModuleSnapshot("posts", {
        routePath: "/interno/posts/novo",
        saving: state.saving,
        error: state.error,
        coverage: {
          routeTracked: true,
          consoleIntegrated: true,
          actionsTracked: true,
        },
      }),
    );
  }, [state.error, state.saving]);

  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="Novo post"
          description="Criacao inicial de artigo do blog com persistencia no Supabase."
        >
          {state.error ? (
            <div className="mb-6 border border-[#7f1d1d] bg-[rgba(127,29,29,0.22)] p-4 text-sm">{state.error}</div>
          ) : null}
          <PostEditorForm onSubmit={handleSubmit} submitLabel="Criar post" loading={state.saving} />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}
