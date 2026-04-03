from __future__ import annotations

import os
import shutil
import unittest
from pathlib import Path
from uuid import uuid4

from adapters.obsidian_adapter import search_obsidian_context
from core.coordinator import Coordinator
from core.memory import FileBackedLongTermMemory


class ObsidianRagTests(unittest.TestCase):
    def _make_temp_vault(self) -> Path:
        root = Path('.test_tmp_obsidian')
        root.mkdir(parents=True, exist_ok=True)
        target = root / uuid4().hex
        target.mkdir(parents=True, exist_ok=True)
        return target

    def test_search_obsidian_context_scores_relevant_notes(self) -> None:
        temp_vault = self._make_temp_vault()
        original = os.environ.get('DOTOBOT_OBSIDIAN_VAULT_PATH')
        try:
            os.environ['DOTOBOT_OBSIDIAN_VAULT_PATH'] = str(temp_vault)
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
                        'Estratégia para superendividamento do cliente.',
                        '',
                        '# Answer',
                        'Mapear renda, priorizar mínimo existencial e renegociar.',
                    ]
                ),
                encoding='utf-8',
            )

            context = search_obsidian_context('superendividamento estratégia', top_k=3)
            self.assertTrue(context.enabled)
            self.assertGreaterEqual(len(context.matches), 1)
            self.assertIn('superendividamento', context.matches[0].excerpt.lower())
        finally:
            if original is None:
                os.environ.pop('DOTOBOT_OBSIDIAN_VAULT_PATH', None)
            else:
                os.environ['DOTOBOT_OBSIDIAN_VAULT_PATH'] = original
            shutil.rmtree(temp_vault.parent, ignore_errors=True)

    def test_coordinator_injects_rag_and_writes_obsidian_note(self) -> None:
        temp_vault = self._make_temp_vault()
        original = os.environ.get('DOTOBOT_OBSIDIAN_VAULT_PATH')
        try:
            os.environ['DOTOBOT_OBSIDIAN_VAULT_PATH'] = str(temp_vault)
            memory = FileBackedLongTermMemory(base_dir=temp_vault / '.memory_store')
            coordinator = Coordinator(memory_store=memory)
            result = coordinator.execute(
                'Resuma a estrategia para superendividamento e próximos passos',
                context={'session_id': 'obsidian-session', 'route': '/interno/agentlab'},
            )

            self.assertEqual(result.session_id, 'obsidian-session')
            self.assertIsNotNone(result.rag)
            self.assertTrue(result.rag and result.rag.get('enabled'))
            self.assertTrue(result.rag and result.rag.get('memory_dir'))

            memory_dir = temp_vault / 'Dotobot' / 'Memory'
            notes = list(memory_dir.glob('*.md'))
            self.assertTrue(notes)
            self.assertTrue(any('Query' in note.read_text(encoding='utf-8') for note in notes))
            self.assertTrue(result.steps)
        finally:
            if original is None:
                os.environ.pop('DOTOBOT_OBSIDIAN_VAULT_PATH', None)
            else:
                os.environ['DOTOBOT_OBSIDIAN_VAULT_PATH'] = original
            shutil.rmtree(temp_vault.parent, ignore_errors=True)


if __name__ == '__main__':
    unittest.main()
