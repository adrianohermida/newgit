import { useInternalTheme } from "../../../components/interno/InternalThemeProvider";
import ProcessosOperationDatajudPanel from "./ProcessosOperationDatajudPanel";
import ProcessosOperationQueuePanel from "./ProcessosOperationQueuePanel";

export default function ProcessosOperacaoView({
  ...props
}) {
  const { isLightTheme } = useInternalTheme();
  return <div id="operacao" className="grid flex-1 auto-rows-fr gap-6 lg:grid-cols-2"><ProcessosOperationQueuePanel {...props} isLightTheme={isLightTheme} /><ProcessosOperationDatajudPanel {...props} isLightTheme={isLightTheme} /></div>;
}
