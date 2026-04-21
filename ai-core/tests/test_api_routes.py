from __future__ import annotations

import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from api.app import app
from api.routes.conversations import conversation_service
from api.routes.docs_cloudflare import docs_catalog
from tests.fixtures import TempPathsMixin


class ApiRoutesTests(TempPathsMixin):
    def setUp(self) -> None:
        super().setUp()
        self.client = TestClient(app)

    def test_conversations_round_trip(self) -> None:
        storage_dir = self.make_temp_dir('.test_tmp_conversations')
        self.set_env('AICORE_CONVERSATIONS_FILE', str(storage_dir / 'conversations.json'))
        conversation_service.cache_clear()

        created = self.client.post('/v1/conversations', json={'text': 'Primeira mensagem'}).json()
        thread_id = created['id']
        self.client.post(f'/v1/conversations/{thread_id}/messages', json={'role': 'assistant', 'text': 'Resposta'})

        listing = self.client.get('/v1/conversations').json()
        messages = self.client.get(f'/v1/conversations/{thread_id}/messages').json()

        self.assertEqual(listing['items'][0]['id'], thread_id)
        self.assertEqual(messages['total'], 2)
        self.assertEqual(messages['items'][1]['text'], 'Resposta')

    def test_cloudflare_docs_catalog_and_search(self) -> None:
        docs_dir = self.make_temp_dir('.test_tmp_cloudflare_docs')
        (docs_dir / 'Realtime llms.txt').write_text('RealtimeKit Summary Transcription Broadcast', encoding='utf-8')
        (docs_dir / 'ai-tooling.md').write_text('llms.txt markdown index for AI tooling', encoding='utf-8')
        self.set_env('AICORE_CLOUDFLARE_DOCS_DIR', str(docs_dir))
        docs_catalog.cache_clear()

        catalog = self.client.get('/v1/docs/cloudflare/catalog').json()
        search = self.client.post('/v1/docs/cloudflare/search', json={'query': 'summary transcription'}).json()

        self.assertEqual(catalog['count'], 2)
        self.assertEqual(search['count'], 1)
        self.assertEqual(Path(search['items'][0]['path']).name, 'Realtime llms.txt')
