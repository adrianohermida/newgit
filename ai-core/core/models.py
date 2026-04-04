from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Subsystem:
    name: str
    path: str
    file_count: int
    notes: str


@dataclass(frozen=True)
class PortingModule:
    name: str
    responsibility: str
    source_hint: str
    status: str = 'planned'
    execution_status: str = 'unknown'

    @property
    def is_executable(self) -> bool:
        return self.execution_status == 'implemented'


@dataclass(frozen=True)
class PermissionDenial:
    tool_name: str
    reason: str


@dataclass(frozen=True)
class UsageSummary:
    input_tokens: int = 0
    output_tokens: int = 0

    def add_turn(self, prompt: str, output: str) -> 'UsageSummary':
        # Approximation: ~4 chars per token (GPT-family heuristic).
        # Replace with tiktoken.encode() when available for exact counts.
        return UsageSummary(
            input_tokens=self.input_tokens + max(1, len(prompt) // 4),
            output_tokens=self.output_tokens + max(1, len(output) // 4),
        )


@dataclass
class PortingBacklog:
    title: str
    modules: list[PortingModule] = field(default_factory=list)

    def summary_lines(self) -> list[str]:
        return [
            f'- {module.name} [{module.status}/{module.execution_status}] - {module.responsibility} (from {module.source_hint})'
            for module in self.modules
        ]
