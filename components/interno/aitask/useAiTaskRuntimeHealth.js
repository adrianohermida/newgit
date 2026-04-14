import useAiTaskProviderCatalog from "./useAiTaskProviderCatalog";
import useAiTaskRagHealth from "./useAiTaskRagHealth";

export default function useAiTaskRuntimeHealth(props) {
  const {
    fallbackProviderOptions,
    fallbackSkillOptions,
    provider,
    pushLog,
    setProvider,
  } = props;
  const providerState = useAiTaskProviderCatalog({
    fallbackProviderOptions,
    fallbackSkillOptions,
    provider,
    setProvider,
  });
  const ragState = useAiTaskRagHealth({
    localStackSummary: providerState.localStackSummary,
    pushLog,
  });

  return {
    ...providerState,
    ...ragState,
  };
}
