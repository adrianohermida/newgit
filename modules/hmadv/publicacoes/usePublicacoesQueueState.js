import { useRef, useState } from "react";

export function usePublicacoesQueueState() {
  const [processCandidates, setProcessCandidates] = useState({ loading: true, error: null, items: [], totalRows: 0, pageSize: 20, updatedAt: null, limited: false, errorUntil: null });
  const [partesCandidates, setPartesCandidates] = useState({ loading: false, error: "Leitura sob demanda para evitar estouro do Worker. Use o botao de carregar ou atualize o snapshot.", items: [], totalRows: 0, pageSize: 20, updatedAt: null, limited: true, errorUntil: null });
  const [processPage, setProcessPage] = useState(1);
  const [partesPage, setPartesPage] = useState(1);
  const [selectedProcessKeys, setSelectedProcessKeys] = useState([]);
  const [selectedPartesKeys, setSelectedPartesKeys] = useState([]);
  const [validationMap, setValidationMap] = useState({});
  const [integratedQueue, setIntegratedQueue] = useState({ loading: false, error: "Leitura sob demanda para evitar estouro do Worker. Atualize o snapshot ou carregue a mesa manualmente.", items: [], totalRows: 0, pageSize: 12, updatedAt: null, limited: true, totalEstimated: false, hasMore: false, nextCursor: null, mode: "snapshot", source: "snapshot" });
  const [heavyQueuesEnabled, setHeavyQueuesEnabled] = useState(false);
  const [integratedFilters, setIntegratedFilters] = useState({ query: "", source: "todos", validation: "todos", sort: "pendencia" });
  const [integratedPage, setIntegratedPage] = useState(1);
  const [integratedCursorTrail, setIntegratedCursorTrail] = useState([""]);
  const [selectedIntegratedNumbers, setSelectedIntegratedNumbers] = useState([]);
  const processCandidatesRequestRef = useRef({ promise: null, page: null });
  const partesCandidatesRequestRef = useRef({ promise: null, page: null });
  const integratedQueueRequestRef = useRef({ promise: null, key: "" });
  const integratedPageSize = 12;

  return {
    heavyQueuesEnabled, integratedCursorTrail, integratedFilters, integratedPage, integratedPageSize,
    integratedQueue, integratedQueueRequestRef, partesCandidates, partesCandidatesRequestRef, partesPage,
    processCandidates, processCandidatesRequestRef, processPage, selectedIntegratedNumbers, selectedPartesKeys,
    selectedProcessKeys, setHeavyQueuesEnabled, setIntegratedCursorTrail, setIntegratedFilters, setIntegratedPage,
    setIntegratedQueue, setPartesCandidates, setPartesPage, setProcessCandidates, setProcessPage,
    setSelectedIntegratedNumbers, setSelectedPartesKeys, setSelectedProcessKeys, setValidationMap, validationMap,
  };
}
