from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .models import build_message, build_thread, utc_now


class ConversationService:
    def __init__(self, storage_path: Path) -> None:
        self.storage_path = storage_path
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)

    def list_threads(self, limit: int = 50) -> list[dict[str, Any]]:
        threads = self._load()['threads']
        ordered = sorted(threads, key=lambda item: item['updated_at'], reverse=True)
        return [self._thread_summary(thread) for thread in ordered[: max(1, limit)]]

    def create_thread(self, title: str | None = None, text: str | None = None) -> dict[str, Any]:
        payload = self._load()
        thread = build_thread(title)
        if text:
            thread['messages'].append(build_message('user', text))
        payload['threads'].append(thread)
        self._save(payload)
        return thread

    def get_thread(self, thread_id: str) -> dict[str, Any]:
        thread = self._find_thread(self._load()['threads'], thread_id)
        return self._thread_summary(thread)

    def list_messages(self, thread_id: str, cursor: int = 0, limit: int = 50) -> dict[str, Any]:
        thread = self._find_thread(self._load()['threads'], thread_id)
        start = max(0, cursor)
        items = thread['messages'][start : start + max(1, limit)]
        next_cursor = start + len(items)
        return {
            'items': items,
            'next_cursor': str(next_cursor) if next_cursor < len(thread['messages']) else None,
            'total': len(thread['messages']),
        }

    def append_message(
        self,
        thread_id: str,
        role: str,
        text: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload = self._load()
        thread = self._find_thread(payload['threads'], thread_id)
        message = build_message(role, text, metadata)
        thread['messages'].append(message)
        thread['updated_at'] = utc_now()
        if len(thread['messages']) == 1 and thread['title'] == 'Nova conversa':
            thread['title'] = text[:60].strip() or thread['title']
        self._save(payload)
        return message

    def _load(self) -> dict[str, Any]:
        if not self.storage_path.exists():
            return {'threads': []}
        return json.loads(self.storage_path.read_text(encoding='utf-8'))

    def _save(self, payload: dict[str, Any]) -> None:
        self.storage_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')

    def _find_thread(self, threads: list[dict[str, Any]], thread_id: str) -> dict[str, Any]:
        for thread in threads:
            if thread['id'] == thread_id:
                return thread
        raise ValueError(f'Conversa "{thread_id}" não encontrada.')

    def _thread_summary(self, thread: dict[str, Any]) -> dict[str, Any]:
        messages = thread.get('messages', [])
        return {
            'id': thread['id'],
            'title': thread['title'],
            'created_at': thread['created_at'],
            'updated_at': thread['updated_at'],
            'message_count': len(messages),
            'preview': messages[-1]['text'][:120] if messages else '',
        }
