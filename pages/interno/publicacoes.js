import InternoLayout from "../../components/interno/InternoLayout";
import RequireAdmin from "../../components/interno/RequireAdmin";

export default function PublicacoesPage() {
  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="Gestão de Publicações"
          description="Módulo temporariamente estabilizado para garantir o build e o acesso ao restante do painel."
        >
          <section className="space-y-4 border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6 text-[#F4F1EA]">
            <h2 className="font-serif text-2xl">Módulo em manutenção</h2>
            <p className="text-sm leading-7 text-[#C6D1CC]">
              A tela avançada de publicações foi isolada temporariamente para estabilizar a compilação do projeto no ambiente Windows.
            </p>
            <p className="text-sm leading-7 text-[#A8B6B0]">
              As demais áreas administrativas seguem acessíveis.
            </p>
          </section>
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}
