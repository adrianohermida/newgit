import LLMTestChat from "../components/LLMTestChat";
import InternoLayout from "../components/interno/InternoLayout";
import RequireAdmin from "../components/interno/RequireAdmin";

export default function LLMTestPage() {
  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="LLM Test"
          description="Ambiente de validação para comparar modelos, respostas e estabilidade da camada de IA."
        >
          <LLMTestChat />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}
