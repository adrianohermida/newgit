from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

_SESSION_ID_SANITIZER = re.compile(r'[^A-Za-z0-9._-]+')


@dataclass(frozen=True)
class LongTermMemoryRecord:
    session_id: str
    entries: tuple[str, ...]


class FileBackedLongTermMemory:
    def __init__(self, base_dir: Path | None = None) -> None:
        self._base_dir = base_dir or Path('.memory_store')
        self._base_dir.mkdir(parents=True, exist_ok=True)

    def load(self, session_id: str) -> LongTermMemoryRecord:
        path = self._path_for(session_id)
        if not path.exists():
            return LongTermMemoryRecord(session_id=session_id, entries=())
        payload = json.loads(path.read_text(encoding='utf-8'))
        entries = tuple(str(item) for item in payload.get('entries', []))
        return LongTermMemoryRecord(session_id=session_id, entries=entries)

    def persist(self, record: LongTermMemoryRecord) -> Path:
        path = self._path_for(record.session_id)
        payload = {'session_id': record.session_id, 'entries': list(record.entries)}
        path.write_text(json.dumps(payload, indent=2), encoding='utf-8')
        return path

    def append(self, session_id: str, entry: str) -> Path:
        existing = self.load(session_id)
        updated = LongTermMemoryRecord(session_id=session_id, entries=existing.entries + (entry,))
        return self.persist(updated)

    def _path_for(self, session_id: str) -> Path:
        normalized = str(session_id or '').strip()
        safe = _SESSION_ID_SANITIZER.sub('_', normalized).strip('._') or 'default'
        return self._base_dir / safe
