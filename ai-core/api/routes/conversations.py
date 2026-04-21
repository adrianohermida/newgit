from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

from core.conversations import ConversationService

router = APIRouter(prefix='/v1/conversations', tags=['conversations'])


@lru_cache(maxsize=1)
def conversation_service() -> ConversationService:
    configured = os.environ.get('AICORE_CONVERSATIONS_FILE')
    storage_path = Path(configured) if configured else Path(__file__).resolve().parents[2] / '.memory_store' / 'conversations.json'
    return ConversationService(storage_path)


def _as_http_error(error: Exception) -> HTTPException:
    status_code = 404 if isinstance(error, ValueError) else 500
    return HTTPException(status_code=status_code, detail=str(error))


@router.get('')
async def list_conversations(limit: int = 50) -> dict[str, Any]:
    return {'items': conversation_service().list_threads(limit=limit)}


@router.post('')
async def create_conversation(body: dict[str, Any]) -> dict[str, Any]:
    return conversation_service().create_thread(title=body.get('title'), text=body.get('text'))


@router.get('/{thread_id}')
async def get_conversation(thread_id: str) -> dict[str, Any]:
    try:
        return conversation_service().get_thread(thread_id)
    except Exception as error:  # pragma: no cover - HTTP wrapper
        raise _as_http_error(error) from error


@router.get('/{thread_id}/messages')
async def list_conversation_messages(thread_id: str, cursor: int = 0, limit: int = 50) -> dict[str, Any]:
    try:
        return conversation_service().list_messages(thread_id, cursor=cursor, limit=limit)
    except Exception as error:  # pragma: no cover - HTTP wrapper
        raise _as_http_error(error) from error


@router.post('/{thread_id}/messages')
async def create_conversation_message(thread_id: str, body: dict[str, Any]) -> dict[str, Any]:
    try:
        return conversation_service().append_message(
            thread_id,
            role=str(body.get('role') or 'user'),
            text=str(body.get('text') or '').strip(),
            metadata=body.get('metadata') if isinstance(body.get('metadata'), dict) else None,
        )
    except Exception as error:  # pragma: no cover - HTTP wrapper
        raise _as_http_error(error) from error
