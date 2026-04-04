from __future__ import annotations

from dataclasses import dataclass
from typing import Any

@dataclass(frozen=True)
class PortingTask:
    name: str
    description: str
    metadata: dict[str, Any] = None

    def __post_init__(self):
        if self.metadata is None:
            object.__setattr__(self, 'metadata', {})
