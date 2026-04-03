from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class RustExecutionResult:
    ok: bool
    output: dict[str, Any] | str | None
    error: str | None = None
    metadata: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            'ok': self.ok,
            'output': self.output,
            'error': self.error,
            'metadata': self.metadata or {},
        }


class RustRuntimeBridge:
    """Async-friendly Python bridge wrapper for Rust runtime calls."""

    async def execute(self, action: str, payload: dict[str, Any] | None = None) -> RustExecutionResult:
        return await asyncio.to_thread(self.execute_sync, action, payload)

    def execute_sync(self, action: str, payload: dict[str, Any] | None = None) -> RustExecutionResult:
        request_payload = payload or {}
        return RustExecutionResult(
            ok=True,
            output={
                'action': action,
                'payload': request_payload,
                'message': 'Runtime bridge placeholder executed without modifying Rust internals.',
            },
            metadata={'bridge': 'python-runtime-adapter'},
        )

