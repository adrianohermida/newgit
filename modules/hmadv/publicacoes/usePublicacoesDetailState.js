import { useState } from "react";

export function usePublicacoesDetailState() {
  const [detailState, setDetailState] = useState({ loading: false, error: null, row: null, data: null });
  const [detailEditForm, setDetailEditForm] = useState({ name: "", email: "", phone: "", note: "" });
  const [detailLinkType, setDetailLinkType] = useState("Cliente");
  const [selectedDetailPendingPartes, setSelectedDetailPendingPartes] = useState([]);
  const [selectedDetailLinkedPartes, setSelectedDetailLinkedPartes] = useState([]);
  const [bulkValidationStatus, setBulkValidationStatus] = useState("validado");
  const [bulkValidationNote, setBulkValidationNote] = useState("");

  return {
    bulkValidationNote,
    bulkValidationStatus,
    detailEditForm,
    detailLinkType,
    detailState,
    selectedDetailLinkedPartes,
    selectedDetailPendingPartes,
    setBulkValidationNote,
    setBulkValidationStatus,
    setDetailEditForm,
    setDetailLinkType,
    setDetailState,
    setSelectedDetailLinkedPartes,
    setSelectedDetailPendingPartes,
  };
}
