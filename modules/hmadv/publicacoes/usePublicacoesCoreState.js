import { useRef, useState } from "react";

export function usePublicacoesCoreState() {
  const [view, setView] = useState("operacao");
  const [overview, setOverview] = useState({ loading: true, error: null, data: null });
  const [actionState, setActionState] = useState({ loading: false, error: null, result: null });
  const [executionHistory, setExecutionHistory] = useState([]);
  const [remoteHistory, setRemoteHistory] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [activeJobId, setActiveJobId] = useState(null);
  const [drainInFlight, setDrainInFlight] = useState(false);
  const [processNumbers, setProcessNumbers] = useState("");
  const [copilotContext, setCopilotContext] = useState(null);
  const copilotQueryAppliedRef = useRef(false);
  const [queueRefreshLog, setQueueRefreshLog] = useState([]);
  const [pageVisible, setPageVisible] = useState(true);
  const [lastFocusHash, setLastFocusHash] = useState("");
  const [globalError, setGlobalError] = useState(null);
  const [globalErrorUntil, setGlobalErrorUntil] = useState(null);
  const [operationalStatus, setOperationalStatus] = useState({ mode: "ok", message: "", updatedAt: null });
  const [backendHealth, setBackendHealth] = useState({ status: "ok", message: "", updatedAt: null });
  const [limit, setLimit] = useState(10);

  return {
    activeJobId, actionState, backendHealth, copilotContext, copilotQueryAppliedRef, drainInFlight,
    executionHistory, globalError, globalErrorUntil, jobs, lastFocusHash, limit, operationalStatus,
    overview, pageVisible, processNumbers, queueRefreshLog, remoteHistory, setActiveJobId, setActionState,
    setBackendHealth, setCopilotContext, setDrainInFlight, setExecutionHistory, setGlobalError,
    setGlobalErrorUntil, setJobs, setLastFocusHash, setLimit, setOperationalStatus, setOverview,
    setPageVisible, setProcessNumbers, setQueueRefreshLog, setRemoteHistory, setView, view,
  };
}
