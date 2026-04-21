from __future__ import annotations

import os
from pathlib import Path


class CloudflareDocsCatalog:
    def __init__(self, root_dir: Path) -> None:
        self.root_dir = root_dir

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> 'CloudflareDocsCatalog':
        source = env or os.environ
        configured = source.get('AICORE_CLOUDFLARE_DOCS_DIR') or source.get('CLOUDFLARE_DOCS_DIR')
        root_dir = Path(configured) if configured else Path('D:/Downloads/cloudflare')
        return cls(root_dir)

    def catalog(self) -> list[dict[str, str]]:
        if not self.root_dir.exists():
            return []
        files = sorted(
            path for path in self.root_dir.iterdir() if path.is_file() and path.suffix.lower() in {'.md', '.txt'}
        )
        return [{'id': path.stem, 'name': path.name, 'path': str(path)} for path in files]

    def search(self, query: str, limit: int = 5) -> list[dict[str, str | int]]:
        terms = [term for term in query.lower().split() if len(term) > 1]
        if not terms:
            return []
        matches: list[tuple[int, dict[str, str | int]]] = []
        for item in self.catalog():
            text = Path(str(item['path'])).read_text(encoding='utf-8', errors='ignore')
            lowered = text.lower()
            score = sum(lowered.count(term) * max(2, len(term)) for term in terms)
            if score <= 0:
                continue
            snippet = self._snippet(text, next((term for term in terms if term in lowered), terms[0]))
            matches.append((score, {'score': score, **item, 'snippet': snippet}))
        matches.sort(key=lambda entry: entry[0], reverse=True)
        return [item for _, item in matches[: max(1, limit)]]

    def _snippet(self, text: str, term: str) -> str:
        lowered = text.lower()
        index = max(0, lowered.find(term))
        start = max(0, index - 140)
        end = min(len(text), index + 260)
        return ' '.join(text[start:end].split())
