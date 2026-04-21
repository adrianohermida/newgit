from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def build_message(role: str, text: str, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        'id': f'msg_{uuid4().hex}',
        'role': role,
        'text': text,
        'metadata': metadata or {},
        'created_at': utc_now(),
    }


def build_thread(title: str | None = None) -> dict[str, Any]:
    now = utc_now()
    return {
        'id': f'conv_{uuid4().hex}',
        'title': (title or 'Nova conversa').strip() or 'Nova conversa',
        'created_at': now,
        'updated_at': now,
        'messages': [],
    }
