# Exportação mínima de subsistemas reais
from .assistant import SessionHistory
from .history import HistoryLog
"""Python porting workspace for the Lawdesk rewrite effort."""

from .coordinator import Coordinator, OrchestrationResult
from .parity_audit import ParityAuditResult, run_parity_audit
from .port_manifest import PortManifest, build_port_manifest
from .query_engine import QueryEnginePort, TurnResult
from .runtime import PortRuntime, RuntimeSession
from .runtime_adapter import RustRuntimeBridge
from .session_store import (
    InvalidSessionIdError,
    SessionCorruptedError,
    SessionNotFoundError,
    SessionPersistenceError,
    SessionStoreError,
    StoredSession,
    load_session,
    sanitize_session_id,
    save_session,
)
from .system_init import build_system_init_message
from .tools import PORTED_TOOLS, build_tool_backlog

__all__ = [
    'ParityAuditResult',
    'PortManifest',
    'PortRuntime',
    'QueryEnginePort',
    'Coordinator',
    'OrchestrationResult',
    'RustRuntimeBridge',
    'RuntimeSession',
    'InvalidSessionIdError',
    'SessionCorruptedError',
    'SessionNotFoundError',
    'SessionPersistenceError',
    'SessionStoreError',
    'StoredSession',
    'TurnResult',
    'PORTED_COMMANDS',
    'PORTED_TOOLS',
    'build_command_backlog',
    'build_port_manifest',
    'build_system_init_message',
    'build_tool_backlog',
    'load_session',
    'run_parity_audit',
    'sanitize_session_id',
    'save_session',
]
