from __future__ import annotations

import unittest
from unittest.mock import patch

from adapters.obsidian_adapter import ObsidianMatch, ObsidianRagContext
from core.coordinator.rag_fusion import merge_rag_contexts
from core.coordinator.services import DefaultRagService


def _context(source: str, title: str, score: float, path: str) -> ObsidianRagContext:
    return ObsidianRagContext(
        enabled=True,
        vault_path=source,
        memory_dir=source,
        matches=(
            ObsidianMatch(
                id=title.lower().replace(' ', '-'),
                title=title,
                path=path,
                score=score,
                excerpt=f'excerpt {title}',
                metadata={'source': source},
            ),
        ),
        vector_backend=source,
        indexed_notes=1,
        index_limit=10,
    )


class RagFusionTests(unittest.TestCase):
    def test_merge_rag_contexts_keeps_both_sources(self) -> None:
        merged = merge_rag_contexts(
            _context('supabase_pgvector', 'Prazo recurso', 0.91, 'supabase://1'),
            _context('obsidian', 'Cliente strategy', 0.77, 'D:/Obsidian/1.md'),
            top_k=4,
        )

        self.assertEqual(len(merged.matches), 2)
        self.assertEqual(merged.embedding_engine, 'hybrid_fusion')
        self.assertIn('supabase_pgvector+obsidian_hybrid_local_index', merged.vector_backend)
        self.assertEqual(merged.matches[0].metadata['fusion'], 'reciprocal_rank_plus_score')

    def test_default_rag_service_fuses_supabase_and_obsidian(self) -> None:
        supabase_context = _context('supabase_pgvector', 'Prazo recurso', 0.91, 'supabase://1')
        obsidian_context = _context('obsidian', 'Cliente strategy', 0.77, 'D:/Obsidian/1.md')

        with patch('core.coordinator.services.supabase_is_configured', return_value=True), \
             patch('core.coordinator.services.search_supabase_context', return_value=supabase_context), \
             patch('core.coordinator.services.search_obsidian_context', return_value=obsidian_context):
            result = DefaultRagService().search('prazo recurso', top_k=4)

        self.assertEqual(len(result.matches), 2)
        self.assertEqual(result.embedding_engine, 'hybrid_fusion')


if __name__ == '__main__':
    unittest.main()
