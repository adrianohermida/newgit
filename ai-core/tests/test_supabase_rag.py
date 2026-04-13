"""Tests for supabase_rag_adapter — all network calls are mocked."""
from __future__ import annotations

import json
import unittest
from unittest.mock import MagicMock, patch

from adapters.supabase_rag_adapter import (
    SupabaseRagError,
    _get_embed_function,
    _get_embedding_model,
    _get_memory_table,
    generate_embedding,
    is_configured,
    search_supabase_context,
    search_by_vector,
    persist_memory,
)


class TestConfiguration(unittest.TestCase):
    def test_is_configured_false_when_no_env(self) -> None:
        with patch.dict('os.environ', {}, clear=True):
            self.assertFalse(is_configured())

    def test_is_configured_true_when_vars_set(self) -> None:
        with patch.dict('os.environ', {
            'SUPABASE_URL': 'https://example.supabase.co',
            'SUPABASE_SERVICE_ROLE_KEY': 'secret',
        }):
            self.assertTrue(is_configured())

    def test_defaults(self) -> None:
        with patch.dict('os.environ', {}, clear=True):
            self.assertEqual(_get_embed_function(), 'dotobot-embed')
            self.assertEqual(_get_embedding_model(), 'gte-small')
            self.assertEqual(_get_memory_table(), 'dotobot_memory_embeddings')


class TestGenerateEmbedding(unittest.TestCase):
    def _env(self) -> dict[str, str]:
        return {
            'SUPABASE_URL': 'https://example.supabase.co',
            'SUPABASE_SERVICE_ROLE_KEY': 'svc-key',
        }

    def test_returns_vector(self) -> None:
        expected = [0.1] * 768
        with patch.dict('os.environ', self._env()):
            with patch('adapters.supabase_rag_adapter._post', return_value={'ok': True, 'embedding': expected}) as mock_post:
                result = generate_embedding('hello world')
        self.assertEqual(result, expected)
        mock_post.assert_called_once()
        call_url = mock_post.call_args[0][0]
        self.assertIn('dotobot-embed', call_url)

    def test_raises_on_missing_embedding_key(self) -> None:
        with patch.dict('os.environ', self._env()):
            with patch('adapters.supabase_rag_adapter._post', return_value={'ok': True}):
                with self.assertRaises(SupabaseRagError):
                    generate_embedding('test')

    def test_raises_when_unconfigured(self) -> None:
        with patch.dict('os.environ', {}, clear=True):
            with self.assertRaises(SupabaseRagError):
                generate_embedding('test')

    def test_includes_embed_secret_header(self) -> None:
        env = {**self._env(), 'DOTOBOT_SUPABASE_EMBED_SECRET': 'my-secret'}
        captured: list[dict] = []

        def fake_post(url: str, payload: dict, headers: dict, timeout: float = 15.0) -> dict:
            captured.append(headers)
            return {'embedding': [0.0] * 768}

        with patch.dict('os.environ', env):
            with patch('adapters.supabase_rag_adapter._post', side_effect=fake_post):
                generate_embedding('hello')

        self.assertEqual(captured[0].get('x-dotobot-embed-secret'), 'my-secret')


class TestSearchByVector(unittest.TestCase):
    def _env(self) -> dict[str, str]:
        return {
            'SUPABASE_URL': 'https://example.supabase.co',
            'SUPABASE_SERVICE_ROLE_KEY': 'svc-key',
        }

    def _fake_rows(self) -> list[dict]:
        return [
            {
                'id': 'abc',
                'source_key': 'src-1',
                'session_id': 'sess-1',
                'query': 'What is the deadline?',
                'response_text': 'The deadline is Friday.',
                'similarity': 0.92,
                'route': '/interno',
                'role': 'advogado',
                'metadata': {},
            }
        ]

    def test_returns_matches(self) -> None:
        with patch.dict('os.environ', self._env()):
            with patch('adapters.supabase_rag_adapter._post', return_value=self._fake_rows()):
                results = search_by_vector([0.1] * 768, top_k=5)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].query, 'What is the deadline?')
        self.assertAlmostEqual(results[0].similarity, 0.92)

    def test_raises_on_non_list_response(self) -> None:
        with patch.dict('os.environ', self._env()):
            with patch('adapters.supabase_rag_adapter._post', return_value={'error': 'oops'}):
                with self.assertRaises(SupabaseRagError):
                    search_by_vector([0.1] * 768)


class TestSearchSupabaseContext(unittest.TestCase):
    def test_returns_disabled_when_unconfigured(self) -> None:
        with patch.dict('os.environ', {}, clear=True):
            ctx = search_supabase_context('test query')
        self.assertFalse(ctx.enabled)
        self.assertIsNotNone(ctx.error)

    def test_returns_enabled_with_matches(self) -> None:
        fake_embedding = [0.1] * 768
        fake_rows = [
            {
                'id': 'x1',
                'source_key': 'k1',
                'session_id': 'sess',
                'query': 'prazo recurso',
                'response_text': '15 dias',
                'similarity': 0.88,
                'metadata': {},
            }
        ]
        env = {
            'SUPABASE_URL': 'https://example.supabase.co',
            'SUPABASE_SERVICE_ROLE_KEY': 'svc-key',
        }
        with patch.dict('os.environ', env):
            with patch('adapters.supabase_rag_adapter.generate_embedding', return_value=fake_embedding):
                with patch('adapters.supabase_rag_adapter.search_by_vector', return_value=[]):
                    # Patch search_memory which calls generate_embedding + search_by_vector
                    with patch('adapters.supabase_rag_adapter.search_memory', return_value=[]):
                        ctx = search_supabase_context('prazo recurso')
        self.assertTrue(ctx.enabled)
        self.assertIn('supabase', ctx.vault_path or '')

    def test_returns_disabled_on_error(self) -> None:
        env = {
            'SUPABASE_URL': 'https://example.supabase.co',
            'SUPABASE_SERVICE_ROLE_KEY': 'svc-key',
        }
        with patch.dict('os.environ', env):
            with patch('adapters.supabase_rag_adapter.search_memory', side_effect=SupabaseRagError('timeout')):
                ctx = search_supabase_context('test')
        self.assertFalse(ctx.enabled)
        self.assertIn('timeout', ctx.error or '')


class TestPersistMemory(unittest.TestCase):
    def _env(self) -> dict[str, str]:
        return {
            'SUPABASE_URL': 'https://example.supabase.co',
            'SUPABASE_SERVICE_ROLE_KEY': 'svc-key',
        }

    def test_persist_generates_source_key(self) -> None:
        with patch.dict('os.environ', self._env()):
            with patch('adapters.supabase_rag_adapter.generate_embedding', return_value=[0.0] * 768):
                with patch('adapters.supabase_rag_adapter._post', return_value={}):
                    key = persist_memory(
                        query='What is the deadline?',
                        response_text='Friday',
                        session_id='sess-abc',
                    )
        self.assertIsInstance(key, str)
        self.assertEqual(len(key), 64)  # sha256 hex digest

    def test_persist_skips_embedding_when_provided(self) -> None:
        embedding = [0.5] * 768
        with patch.dict('os.environ', self._env()):
            with patch('adapters.supabase_rag_adapter.generate_embedding') as mock_embed:
                with patch('adapters.supabase_rag_adapter._post', return_value={}):
                    persist_memory(
                        query='q',
                        response_text='r',
                        session_id='s',
                        embedding=embedding,
                    )
        mock_embed.assert_not_called()


if __name__ == '__main__':
    unittest.main()
