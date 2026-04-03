from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal


@dataclass(frozen=True)
class PlanStep:
    id: int
    action: str
    tool: str | None = None
    input: str | dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class ExecutionPlan:
    goal: str
    steps: list[PlanStep] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {'goal': self.goal, 'steps': [step.to_dict() for step in self.steps]}


@dataclass(frozen=True)
class StepExecutionResult:
    step_id: int
    action: str
    tool: str | None
    input: str | dict[str, Any] | None
    output: dict[str, Any] | str | None
    status: Literal['ok', 'retry', 'fail']
    attempts: int = 1
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class ExecutionReport:
    results: list[StepExecutionResult] = field(default_factory=list)
    logs: list[str] = field(default_factory=list)
    final_output: dict[str, Any] | str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            'results': [result.to_dict() for result in self.results],
            'logs': list(self.logs),
            'final_output': self.final_output,
        }


@dataclass(frozen=True)
class CriticVerdict:
    status: Literal['ok', 'retry', 'fail']
    reason: str
    suggestion: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

