from __future__ import annotations

from dataclasses import dataclass, asdict
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

    def to_dict(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "vault_path": self.vault_path,
            "memory_dir": self.memory_dir,
            "matches": [match.to_dict() for match in self.matches],
            "error": self.error,
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


def _cosine_similarity(left: list[float], right: list[float]) -> float:
    if len(left) != len(right):
        size = min(len(left), len(right))
        left = left[:size]
        right = right[:size]
    denominator = sqrt(sum(value * value for value in left)) * sqrt(sum(value * value for value in right))
    if not denominator:
        return 0.0
    return sum(l * r for l, r in zip(left, right)) / denominator


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
    if vault_path is None:
        return ObsidianRagContext(enabled=False, vault_path=None, memory_dir=None)

    memory_dir = build_obsidian_memory_dir(vault_path)
    if memory_dir is None:
        return ObsidianRagContext(enabled=False, vault_path=str(vault_path), memory_dir=None)

    files = _collect_markdown_files(memory_dir)
    if not files:
        return ObsidianRagContext(enabled=True, vault_path=str(vault_path), memory_dir=str(memory_dir))

    query_embedding = _embed_text(query)
    query_tokens = set(_tokenize(query))
    matches: list[ObsidianMatch] = []

    for file_path in files:
        try:
            content = file_path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue

        note_embedding = _embed_text(content)
        score = _cosine_similarity(query_embedding, note_embedding)
        lowered_content = content.lower()
        for token in query_tokens:
            if token in lowered_content:
                score += 0.08

        if score <= 0:
            continue

        title = file_path.stem.replace("-", " ").replace("_", " ").strip() or file_path.stem
        excerpt = " ".join(content.split())[:300]
        matches.append(
            ObsidianMatch(
                id=file_path.stem,
                title=title,
                path=str(file_path),
                score=round(score, 6),
                excerpt=excerpt,
                metadata={"source": "obsidian", "path": str(file_path)},
            )
        )

    matches.sort(key=lambda item: (-item.score, item.title))
    return ObsidianRagContext(
        enabled=True,
        vault_path=str(vault_path),
        memory_dir=str(memory_dir),
        matches=tuple(matches[:top_k]),
    )
