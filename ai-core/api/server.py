from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from core.coordinator import Coordinator
from adapters.obsidian_adapter import search_obsidian_context


@dataclass(frozen=True)
class ExecuteRequest:
    query: str
    context: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class RagContextRequest:
    query: str
    context: dict[str, Any] = field(default_factory=dict)
    top_k: int = 5


def health() -> dict[str, str]:
    return {'status': 'ok'}


def execute_request(request: ExecuteRequest) -> dict[str, Any]:
    coordinator = Coordinator()
    outcome = coordinator.execute(query=request.query, context=request.context)
    return outcome.to_dict()


def rag_context_request(request: RagContextRequest) -> dict[str, Any]:
    rag_context = search_obsidian_context(request.query, top_k=max(1, request.top_k))
    return rag_context.to_dict()


def execute_json(payload: dict[str, Any]) -> dict[str, Any]:
    query = str(payload.get('query') or '').strip()
    if not query:
        raise ValueError('query is required')
    context = payload.get('context') if isinstance(payload.get('context'), dict) else {}
    return execute_request(ExecuteRequest(query=query, context=context))


def rag_context_json(payload: dict[str, Any]) -> dict[str, Any]:
    query = str(payload.get('query') or '').strip()
    if not query:
        raise ValueError('query is required')
    context = payload.get('context') if isinstance(payload.get('context'), dict) else {}
    top_k = payload.get('top_k', 5)
    try:
        top_k_int = int(top_k)
    except (TypeError, ValueError):
        top_k_int = 5
    return rag_context_request(RagContextRequest(query=query, context=context, top_k=top_k_int))


def cloudflare_response(payload: dict[str, Any], status: int = 200) -> tuple[int, dict[str, str], str]:
    return status, {'Content-Type': 'application/json'}, json.dumps(payload)
