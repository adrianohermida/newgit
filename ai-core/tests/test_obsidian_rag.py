from __future__ import annotations

import os
import shutil
import sys
import unittest
from pathlib import Path
from uuid import uuid4

AI_CORE_ROOT = Path(__file__).resolve().parents[1]
if str(AI_CORE_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_CORE_ROOT))

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
        finally:
            if original is None:
                os.environ.pop('DOTOBOT_OBSIDIAN_VAULT_PATH', None)
            else:
                os.environ['DOTOBOT_OBSIDIAN_VAULT_PATH'] = original
            shutil.rmtree(temp_vault.parent, ignore_errors=True)

    def test_search_obsidian_context_normalizes_accents(self) -> None:
        temp_vault = self._make_temp_vault()
        original = os.environ.get('DOTOBOT_OBSIDIAN_VAULT_PATH')
        try:
            os.environ['DOTOBOT_OBSIDIAN_VAULT_PATH'] = str(temp_vault)
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
        finally:
            if original is None:
                os.environ.pop('DOTOBOT_OBSIDIAN_VAULT_PATH', None)
            else:
                os.environ['DOTOBOT_OBSIDIAN_VAULT_PATH'] = original
            shutil.rmtree(temp_vault.parent, ignore_errors=True)


if __name__ == '__main__':
    unittest.main()
