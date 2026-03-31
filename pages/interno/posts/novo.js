import { useRouter } from "next/router";
import { useState } from "react";
import InternoLayout from "../../../components/interno/InternoLayout";
import PostEditorForm from "../../../components/interno/PostEditorForm";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import { adminFetch } from "../../../lib/admin/api";

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
      router.replace(`/interno/posts/editar?id=${payload.item.id}`);
    } catch (error) {
      setState({ saving: false, error: error.message });
    }
  }

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
