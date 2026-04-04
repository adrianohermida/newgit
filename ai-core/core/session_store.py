from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass(frozen=True)
class StoredSession:
    session_id: str
    messages: tuple[str, ...]
    input_tokens: int
    output_tokens: int


DEFAULT_SESSION_DIR = Path('.port_sessions')
_SESSION_ID_SANITIZER = re.compile(r'[^A-Za-z0-9._-]+')


class SessionStoreError(RuntimeError):
    """Base error for session persistence failures."""


class InvalidSessionIdError(SessionStoreError):
    """Raised when the provided session id cannot be safely persisted."""


class SessionNotFoundError(SessionStoreError):
    """Raised when a requested session file does not exist."""


class SessionCorruptedError(SessionStoreError):
    """Raised when a session payload is missing required fields or contains invalid JSON."""


class SessionPersistenceError(SessionStoreError):
    """Raised when a session cannot be written or read from disk."""


def sanitize_session_id(session_id: str) -> str:
    normalized = str(session_id or '').strip()
    sanitized = _SESSION_ID_SANITIZER.sub('_', normalized).strip('._')
    if not sanitized:
        raise InvalidSessionIdError('session_id must contain at least one safe character')
    return sanitized


def _target_path(session_id: str, directory: Path | None = None) -> Path:
    target_dir = (directory or DEFAULT_SESSION_DIR).resolve()
    safe_id = sanitize_session_id(session_id)
    return target_dir / f'{safe_id}.json'


def save_session(session: StoredSession, directory: Path | None = None) -> Path:
    path = _target_path(session.session_id, directory)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(asdict(session), indent=2), encoding='utf-8')
        return path
    except (OSError, TypeError, ValueError) as exc:
        raise SessionPersistenceError(f'failed to persist session {session.session_id!r}') from exc


def load_session(session_id: str, directory: Path | None = None) -> StoredSession:
    path = _target_path(session_id, directory)
    if not path.exists():
        raise SessionNotFoundError(f'session not found: {sanitize_session_id(session_id)}')
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
    except OSError as exc:
        raise SessionPersistenceError(f'failed to read session {session_id!r}') from exc
    except json.JSONDecodeError as exc:
        raise SessionCorruptedError(f'session payload is invalid JSON: {session_id!r}') from exc

    try:
        payload_session_id = str(data['session_id'])
        messages = tuple(str(message) for message in data['messages'])
        input_tokens = int(data['input_tokens'])
        output_tokens = int(data['output_tokens'])
    except (KeyError, TypeError, ValueError) as exc:
        raise SessionCorruptedError(f'session payload is missing required fields: {session_id!r}') from exc

    return StoredSession(
        session_id=payload_session_id,
        messages=messages,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
    )
