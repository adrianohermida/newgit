from __future__ import annotations

import json
import os
import traceback
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from .server import (
    capabilities_json,
    browser_execute_json,
    execute_json,
    health,
    messages_json,
    providers_json,
    skills_json,
    rag_context_json,
)

app = FastAPI(title='ai-core local runtime', version='0.2.0')
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=False,
    allow_methods=['*'],
    allow_headers=['*'],
)

_RUNTIME_LOG_DIR = Path(__file__).resolve().parents[2] / ".runtime-logs"
_RUNTIME_LOG_DIR.mkdir(parents=True, exist_ok=True)
_HTTP_LOG_PATH = _RUNTIME_LOG_DIR / "ai-core-http.log"


def _append_http_log(event: str, payload: dict) -> None:
    try:
        entry = {
            "at": datetime.now(timezone.utc).isoformat(),
            "event": event,
            **payload,
        }
        with _HTTP_LOG_PATH.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception:
        pass


async def _read_json(request: Request) -> dict:
    body = await request.json()
    return body if isinstance(body, dict) else {}


def _raise_http_error(error: Exception) -> None:
    status_code = 400 if isinstance(error, ValueError) else 500
    raise HTTPException(status_code=status_code, detail=str(error)) from error


@app.get('/health')
async def health_route() -> dict:
    return health()


@app.get('/v1/providers')
async def providers_route() -> dict:
    return providers_json()


@app.get('/v1/skills')
async def skills_route() -> dict:
    return skills_json()


@app.get('/v1/capabilities')
async def capabilities_route() -> dict:
    return capabilities_json()


@app.post('/execute')
async def execute_route(request: Request) -> dict:
    try:
        return execute_json(await _read_json(request))
    except Exception as error:  # pragma: no cover - HTTP wrapper
        _raise_http_error(error)


@app.post('/rag-context')
async def rag_context_route(request: Request) -> dict:
    try:
        return rag_context_json(await _read_json(request))
    except Exception as error:  # pragma: no cover - HTTP wrapper
        _raise_http_error(error)


@app.post('/v1/messages')
async def messages_route(request: Request) -> dict:
    body = await _read_json(request)
    model = body.get("model")
    provider = body.get("provider")
    messages = body.get("messages") if isinstance(body.get("messages"), list) else []
    _append_http_log(
        "messages.start",
        {
            "provider": provider,
            "model": model,
            "message_count": len(messages),
            "route": ((body.get("context") or {}) if isinstance(body.get("context"), dict) else {}).get("route"),
            "pid": os.getpid(),
        },
    )
    try:
        response = messages_json(body)
        metadata = response.get("metadata") if isinstance(response.get("metadata"), dict) else {}
        _append_http_log(
            "messages.success",
            {
                "provider": provider,
                "model": model,
                "resolved_model": metadata.get("resolved_model"),
                "effective_model": metadata.get("effective_model"),
                "route_name": metadata.get("route"),
                "degraded": bool(metadata.get("degraded")),
                "pid": os.getpid(),
            },
        )
        return response
    except Exception as error:  # pragma: no cover - HTTP wrapper
        _append_http_log(
            "messages.error",
            {
                "provider": provider,
                "model": model,
                "error": str(error),
                "traceback": traceback.format_exc(limit=8),
                "pid": os.getpid(),
            },
        )
        _raise_http_error(error)


@app.post('/v1/browser/execute')
async def browser_execute_route(request: Request) -> dict:
    try:
        return browser_execute_json(await _read_json(request))
    except Exception as error:  # pragma: no cover - HTTP wrapper
        _raise_http_error(error)
