"""Supabase pgvector RAG adapter for ai-core.

Reuses the production infrastructure already deployed:
  - supabase/functions/dotobot-embed  → embedding generation (gte-small, 384-dim)
  - public.search_dotobot_memory_embeddings RPC → HNSW cosine similarity search
  - public.upsert_dotobot_memory_embedding RPC  → vector persistence

Environment variables (same keys used by lib/lawdesk/rag.js):
  SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL     - Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY                   - Service role key
  DOTOBOT_SUPABASE_EMBED_SECRET               - dotobot-embed auth secret (optional)
  DOTOBOT_SUPABASE_EMBED_FUNCTION             - edge function name (default: dotobot-embed)
  DOTOBOT_SUPABASE_EMBEDDING_MODEL            - model name (default: gte-small)
  DOTOBOT_SUPABASE_MEMORY_TABLE               - table name (default: dotobot_memory_embeddings)
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from hashlib import sha256
from typing import Any

from .obsidian_adapter import ObsidianMatch, ObsidianRagContext


# ---------------------------------------------------------------------------
# Configuration helpers
# ---------------------------------------------------------------------------

def _env(key: str) -> str | None:
    val = os.getenv(key, '').strip()
    return val or None


def _get_supabase_url() -> str | None:
    return _env('SUPABASE_URL') or _env('NEXT_PUBLIC_SUPABASE_URL')


def _get_service_key() -> str | None:
    return _env('SUPABASE_SERVICE_ROLE_KEY')


def _get_embed_secret() -> str | None:
    return (
        _env('DOTOBOT_SUPABASE_EMBED_SECRET')
        or _env('HMDAV_AI_SHARED_SECRET')
        or _env('LAWDESK_AI_SHARED_SECRET')
    )


def _get_embed_function() -> str:
    return _env('DOTOBOT_SUPABASE_EMBED_FUNCTION') or 'dotobot-embed'


def _get_embedding_model() -> str:
    return _env('DOTOBOT_SUPABASE_EMBEDDING_MODEL') or 'gte-small'


def _get_memory_table() -> str:
    return _env('DOTOBOT_SUPABASE_MEMORY_TABLE') or 'dotobot_memory_embeddings'


def is_configured() -> bool:
    """Return True when the minimum env vars are present."""
    return bool(_get_supabase_url() and _get_service_key())


# ---------------------------------------------------------------------------
# HTTP helpers (no external dependencies)
# ---------------------------------------------------------------------------

def _post(url: str, payload: dict[str, Any], headers: dict[str, str], timeout: float = 15.0) -> dict[str, Any]:
    body = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=body, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode('utf-8', errors='replace')
        try:
            detail = json.loads(raw)
        except json.JSONDecodeError:
            detail = {'raw': raw}
        raise SupabaseRagError(f'HTTP {exc.code} from {url}: {detail}') from exc
    except urllib.error.URLError as exc:
        raise SupabaseRagError(f'Network error reaching {url}: {exc.reason}') from exc


# ---------------------------------------------------------------------------
# Public errors
# ---------------------------------------------------------------------------

class SupabaseRagError(RuntimeError):
    """Raised when Supabase RAG operations fail."""


# ---------------------------------------------------------------------------
# Embedding generation
# ---------------------------------------------------------------------------

def generate_embedding(text: str) -> list[float]:
    """Call the deployed dotobot-embed edge function to get a 384-dim vector."""
    base_url = _get_supabase_url()
    api_key = _get_service_key()
    if not base_url or not api_key:
        raise SupabaseRagError('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')

    function_name = _get_embed_function()
    url = f'{base_url.rstrip("/")}/functions/v1/{function_name}'
    headers: dict[str, str] = {
        'Authorization': f'Bearer {api_key}',
        'apikey': api_key,
        'Content-Type': 'application/json',
    }
    secret = _get_embed_secret()
    if secret:
        headers['x-dotobot-embed-secret'] = secret

    result = _post(url, {'input': text, 'model': _get_embedding_model()}, headers)

    embedding = (
        result.get('embedding')
        or (result.get('result') or {}).get('embedding')
        or result.get('result')
    )
    if not isinstance(embedding, list):
        raise SupabaseRagError(f'dotobot-embed did not return a valid vector: {result}')
    return embedding


# ---------------------------------------------------------------------------
# Vector search
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class SupabaseRagMatch:
    id: str
    source_key: str
    session_id: str
    query: str
    response_text: str
    similarity: float
    route: str | None = None
    role: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_obsidian_match(self) -> ObsidianMatch:
        return ObsidianMatch(
            id=self.id,
            title=self.query[:80],
            path=self.source_key,
            score=self.similarity,
            excerpt=self.response_text[:256],
            metadata={
                'source': 'supabase_pgvector',
                'session_id': self.session_id,
                'route': self.route,
                'role': self.role,
                **self.metadata,
            },
        )


def search_memory(
    query: str,
    top_k: int = 5,
    match_threshold: float | None = 0.5,
) -> list[SupabaseRagMatch]:
    """Generate query embedding and run HNSW cosine search via Supabase RPC."""
    embedding = generate_embedding(query)
    return search_by_vector(embedding, top_k=top_k, match_threshold=match_threshold)


def search_by_vector(
    embedding: list[float],
    top_k: int = 5,
    match_threshold: float | None = 0.5,
) -> list[SupabaseRagMatch]:
    """Run similarity search using an already-computed embedding."""
    base_url = _get_supabase_url()
    api_key = _get_service_key()
    if not base_url or not api_key:
        raise SupabaseRagError('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')

    url = f'{base_url.rstrip("/")}/rest/v1/rpc/search_dotobot_memory_embeddings'
    headers = {
        'Authorization': f'Bearer {api_key}',
        'apikey': api_key,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
    }
    payload: dict[str, Any] = {
        'query_embedding': json.dumps(embedding),
        'match_count': max(1, top_k),
    }
    if match_threshold is not None:
        payload['match_threshold'] = match_threshold

    rows = _post(url, payload, headers)
    if not isinstance(rows, list):
        raise SupabaseRagError(f'Unexpected response from search RPC: {rows}')

    return [
        SupabaseRagMatch(
            id=str(row.get('id', '')),
            source_key=str(row.get('source_key', '')),
            session_id=str(row.get('session_id', '')),
            query=str(row.get('query', '')),
            response_text=str(row.get('response_text', '')),
            similarity=float(row.get('similarity', 0.0)),
            route=row.get('route'),
            role=row.get('role'),
            metadata=dict(row.get('metadata') or {}),
        )
        for row in rows
    ]


# ---------------------------------------------------------------------------
# Vector persistence
# ---------------------------------------------------------------------------

def persist_memory(
    *,
    query: str,
    response_text: str,
    session_id: str,
    embedding: list[float] | None = None,
    route: str | None = None,
    role: str | None = None,
    status: str = 'ok',
    steps_count: int = 0,
    metadata: dict[str, Any] | None = None,
) -> str:
    """Upsert a query/response pair with its embedding into dotobot_memory_embeddings.

    Returns the source_key used for the upsert.
    """
    if embedding is None:
        embedding = generate_embedding(query)

    source_key = sha256(
        '|'.join([session_id, query, response_text]).encode('utf-8')
    ).hexdigest()

    base_url = _get_supabase_url()
    api_key = _get_service_key()
    if not base_url or not api_key:
        raise SupabaseRagError('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')

    url = f'{base_url.rstrip("/")}/rest/v1/rpc/upsert_dotobot_memory_embedding'
    headers = {
        'Authorization': f'Bearer {api_key}',
        'apikey': api_key,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
    }
    payload_data: dict[str, Any] = {
        'source_key': source_key,
        'session_id': session_id,
        'query': query,
        'response_text': response_text,
        'status': status,
        'steps_count': steps_count,
        'embedding_model': _get_embedding_model(),
        'embedding_dimensions': len(embedding),
        'embedding': json.dumps(embedding),
        'metadata': json.dumps(metadata or {}),
    }
    if route:
        payload_data['route'] = route
    if role:
        payload_data['role'] = role

    _post(url, {'payload': payload_data}, headers)
    return source_key


# ---------------------------------------------------------------------------
# High-level RAG context (mirrors ObsidianRagContext interface)
# ---------------------------------------------------------------------------

def search_supabase_context(query: str, top_k: int = 5) -> ObsidianRagContext:
    """Search Supabase pgvector and return an ObsidianRagContext-compatible result.

    This is the drop-in for ObsidianRagContext used by the Coordinator when
    Supabase credentials are present.
    """
    if not is_configured():
        return ObsidianRagContext(
            enabled=False,
            vault_path=None,
            memory_dir=None,
            error='Supabase RAG not configured (missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)',
        )

    try:
        matches = search_memory(query, top_k=top_k)
        obsidian_matches = tuple(m.to_obsidian_match() for m in matches)
        return ObsidianRagContext(
            enabled=True,
            vault_path='supabase://dotobot_memory_embeddings',
            memory_dir=None,
            matches=obsidian_matches,
        )
    except SupabaseRagError as exc:
        return ObsidianRagContext(
            enabled=False,
            vault_path=None,
            memory_dir=None,
            error=str(exc),
        )
