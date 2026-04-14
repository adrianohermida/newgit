import InternoLayout from "../../components/interno/InternoLayout";
import OptionalAdminAccess from "../../components/interno/OptionalAdminAccess";
import SetupIntegracaoScreen from "../../components/interno/integration-kit/setup/SetupIntegracaoScreen";

export default function SetupIntegracaoPage() {
  return <OptionalAdminAccess>
    {({ profile, accessMode }) => <InternoLayout
      profile={profile}
      title="Setup Inicial"
      description="Configuracao guiada para ativar integracoes e deixar o produto pronto para operar."
    >
      <SetupIntegracaoScreen accessMode={accessMode} />
    </InternoLayout>}
  </OptionalAdminAccess>;
}
