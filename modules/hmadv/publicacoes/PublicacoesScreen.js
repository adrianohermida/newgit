import React from "react";

import { useInternalTheme } from "../../../components/interno/InternalThemeProvider";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import { ACTION_LABELS } from "./constants";
import { buildJobPreview } from "./action-utils";
import { usePublicacoesAdminFetch } from "./usePublicacoesAdminFetch";
import { usePublicacoesCoreState } from "./usePublicacoesCoreState";
import { usePublicacoesQueueState } from "./usePublicacoesQueueState";
import { usePublicacoesDetailState } from "./usePublicacoesDetailState";
import { formatDateTimeLabel, formatFallbackReason, formatSnapshotLabel, formatValidationMeta, getPublicacaoSelectionValue, isResourceLimitError as detectResourceLimitError, validationLabel, validationTone } from "./publicacoesFormatting";
import { usePublicacoesActivityLog } from "./usePublicacoesActivityLog";
import { PublicacoesScreenBody } from "./PublicacoesScreenBody";
import { usePublicacoesScreenRuntime } from "./usePublicacoesScreenRuntime";

function PublicacoesContent() {
  const { isLightTheme } = useInternalTheme();
  const { logUiEvent } = usePublicacoesActivityLog();
  const core = usePublicacoesCoreState();
  const queue = usePublicacoesQueueState();
  const detail = usePublicacoesDetailState();
  const adminFetch = usePublicacoesAdminFetch();
  const screenBodyProps = usePublicacoesScreenRuntime({
    ...core,
    ...queue,
    ...detail,
    ACTION_LABELS,
    adminFetch,
    buildJobPreview,
    formatDateTimeLabel,
    formatFallbackReason,
    formatSnapshotLabel,
    formatValidationMeta,
    getPublicacaoSelectionValue,
    isLightTheme,
    isResourceLimitError: detectResourceLimitError,
    logUiEvent,
    validationLabel,
    validationTone,
  });
  return <PublicacoesScreenBody {...screenBodyProps} />;
}

export default function PublicacoesScreen() {
  return <RequireAdmin><PublicacoesContent /></RequireAdmin>;
}
