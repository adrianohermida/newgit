from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class AdapterResult:
    success: bool
    data: dict[str, Any] | None = None
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            'success': self.success,
            'data': self.data or {},
            'error': self.error,
        }

