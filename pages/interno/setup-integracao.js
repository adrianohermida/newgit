import dynamic from "next/dynamic";
import InternoLayout from "../../components/interno/InternoLayout";
import OptionalAdminAccess from "../../components/interno/OptionalAdminAccess";

const SetupIntegracaoScreen = dynamic(
  () => import("../../components/interno/integration-kit/setup/SetupIntegracaoScreen"),
  { ssr: false }
);

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

// Removido getServerSideProps para permitir export estático
// export async function getServerSideProps() {
//   return { props: {} };
// }
