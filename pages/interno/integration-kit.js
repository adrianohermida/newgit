import dynamic from "next/dynamic";
import OptionalAdminAccess from "../../components/interno/OptionalAdminAccess";

const IntegrationKitScreen = dynamic(() => import("../../components/interno/integration-kit/IntegrationKitScreen"), { ssr: false });

export default function IntegrationKitPage() {
  return <OptionalAdminAccess>{({ profile, accessMode }) => <IntegrationKitScreen profile={profile} accessMode={accessMode} />}</OptionalAdminAccess>;
}
