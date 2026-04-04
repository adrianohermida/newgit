from __future__ import annotations
from typing import List

class SessionHistory:
    """Gerencia o histórico de sessões do assistente."""
    def __init__(self):
        self._history: List[str] = []

    def add_message(self, message: str) -> None:
        self._history.append(message)

    def get_history(self) -> list[str]:
        return list(self._history)

    def clear(self) -> None:
        self._history.clear()
