from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal, TypedDict


class StepTelemetry(TypedDict, total=False):
    duration_ms: float
    selection_reason: str


class StepOutputPayload(TypedDict, total=False):
    status: str
    tool: str | None
    payload: str | dict[str, Any] | None
    message: str


ExecutionStatus = Literal['ok', 'retry', 'fail', 'unimplemented']


@dataclass(frozen=True)
class PlanStep:
    id: int
    action: str
    tool: str | None = None
    input: str | dict[str, Any] | None = None
    agent_role: str = 'Executor'
    stage: str = 'execution'
    module_keys: tuple[str, ...] = ()
    depends_on: tuple[int, ...] = ()
    parallel_group: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class ExecutionPlan:
    goal: str
    steps: list[PlanStep] = field(default_factory=list)
    orchestration: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            'goal': self.goal,
            'steps': [step.to_dict() for step in self.steps],
            'orchestration': dict(self.orchestration),
        }


@dataclass(frozen=True)
class StepExecutionResult:
    step_id: int
    action: str
    tool: str | None
    input: str | dict[str, Any] | None
    output: StepOutputPayload | str | None
    status: ExecutionStatus
    attempts: int = 1
    error: str | None = None
    telemetry: StepTelemetry = field(default_factory=StepTelemetry)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class ExecutionReport:
    results: list[StepExecutionResult] = field(default_factory=list)
    logs: list[str] = field(default_factory=list)
    final_output: 'ExecutionResultPayload' | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            'results': [result.to_dict() for result in self.results],
            'logs': list(self.logs),
            'final_output': self.final_output.to_dict() if self.final_output is not None else None,
        }


@dataclass(frozen=True)
class ExecutionError:
    code: str
    message: str
    details: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class ExecutionResultPayload:
    kind: Literal['message', 'structured', 'empty']
    message: str
    data: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            'kind': self.kind,
            'message': self.message,
            'data': dict(self.data),
        }

    @classmethod
    def from_raw(cls, payload: dict[str, Any] | str | None) -> 'ExecutionResultPayload':
        if payload is None:
            return cls(kind='empty', message='No output produced.', data={})
        if isinstance(payload, str):
            return cls(kind='message', message=payload, data={})
        message = str(payload.get('message') or payload.get('status') or 'Structured output produced.')
        return cls(kind='structured', message=message, data=dict(payload))


@dataclass(frozen=True)
class CriticVerdict:
    status: Literal['ok', 'retry', 'fail']
    reason: str
    suggestion: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
