from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from adapters.obsidian_adapter import ObsidianRagContext
from ..agents import CriticVerdict, ExecutionReport, ExecutionResultPayload, ExecutionStatus, StepExecutionResult


@dataclass
class OrchestrationState:
    session_id: str
    plan: object | None = None
    report: ExecutionReport | None = None
    retry_report: ExecutionReport | None = None
    verdict: CriticVerdict | None = None
    retry_count: int = 0
    logs: list[str] = field(default_factory=list)
    telemetry: list[dict[str, Any]] = field(default_factory=list)


@dataclass(frozen=True)
class OrchestrationError:
    code: str
    message: str
    details: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            'code': self.code,
            'message': self.message,
            'details': dict(self.details),
        }


@dataclass(frozen=True)
class OrchestrationResult:
    result: ExecutionResultPayload
    steps: list[StepExecutionResult]
    logs: list[str]
    status: ExecutionStatus
    session_id: str
    rag: ObsidianRagContext | None = None
    orchestration: dict[str, Any] = field(default_factory=dict)
    errors: tuple[OrchestrationError, ...] = ()
    telemetry: tuple[dict[str, Any], ...] = ()

    def to_dict(self) -> dict[str, Any]:
        payload = {
            'result': self.result.to_dict(),
            'steps': [step.to_dict() for step in self.steps],
            'logs': self.logs,
            'status': self.status,
            'session_id': self.session_id,
        }
        if self.rag is not None:
            payload['rag'] = self.rag.to_dict()
        if self.orchestration:
            payload['orchestration'] = dict(self.orchestration)
        if self.errors:
            payload['errors'] = [error.to_dict() for error in self.errors]
        if self.telemetry:
            payload['telemetry'] = [dict(event) for event in self.telemetry]
        return payload
