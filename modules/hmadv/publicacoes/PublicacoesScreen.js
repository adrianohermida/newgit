import React from "react";

import InternoLayout from "../../../components/interno/InternoLayout";
import { useInternalTheme } from "../../../components/interno/InternalThemeProvider";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import { ACTION_LABELS } from "./constants";
import { buildJobPreview } from "./action-utils";
import { usePublicacoesActivityLog } from "./usePublicacoesActivityLog";
import { usePublicacoesAdminFetch } from "./usePublicacoesAdminFetch";
import { usePublicacoesCoreState } from "./usePublicacoesCoreState";
import { usePublicacoesDetailState } from "./usePublicacoesDetailState";
import { formatDateTimeLabel, formatFallbackReason, formatSnapshotLabel, formatValidationMeta, getPublicacaoSelectionValue, isResourceLimitError as detectResourceLimitError, validationLabel, validationTone } from "./publicacoesFormatting";
import { usePublicacoesQueueState } from "./usePublicacoesQueueState";
import { PublicacoesScreenBody } from "./PublicacoesScreenBody";
import { usePublicacoesScreenRuntime } from "./usePublicacoesScreenRuntime";

export function PublicacoesContent() {
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
  return <RequireAdmin>{(profile) => <InternoLayout profile={profile} title="Gestao de Publicacoes" description="Triagem operacional para criar processos, drenar filas e fechar pendencias reais."><PublicacoesContent /></InternoLayout>}</RequireAdmin>;
}
