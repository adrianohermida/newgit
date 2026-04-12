from __future__ import annotations

from dataclasses import dataclass, asdict, field
from hashlib import sha256
from math import sqrt
from pathlib import Path
from typing import Any
import os
import re
import unicodedata


_OBSIDIAN_ENV_KEYS = (
    "DOTOBOT_OBSIDIAN_VAULT_PATH",
    "LAWDESK_OBSIDIAN_VAULT_PATH",
    "OBSIDIAN_VAULT_PATH",
)

_TOKEN_PATTERN = re.compile(r"[a-z0-9_]+")
_DEFAULT_MAX_INDEXED_NOTES = 256
_INDEX_CACHE_MAX_SIZE = 16  # max distinct vault paths held in memory
_DEFAULT_LOCAL_EMBEDDING_DIMENSIONS = 128


@dataclass(frozen=True)
class IndexedObsidianNote:
    path: str
    title: str
    excerpt: str
    lowered_content: str
    token_counts: dict[str, int]
    token_count_total: int
    embedding: tuple[float, ...]
    mtime_ns: int


@dataclass
class ObsidianIndexCache:
    notes: dict[str, IndexedObsidianNote] = field(default_factory=dict)
    scanned_at_mtime_ns: int = 0


_INDEX_CACHE: dict[str, ObsidianIndexCache] = {}  # insertion-order LRU via dict (Python 3.7+)


def _cache_get(key: str) -> ObsidianIndexCache | None:
    """Return cached entry and promote it to MRU position."""
    entry = _INDEX_CACHE.pop(key, None)
    if entry is not None:
        _INDEX_CACHE[key] = entry
    return entry


def _cache_put(key: str, value: ObsidianIndexCache) -> None:
    """Insert/update entry, evicting the oldest when over capacity."""
    _INDEX_CACHE.pop(key, None)
    if len(_INDEX_CACHE) >= _INDEX_CACHE_MAX_SIZE:
        _INDEX_CACHE.pop(next(iter(_INDEX_CACHE)))
    _INDEX_CACHE[key] = value


@dataclass(frozen=True)
class ObsidianMatch:
    id: str
    title: str
    path: str
    score: float
    excerpt: str
    metadata: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class ObsidianRagContext:
    enabled: bool
    vault_path: str | None
    memory_dir: str | None
    matches: tuple[ObsidianMatch, ...] = ()
    error: str | None = None
    embedding_engine: str = "hashed_token_bow"
    embedding_dimensions: int = _DEFAULT_LOCAL_EMBEDDING_DIMENSIONS
    vector_backend: str = "obsidian_hybrid_local_index"
    indexed_notes: int = 0
    index_limit: int = _DEFAULT_MAX_INDEXED_NOTES

    def to_dict(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "vault_path": self.vault_path,
            "memory_dir": self.memory_dir,
            "matches": [match.to_dict() for match in self.matches],
            "error": self.error,
            "embedding_engine": self.embedding_engine,
            "embedding_dimensions": self.embedding_dimensions,
            "vector_backend": self.vector_backend,
            "indexed_notes": self.indexed_notes,
            "index_limit": self.index_limit,
        }


def get_obsidian_vault_path() -> Path | None:
    for key in _OBSIDIAN_ENV_KEYS:
        raw = os.getenv(key)
        if raw and raw.strip():
            return Path(raw.strip()).expanduser()
    return None


def can_use_obsidian() -> bool:
    return get_obsidian_vault_path() is not None


def build_obsidian_memory_dir(vault_path: Path | None = None) -> Path | None:
    root = vault_path or get_obsidian_vault_path()
    if root is None:
        return None
    return root / "Dotobot" / "Memory"


def _tokenize(text: str) -> tuple[str, ...]:
    normalized = unicodedata.normalize("NFKD", text or "")
    stripped = "".join(char for char in normalized if not unicodedata.combining(char))
    return tuple(token.lower() for token in _TOKEN_PATTERN.findall(stripped.lower()))


def _embed_text(text: str, dimensions: int = 128) -> list[float]:
    vector = [0.0] * max(32, dimensions)
    tokens = _tokenize(text)
    if not tokens:
        return vector

    for token in tokens:
        digest = sha256(token.encode("utf-8")).digest()
        bucket = int.from_bytes(digest[:4], "big") % len(vector)
        weight = 1.0 + min(len(token), 12) / 12.0
        vector[bucket] += weight

    norm = sqrt(sum(value * value for value in vector))
    if norm:
        vector = [value / norm for value in vector]
    return vector


def _build_token_counts(tokens: tuple[str, ...]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for token in tokens:
        counts[token] = counts.get(token, 0) + 1
    return counts


def get_local_embedding_dimensions() -> int:
    raw = os.getenv("DOTOBOT_LOCAL_EMBEDDING_DIMENSIONS") or os.getenv("AICORE_LOCAL_EMBEDDING_DIMENSIONS")
    if not raw:
        return _DEFAULT_LOCAL_EMBEDDING_DIMENSIONS
    try:
        return max(32, int(raw))
    except ValueError:
        return _DEFAULT_LOCAL_EMBEDDING_DIMENSIONS


def get_local_embedding_config() -> dict[str, Any]:
    return {
        "engine": "hashed_token_bow",
        "dimensions": get_local_embedding_dimensions(),
        "local_only": True,
        "supports_network": False,
    }


def get_local_vector_index_config() -> dict[str, Any]:
    return {
        "backend": "obsidian_hybrid_local_index",
        "storage": "vault_markdown",
        "index_limit": _get_max_indexed_notes(),
        "ranking": "lexical_plus_embedding",
        "local_only": True,
        "supports_network": False,
    }


def _cosine_similarity(left: list[float], right: list[float]) -> float:
    if len(left) != len(right):
        size = min(len(left), len(right))
        left = left[:size]
        right = right[:size]
    denominator = sqrt(sum(value * value for value in left)) * sqrt(sum(value * value for value in right))
    if not denominator:
        return 0.0
    return sum(l * r for l, r in zip(left, right)) / denominator


def _lexical_overlap_score(query_counts: dict[str, int], indexed_note: IndexedObsidianNote) -> float:
    if not query_counts or not indexed_note.token_counts:
        return 0.0

    shared_weight = 0.0
    query_total = sum(query_counts.values()) or 1
    note_total = indexed_note.token_count_total or 1

    for token, query_count in query_counts.items():
        note_count = indexed_note.token_counts.get(token)
        if not note_count:
            continue
        shared_weight += min(query_count, note_count)

    query_ratio = shared_weight / query_total
    note_ratio = shared_weight / note_total
    return min(1.0, (query_ratio * 0.7) + (note_ratio * 0.3))


def _frontmatter_value(value: Any) -> str:
    return str(value or "").replace("\\", "\\\\").replace('"', '\\"')


def _build_note_content(
    *,
    query: str,
    answer: str,
    session_id: str,
    source_key: str,
    route: str | None = None,
    role: str | None = None,
    summary: str | None = None,
    context: dict[str, Any] | None = None,
    rag_matches: tuple[ObsidianMatch, ...] = (),
    created_at: str | None = None,
) -> str:
    context = context or {}
    lines = [
        "---",
        "source: dotobot",
        f'source_key: "{_frontmatter_value(source_key)}"',
        f'session_id: "{_frontmatter_value(session_id)}"',
        f'route: "{_frontmatter_value(route or "/interno")}"',
        f'role: "{_frontmatter_value(role or "")}"',
        f'title: "{_frontmatter_value(context.get("title") or query[:120] or "Dotobot memory")}"',
        f'summary: "{_frontmatter_value(summary or answer[:280])}"',
        f'created_at: "{_frontmatter_value(created_at or "")}"',
        "---",
        "",
        "# Query",
        query,
        "",
        "# Answer",
        answer,
    ]

    if rag_matches:
        lines.extend(
            [
                "",
                "# RAG",
                *[
                    f"- {match.title} [{match.score:.3f}] {match.excerpt[:220]}"
                    for match in rag_matches[:5]
                ],
            ]
        )

    if context:
        lines.extend(["", "# Context"])
        for key, value in context.items():
            lines.append(f"- {key}: {value}")

    return "\n".join(lines).strip() + "\n"


def _collect_markdown_files(root: Path) -> tuple[Path, ...]:
    if not root.exists():
        return ()
    files: list[Path] = []
    for path in root.rglob("*.md"):
        if ".obsidian" in path.parts:
            continue
        if path.is_file():
            files.append(path)
    return tuple(files)


def _get_max_indexed_notes() -> int:
    raw = os.getenv('DOTOBOT_OBSIDIAN_RAG_MAX_FILES', '').strip()
    if not raw:
        return _DEFAULT_MAX_INDEXED_NOTES
    try:
        return max(1, int(raw))
    except ValueError:
        return _DEFAULT_MAX_INDEXED_NOTES


def _get_cached_index(memory_dir: Path) -> dict[str, IndexedObsidianNote]:
    files = _collect_markdown_files(memory_dir)
    if not files:
        return {}

    max_files = _get_max_indexed_notes()
    selected_files = sorted(files, key=lambda item: item.stat().st_mtime_ns, reverse=True)[:max_files]
    cache_key = str(memory_dir.resolve())
    cache = _cache_get(cache_key) or ObsidianIndexCache()
    _cache_put(cache_key, cache)
    current_paths = {str(path.resolve()) for path in selected_files}
    stale_paths = [path for path in cache.notes if path not in current_paths]
    for path in stale_paths:
        cache.notes.pop(path, None)

    embedding_dimensions = get_local_embedding_dimensions()
    for file_path in selected_files:
        resolved_path = str(file_path.resolve())
        stat = file_path.stat()
        cached = cache.notes.get(resolved_path)
        if cached and cached.mtime_ns == stat.st_mtime_ns:
            continue
        try:
            content = file_path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            cache.notes.pop(resolved_path, None)
            continue

        title = file_path.stem.replace("-", " ").replace("_", " ").strip() or file_path.stem
        excerpt = " ".join(content.split())[:300]
        tokens = _tokenize(content)
        cache.notes[resolved_path] = IndexedObsidianNote(
            path=resolved_path,
            title=title,
            excerpt=excerpt,
            lowered_content=content.lower(),
            token_counts=_build_token_counts(tokens),
            token_count_total=len(tokens),
            embedding=tuple(_embed_text(content, embedding_dimensions)),
            mtime_ns=stat.st_mtime_ns,
        )
    return dict(cache.notes)


def write_obsidian_memory_note(
    *,
    query: str,
    answer: str,
    session_id: str,
    context: dict[str, Any] | None = None,
    rag_matches: tuple[ObsidianMatch, ...] = (),
    title: str | None = None,
) -> Path | None:
    vault_path = get_obsidian_vault_path()
    if vault_path is None:
        return None

    memory_dir = build_obsidian_memory_dir(vault_path)
    if memory_dir is None:
        return None

    memory_dir.mkdir(parents=True, exist_ok=True)
    source_key = sha256(
        "|".join([session_id, query, answer, title or "", str(context or {})]).encode("utf-8")
    ).hexdigest()
    note_path = memory_dir / f"{source_key}.md"
    content = _build_note_content(
        query=query,
        answer=answer,
        session_id=session_id,
        source_key=source_key,
        route=str((context or {}).get("route") or "/interno"),
        role=str(((context or {}).get("profile") or {}).get("role") or ""),
        summary=title,
        context=context,
        rag_matches=rag_matches,
    )
    note_path.write_text(content, encoding="utf-8")
    return note_path


def search_obsidian_context(query: str, top_k: int = 5) -> ObsidianRagContext:
    vault_path = get_obsidian_vault_path()
    embedding_dimensions = get_local_embedding_dimensions()
    index_limit = _get_max_indexed_notes()
    if vault_path is None:
        return ObsidianRagContext(
            enabled=False,
            vault_path=None,
            memory_dir=None,
            embedding_dimensions=embedding_dimensions,
            index_limit=index_limit,
        )

    memory_dir = build_obsidian_memory_dir(vault_path)
    if memory_dir is None:
        return ObsidianRagContext(
            enabled=False,
            vault_path=str(vault_path),
            memory_dir=None,
            embedding_dimensions=embedding_dimensions,
            index_limit=index_limit,
        )

    indexed_notes = _get_cached_index(memory_dir)
    if not indexed_notes:
        return ObsidianRagContext(
            enabled=True,
            vault_path=str(vault_path),
            memory_dir=str(memory_dir),
            embedding_dimensions=embedding_dimensions,
            index_limit=index_limit,
            indexed_notes=0,
        )

    query_tokens_list = _tokenize(query)
    query_embedding = _embed_text(query, embedding_dimensions)
    query_counts = _build_token_counts(query_tokens_list)
    query_tokens = set(query_tokens_list)
    matches: list[ObsidianMatch] = []

    for indexed_note in indexed_notes.values():
        embedding_score = _cosine_similarity(query_embedding, list(indexed_note.embedding))
        lexical_score = _lexical_overlap_score(query_counts, indexed_note)
        score = (embedding_score * 0.62) + (lexical_score * 0.38)
        for token in query_tokens:
            if token in indexed_note.lowered_content:
                score += 0.08

        if score <= 0:
            continue

        matches.append(
            ObsidianMatch(
                id=Path(indexed_note.path).stem,
                title=indexed_note.title,
                path=indexed_note.path,
                score=round(score, 6),
                excerpt=indexed_note.excerpt,
                metadata={
                    "source": "obsidian",
                    "path": indexed_note.path,
                    "ranking": "lexical_plus_embedding",
                    "embedding_score": round(embedding_score, 6),
                    "lexical_score": round(lexical_score, 6),
                },
            )
        )

    matches.sort(key=lambda item: (-item.score, item.title))
    return ObsidianRagContext(
        enabled=True,
        vault_path=str(vault_path),
        memory_dir=str(memory_dir),
        matches=tuple(matches[:top_k]),
        embedding_dimensions=embedding_dimensions,
        index_limit=index_limit,
        indexed_notes=len(indexed_notes),
    )
