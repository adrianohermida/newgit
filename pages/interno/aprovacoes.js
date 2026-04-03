import InternoLayout from "../../components/interno/InternoLayout";
import RequireAdmin from "../../components/interno/RequireAdmin";
import AprovacoesModule from "../../components/interno/AprovacoesModule";

export default function InternoAprovacoesPage() {
  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="Aprovacoes"
          description="Central de pedidos pendentes do portal do cliente. Aqui o escritorio valida alteracoes cadastrais hoje e passa a absorver, no mesmo fluxo, demandas futuras de financeiro e documentacoes."
        >
          <AprovacoesModule />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}
