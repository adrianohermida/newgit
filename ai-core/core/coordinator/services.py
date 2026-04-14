from __future__ import annotations

from dataclasses import dataclass
from dataclasses import field as dataclasses_field
from pathlib import Path
from typing import Any, Protocol

from adapters.obsidian_adapter import ObsidianMatch, ObsidianRagContext, search_obsidian_context, write_obsidian_memory_note
from adapters.supabase_rag_adapter import SupabaseRagError
from adapters.supabase_rag_adapter import is_configured as supabase_is_configured
from adapters.supabase_rag_adapter import persist_memory as supabase_persist_memory
from adapters.supabase_rag_adapter import search_supabase_context
from ..memory import FileBackedLongTermMemory, LongTermMemoryRecord
from .rag_fusion import merge_rag_contexts


class LongTermMemoryStore(Protocol):
    def load(self, session_id: str) -> LongTermMemoryRecord:
        ...

    def persist(self, record: LongTermMemoryRecord) -> Path:
        ...


class RagService(Protocol):
    def search(self, query: str, top_k: int = 5) -> ObsidianRagContext:
        ...


class MemoryNoteSink(Protocol):
    def write(
        self,
        *,
        query: str,
        answer: str,
        session_id: str,
        context: dict[str, Any] | None = None,
        rag_matches: tuple[ObsidianMatch, ...] = (),
        title: str | None = None,
    ) -> Path | None:
        ...


@dataclass(frozen=True)
class DefaultRagService:
    def search(self, query: str, top_k: int = 5) -> ObsidianRagContext:
        obsidian_context = search_obsidian_context(query=query, top_k=top_k)
        if not supabase_is_configured():
            return obsidian_context
        try:
            supabase_context = search_supabase_context(query=query, top_k=top_k)
        except SupabaseRagError as exc:
            supabase_context = ObsidianRagContext(
                enabled=False,
                vault_path=None,
                memory_dir=None,
                error=str(exc),
                vector_backend='supabase_pgvector',
            )
        return merge_rag_contexts(supabase_context, obsidian_context, top_k=top_k)


@dataclass(frozen=True)
class ObsidianMemoryNoteSink:
    def write(
        self,
        *,
        query: str,
        answer: str,
        session_id: str,
        context: dict[str, Any] | None = None,
        rag_matches: tuple[ObsidianMatch, ...] = (),
        title: str | None = None,
    ) -> Path | None:
        return write_obsidian_memory_note(
            query=query,
            answer=answer,
            session_id=session_id,
            context=context,
            rag_matches=rag_matches,
            title=title,
        )


@dataclass(frozen=True)
class SupabaseMemoryNoteSink:
    """Persists query/answer as a vector in Supabase pgvector for future RAG retrieval."""

    def write(
        self,
        *,
        query: str,
        answer: str,
        session_id: str,
        context: dict[str, Any] | None = None,
        rag_matches: tuple[ObsidianMatch, ...] = (),
        title: str | None = None,
    ) -> Path | None:
        if not supabase_is_configured():
            return None
        try:
            supabase_persist_memory(
                query=query,
                response_text=answer,
                session_id=session_id,
                route=str((context or {}).get('route') or ''),
                role=str(((context or {}).get('profile') or {}).get('role') or ''),
                metadata={
                    **{k: v for k, v in (context or {}).items() if isinstance(v, (str, int, float, bool))},
                    'title': title or query[:120],
                    'rag_titles': [match.title for match in rag_matches[:5]],
                    'rag_sources': [match.metadata.get('source') for match in rag_matches[:5]],
                },
            )
        except (SupabaseRagError, OSError):
            pass  # Non-fatal: Obsidian is the durable local backup
        return None


@dataclass
class DualMemoryNoteSink:
    """Always writes to Obsidian (local backup) and also to Supabase when configured.

    Obsidian is the durable offline record.
    Supabase is the primary RAG store for semantic search.
    Both are written on every turn regardless of which was used for retrieval.
    """

    _obsidian: ObsidianMemoryNoteSink = dataclasses_field(default_factory=ObsidianMemoryNoteSink)
    _supabase: SupabaseMemoryNoteSink = dataclasses_field(default_factory=SupabaseMemoryNoteSink)

    def write(
        self,
        *,
        query: str,
        answer: str,
        session_id: str,
        context: dict[str, Any] | None = None,
        rag_matches: tuple[ObsidianMatch, ...] = (),
        title: str | None = None,
    ) -> Path | None:
        shared = dict(
            query=query,
            answer=answer,
            session_id=session_id,
            context=context,
            rag_matches=rag_matches,
            title=title,
        )
        # Obsidian first — always, non-negotiable local backup
        obsidian_path = self._obsidian.write(**shared)
        # Supabase second — silently skipped when not configured or on error
        self._supabase.write(**shared)
        return obsidian_path


@dataclass(frozen=True)
class NullMemoryNoteSink:
    def write(
        self,
        *,
        query: str,
        answer: str,
        session_id: str,
        context: dict[str, Any] | None = None,
        rag_matches: tuple[ObsidianMatch, ...] = (),
        title: str | None = None,
    ) -> Path | None:
        return None


def build_default_memory_store() -> LongTermMemoryStore:
    return FileBackedLongTermMemory()


def build_default_memory_note_sink() -> DualMemoryNoteSink:
    """Return the dual sink: Obsidian always + Supabase when configured."""
    return DualMemoryNoteSink()
