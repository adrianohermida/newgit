from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from ...adapters.obsidian_adapter import ObsidianMatch, ObsidianRagContext, search_obsidian_context, write_obsidian_memory_note
from ..memory import FileBackedLongTermMemory, LongTermMemoryRecord


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
        return search_obsidian_context(query=query, top_k=top_k)


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
