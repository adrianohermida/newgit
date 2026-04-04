from __future__ import annotations

import os
import unittest
from pathlib import Path

from adapters.obsidian_adapter import search_obsidian_context
from core.coordinator import Coordinator
from core.memory import FileBackedLongTermMemory
from tests.fixtures import TempPathsMixin


class ObsidianRagTests(TempPathsMixin):

    def test_search_obsidian_context_scores_relevant_notes(self) -> None:
        temp_vault = self.make_temp_vault()
        self.set_env('DOTOBOT_OBSIDIAN_VAULT_PATH', str(temp_vault))
        memory_dir = temp_vault / 'Dotobot' / 'Memory'
        memory_dir.mkdir(parents=True, exist_ok=True)
        note_path = memory_dir / 'superendividamento.md'
        note_path.write_text(
            '\n'.join(
                [
                    '---',
                    'source: dotobot',
                    'title: "Superendividamento"',
                    '---',
                    '',
                    '# Query',
                    'Estrat\u00e9gia para superendividamento do cliente.',
                    '',
                    '# Answer',
                    'Mapear renda, priorizar m\u00ednimo existencial e renegociar.',
                ]
            ),
            encoding='utf-8',
        )

        context = search_obsidian_context('superendividamento estrat\u00e9gia', top_k=3)
        self.assertTrue(context.enabled)
        self.assertGreaterEqual(len(context.matches), 1)
        self.assertIn('superendividamento', context.matches[0].excerpt.lower())
        self.assertIn('estrat\u00e9gia', context.matches[0].excerpt.lower())

    def test_search_obsidian_context_normalizes_accents(self) -> None:
        temp_vault = self.make_temp_vault()
        self.set_env('DOTOBOT_OBSIDIAN_VAULT_PATH', str(temp_vault))
        memory_dir = temp_vault / 'Dotobot' / 'Memory'
        memory_dir.mkdir(parents=True, exist_ok=True)
        note_path = memory_dir / 'acao-monitoria.md'
        note_path.write_text(
            '\n'.join(
                [
                    '# Query',
                    'A\u00e7\u00e3o de monitoria processual.',
                    '',
                    '# Answer',
                    'Registrar a\u00e7\u00e3o e pr\u00f3ximos passos.',
                ]
            ),
            encoding='utf-8',
        )

        context = search_obsidian_context('acao monitoria', top_k=1)
        self.assertTrue(context.matches)
        self.assertEqual(context.matches[0].id, 'acao-monitoria')

    def test_search_obsidian_context_returns_empty_matches_when_vault_has_no_notes(self) -> None:
        temp_vault = self.make_temp_vault()
        self.set_env('DOTOBOT_OBSIDIAN_VAULT_PATH', str(temp_vault))
        memory_dir = temp_vault / 'Dotobot' / 'Memory'
        memory_dir.mkdir(parents=True, exist_ok=True)

        context = search_obsidian_context('consulta sem notas', top_k=3)

        self.assertTrue(context.enabled)
        self.assertEqual(context.matches, ())
        self.assertEqual(context.memory_dir, str(memory_dir))

    def test_search_obsidian_context_ignores_invalid_utf8_notes(self) -> None:
        temp_vault = self.make_temp_vault()
        self.set_env('DOTOBOT_OBSIDIAN_VAULT_PATH', str(temp_vault))
        memory_dir = temp_vault / 'Dotobot' / 'Memory'
        memory_dir.mkdir(parents=True, exist_ok=True)
        (memory_dir / 'broken.md').write_bytes(b'\xff\xfe\xfa\xfb')

        context = search_obsidian_context('broken note', top_k=3)

        self.assertTrue(context.enabled)
        self.assertEqual(context.matches, ())

    def test_coordinator_injects_rag_and_writes_obsidian_note(self) -> None:
        temp_vault = self.make_temp_vault()
        self.set_env('DOTOBOT_OBSIDIAN_VAULT_PATH', str(temp_vault))
        memory = FileBackedLongTermMemory(base_dir=temp_vault / '.memory_store')
        coordinator = Coordinator(memory_store=memory)
        result = coordinator.execute(
            'Resuma a estrat\u00e9gia para superendividamento e pr\u00f3ximos passos',
            context={'session_id': 'obsidian-session', 'route': '/interno/agentlab'},
        )

        self.assertEqual(result.session_id, 'obsidian-session')
        self.assertIsNotNone(result.rag)
        self.assertTrue(result.rag.enabled)
        self.assertTrue(result.rag.memory_dir)
        self.assertEqual(result.status, 'fail')

        memory_dir = temp_vault / 'Dotobot' / 'Memory'
        notes = list(memory_dir.glob('*.md'))
        self.assertTrue(notes)
        self.assertTrue(any('Query' in note.read_text(encoding='utf-8') for note in notes))
        self.assertTrue(result.steps)


if __name__ == '__main__':
    unittest.main()
