from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from core.coordinator import Coordinator


@dataclass(frozen=True)
class ExecuteRequest:
    query: str
    context: dict[str, Any] = field(default_factory=dict)


def health() -> dict[str, str]:
    return {'status': 'ok'}


def execute_request(request: ExecuteRequest) -> dict[str, Any]:
    coordinator = Coordinator()
    outcome = coordinator.execute(query=request.query, context=request.context)
    return outcome.to_dict()


def execute_json(payload: dict[str, Any]) -> dict[str, Any]:
    query = str(payload.get('query') or '').strip()
    if not query:
        raise ValueError('query is required')
    context = payload.get('context') if isinstance(payload.get('context'), dict) else {}
    return execute_request(ExecuteRequest(query=query, context=context))


def cloudflare_response(payload: dict[str, Any], status: int = 200) -> tuple[int, dict[str, str], str]:
    return status, {'Content-Type': 'application/json'}, json.dumps(payload)

