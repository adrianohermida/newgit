import { useInternalTheme } from "../../../components/interno/InternalThemeProvider";
import {
  ProcessosRegisteredRelationsPanel,
  ProcessosRelationFormPanel,
  ProcessosRelationLookupPanel,
  ProcessosSuggestionsPanel,
} from "./ProcessosRelationPanels";

export default function ProcessosRelacoesView(props) {
  const { isLightTheme } = useInternalTheme();
  return <div className="space-y-6" id="relacoes"><div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]"><ProcessosRelationFormPanel {...props} isLightTheme={isLightTheme} /><ProcessosRelationLookupPanel {...props} isLightTheme={isLightTheme} /></div><ProcessosSuggestionsPanel {...props} isLightTheme={isLightTheme} /><ProcessosRegisteredRelationsPanel {...props} isLightTheme={isLightTheme} /></div>;
}
