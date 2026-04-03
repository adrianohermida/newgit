from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, Field

from core.coordinator import Coordinator

app = FastAPI(title='AI Core Orchestration API', version='1.0.0')


class ExecuteRequest(BaseModel):
    query: str = Field(min_length=1)
    context: dict[str, Any] = Field(default_factory=dict)


class ExecuteResponse(BaseModel):
    result: dict[str, Any] | str | None
    steps: list[dict[str, Any]]
    logs: list[str]
    status: str
    session_id: str


@app.get('/health')
def health() -> dict[str, str]:
    return {'status': 'ok'}


@app.post('/execute', response_model=ExecuteResponse)
def execute(request: ExecuteRequest) -> ExecuteResponse:
    coordinator = Coordinator()
    outcome = coordinator.execute(query=request.query, context=request.context)
    return ExecuteResponse(**outcome.to_dict())

