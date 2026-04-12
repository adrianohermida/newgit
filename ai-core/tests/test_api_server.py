from __future__ import annotations

import unittest
from unittest.mock import patch

from api.server import (
    capabilities_json,
    browser_execute_json,
    build_cloud_provider_config,
    build_local_provider_config,
    health,
    messages_json,
    providers_json,
    skills_json,
)


class ApiServerTests(unittest.TestCase):
    def test_build_local_provider_uses_aicore_aliases(self) -> None:
        config = build_local_provider_config(
            {
                'AICORE_API_BASE_URL': 'http://127.0.0.1:8000',
                'AICORE_LOCAL_LLM_MODEL': 'aetherlab-legal-local-v1',
            }
        )

        self.assertEqual(config.base_url, 'http://127.0.0.1:8000')
        self.assertEqual(config.model, 'aetherlab-legal-local-v1')
        self.assertTrue(config.configured)

    def test_build_cloud_provider_reuses_existing_remote_runtime(self) -> None:
        config = build_cloud_provider_config(
            {
                'PROCESS_AI_BASE': 'https://ai.hermidamaia.adv.br',
                'CUSTOM_LLM_AUTH_TOKEN': 'token',
                'CUSTOM_LLM_MODEL': 'aetherlab-legal-v1',
            }
        )

        self.assertEqual(config.base_url, 'https://ai.hermidamaia.adv.br')
        self.assertEqual(config.auth_token, 'token')
        self.assertEqual(config.model, 'aetherlab-legal-v1')

    def test_messages_json_routes_to_local_provider_by_default(self) -> None:
        with patch('api.server._json_request') as mocked_request:
            mocked_request.side_effect = [
                {
                    'id': 'probe_local',
                    'type': 'message',
                    'role': 'assistant',
                    'model': 'aetherlab-legal-local-v1',
                    'content': [{'type': 'text', 'text': 'ok'}],
                    'metadata': {'resolved_model': 'aetherlab-legal-local-v1'},
                },
                {
                    'id': 'msg_1',
                    'type': 'message',
                    'role': 'assistant',
                    'model': 'aetherlab-legal-local-v1',
                    'content': [{'type': 'text', 'text': 'Resposta local'}],
                    'metadata': {'resolved_model': 'aetherlab-legal-local-v1'},
                },
            ]

            payload = messages_json(
                {
                    'messages': [{'role': 'user', 'content': [{'type': 'text', 'text': 'Olá mundo'}]}],
                    'model': 'aetherlab-legal-local-v1',
                },
                env={'LOCAL_LLM_BASE_URL': 'http://127.0.0.1:8000'},
            )

        self.assertEqual(payload['metadata']['provider'], 'local')
        self.assertEqual(payload['content'][0]['text'], 'Resposta local')
        self.assertEqual(mocked_request.call_count, 2)

    def test_messages_json_accepts_openai_compatible_local_runtime(self) -> None:
        with patch('api.server._json_request') as mocked_request, patch('api.server._json_get_request') as mocked_get:
            mocked_request.side_effect = [
                RuntimeError('404'),
                {
                    'id': 'chatcmpl_local',
                    'model': 'llama3.1:latest',
                    'choices': [
                        {
                            'message': {
                                'role': 'assistant',
                                'content': 'Resposta via runtime OpenAI local',
                            }
                        }
                    ],
                },
            ]
            mocked_get.return_value = {
                'object': 'list',
                'data': [{'id': 'llama3.1:latest'}],
            }

            payload = messages_json(
                {
                    'messages': [{'role': 'user', 'content': [{'type': 'text', 'text': 'Ol\u00e1 local'}]}],
                    'model': 'aetherlab-legal-local-v1',
                },
                env={'LOCAL_LLM_BASE_URL': 'http://127.0.0.1:11434'},
            )

        self.assertEqual(payload['metadata']['provider'], 'local')
        self.assertEqual(payload['metadata']['route'], 'openai_chat_completions')
        self.assertEqual(payload['content'][0]['text'], 'Resposta via runtime OpenAI local')

    def test_messages_json_routes_to_cloud_provider_when_requested(self) -> None:
        with patch('api.server._json_request') as mocked_request:
            mocked_request.return_value = {
                'id': 'msg_cloud',
                'type': 'message',
                'role': 'assistant',
                'model': 'aetherlab-legal-v1',
                'content': [{'type': 'text', 'text': 'Resposta cloud'}],
                'metadata': {'resolved_model': '@cf/meta/llama-3.1-8b-instruct'},
            }

            payload = messages_json(
                {
                    'provider': 'cloud',
                    'messages': [{'role': 'user', 'content': [{'type': 'text', 'text': 'Olá cloud'}]}],
                },
                env={'CUSTOM_LLM_BASE_URL': 'https://ai.hermidamaia.adv.br'},
            )

        self.assertEqual(payload['metadata']['provider'], 'cloud')
        self.assertEqual(payload['content'][0]['text'], 'Resposta cloud')

    def test_browser_execute_uses_local_extension_endpoint(self) -> None:
        with patch('api.server._json_request') as mocked_request:
            mocked_request.return_value = {'ok': True, 'command': 'web_search'}
            result = browser_execute_json(
                {'command': 'web_search', 'payload': {'query': 'hermida maia'}},
                env={'UNIVERSAL_LLM_EXTENSION_BASE_URL': 'http://127.0.0.1:32123'},
            )

        self.assertEqual(result['status'], 'ok')
        self.assertEqual(result['command'], 'web_search')
        mocked_request.assert_called_once()

    def test_providers_and_health_expose_extension(self) -> None:
        env = {
            'LOCAL_LLM_BASE_URL': 'http://127.0.0.1:8000',
            'CUSTOM_LLM_BASE_URL': 'https://ai.hermidamaia.adv.br',
            'UNIVERSAL_LLM_EXTENSION_BASE_URL': 'http://127.0.0.1:32123',
        }
        with patch('api.server._json_request') as mocked_request:
            mocked_request.return_value = {
                'id': 'probe_local',
                'type': 'message',
                'role': 'assistant',
                'model': 'aetherlab-legal-local-v1',
                'content': [{'type': 'text', 'text': 'ok'}],
            }
            providers = providers_json(env)
            health_payload = health(env)

        self.assertEqual(providers['extension']['base_url'], 'http://127.0.0.1:32123')
        self.assertEqual(health_payload['providers']['local']['base_url'], 'http://127.0.0.1:8000')
        self.assertEqual(health_payload['providers']['cloud']['base_url'], 'https://ai.hermidamaia.adv.br')
        self.assertGreaterEqual(providers['skills_summary']['total'], 1)
        self.assertEqual(health_payload['capabilities']['browser_extension_profile'], 'online')
        self.assertEqual(providers['providers'][0]['diagnostics']['transport'], 'anthropic_messages')
        self.assertTrue(health_payload['providers']['local']['diagnostics']['reachable'])

    def test_health_reports_openai_compatible_local_runtime(self) -> None:
        env = {
            'LOCAL_LLM_BASE_URL': 'http://127.0.0.1:11434',
            'LOCAL_LLM_MODEL': 'aetherlab-legal-local-v1',
        }

        with patch('api.server._json_request') as mocked_request, patch('api.server._json_get_request') as mocked_get:
            mocked_request.side_effect = [RuntimeError('404'), RuntimeError('404')]
            mocked_get.return_value = {'object': 'list', 'data': [{'id': 'llama3.1:latest'}]}

            health_payload = health(env)

        self.assertEqual(health_payload['providers']['local']['diagnostics']['runtime_family'], 'openai_compatible')
        self.assertEqual(health_payload['providers']['local']['diagnostics']['transport'], 'openai_chat_completions')
        self.assertEqual(health_payload['providers']['local']['diagnostics']['resolved_model'], 'llama3.1:latest')

    def test_skills_and_capabilities_expose_runtime_catalog(self) -> None:
        env = {
            'AICORE_OFFLINE_MODE': 'true',
            'LOCAL_LLM_BASE_URL': 'http://127.0.0.1:8000',
        }

        skills = skills_json(env)
        capabilities = capabilities_json(env)

        self.assertEqual(skills['status'], 'ok')
        self.assertTrue(skills['offline_mode'])
        self.assertGreaterEqual(skills['summary']['total'], 1)
        self.assertIn('juridico', skills['summary']['categories'])
        self.assertEqual(capabilities['browser_extension']['profiles']['active_profile'], 'offline')
        self.assertGreaterEqual(capabilities['commands']['total'], capabilities['commands']['executable'])
        self.assertIn('offline_primary', capabilities['rag'])
        self.assertEqual(capabilities['rag']['local_embedding']['engine'], 'hashed_token_bow')
        self.assertEqual(capabilities['rag']['local_embedding']['dimensions'], 128)
        self.assertTrue(capabilities['orchestration']['multi_agent'])

    def test_local_embedding_dimensions_can_be_configured(self) -> None:
        env = {
            'AICORE_OFFLINE_MODE': 'true',
            'LOCAL_LLM_BASE_URL': 'http://127.0.0.1:8000',
            'DOTOBOT_LOCAL_EMBEDDING_DIMENSIONS': '256',
        }

        capabilities = capabilities_json(env)
        health_payload = health(env)

        self.assertEqual(capabilities['rag']['local_embedding']['dimensions'], 256)
        self.assertEqual(health_payload['capabilities']['rag']['local_embedding']['dimensions'], 256)
        self.assertTrue(health_payload['capabilities']['rag']['local_embedding']['local_only'])

    def test_offline_mode_blocks_cloud_provider(self) -> None:
        env = {
            'AICORE_OFFLINE_MODE': 'true',
            'LOCAL_LLM_BASE_URL': 'http://127.0.0.1:8000',
            'CUSTOM_LLM_BASE_URL': 'https://ai.hermidamaia.adv.br',
        }

        providers = providers_json(env)
        health_payload = health(env)

        self.assertTrue(providers['offline_mode'])
        self.assertEqual(providers['default_provider'], 'local')
        self.assertFalse(providers['providers'][1]['available'])
        self.assertTrue(health_payload['offline_mode'])
        self.assertFalse(health_payload['providers']['cloud']['available'])

        with self.assertRaises(RuntimeError):
            messages_json(
                {
                    'provider': 'cloud',
                    'messages': [{'role': 'user', 'content': [{'type': 'text', 'text': 'Ol\u00e1 cloud'}]}],
                },
                env=env,
            )

    def test_offline_mode_blocks_remote_browser_extension_commands(self) -> None:
        env = {
            'AICORE_OFFLINE_MODE': 'true',
            'UNIVERSAL_LLM_EXTENSION_BASE_URL': 'http://127.0.0.1:32123',
        }

        with self.assertRaises(RuntimeError):
            browser_execute_json(
                {'command': 'web_search', 'payload': {'query': 'Hermida Maia'}},
                env=env,
            )

        with self.assertRaises(RuntimeError):
            browser_execute_json(
                {'command': 'open_url', 'payload': {'url': 'https://example.com'}},
                env=env,
            )


if __name__ == '__main__':
    unittest.main()
