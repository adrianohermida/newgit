from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class SessionMemory:
    session_id: str
    entries: list[str] = field(default_factory=list)

    def append(self, entry: str) -> None:
        self.entries.append(entry)

    def extend(self, new_entries: list[str]) -> None:
        self.entries.extend(new_entries)

    def latest(self, limit: int = 10) -> tuple[str, ...]:
        if limit <= 0:
            return ()
        return tuple(self.entries[-limit:])

