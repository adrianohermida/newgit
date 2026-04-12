from __future__ import annotations

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
    try:
        return messages_json(await _read_json(request))
    except Exception as error:  # pragma: no cover - HTTP wrapper
        _raise_http_error(error)


@app.post('/v1/browser/execute')
async def browser_execute_route(request: Request) -> dict:
    try:
        return browser_execute_json(await _read_json(request))
    except Exception as error:  # pragma: no cover - HTTP wrapper
        _raise_http_error(error)
