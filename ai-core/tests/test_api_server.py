from __future__ import annotations

import unittest
from unittest.mock import patch
from adapters.obsidian_adapter import ObsidianMatch, ObsidianRagContext

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
                'AICORE_LOCAL_LLM_BASE_URL': 'http://127.0.0.1:11434',
                'AICORE_LOCAL_LLM_MODEL': 'aetherlab-legal-local-v1',
            }
        )

        self.assertEqual(config.base_url, 'http://127.0.0.1:11434')
        self.assertEqual(config.model, 'aetherlab-legal-local-v1')
        self.assertTrue(config.configured)
        self.assertEqual(config.max_tokens, 512)

    def test_build_local_provider_uses_low_resource_defaults_when_offline(self) -> None:
        config = build_local_provider_config(
            {
                'AICORE_LOCAL_LLM_BASE_URL': 'http://127.0.0.1:11434',
                'AICORE_LOCAL_LLM_MODEL': 'aetherlab-legal-local-v1',
                'AICORE_OFFLINE_MODE': 'true',
            }
        )

        self.assertEqual(config.max_tokens, 160)

    def test_build_local_provider_prefers_aicore_runtime_over_generic_local_alias(self) -> None:
        config = build_local_provider_config(
            {
                'LOCAL_LLM_BASE_URL': 'http://127.0.0.1:8000',
                'LOCAL_LLM_MODEL': 'wrong-model',
                'AICORE_LOCAL_LLM_BASE_URL': 'http://127.0.0.1:11434',
                'AICORE_LOCAL_LLM_MODEL': 'aetherlab-legal-local-v1',
            }
        )

        self.assertEqual(config.base_url, 'http://127.0.0.1:11434')
        self.assertEqual(config.model, 'aetherlab-legal-local-v1')

    def test_build_local_provider_can_disable_low_resource_defaults(self) -> None:
        config = build_local_provider_config(
            {
                'AICORE_LOCAL_LLM_BASE_URL': 'http://127.0.0.1:11434',
                'AICORE_LOCAL_LLM_MODEL': 'aetherlab-legal-local-v1',
                'AICORE_LOCAL_LOW_RESOURCE_MODE': 'false',
            }
        )

        self.assertEqual(config.max_tokens, 512)

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
        self.assertEqual(payload['metadata']['performance_profile'], 'standard')

    def test_messages_json_uses_low_resource_profile_by_default_for_local(self) -> None:
        with patch('api.server._json_request') as mocked_request, patch('api.server._json_get_request') as mocked_get:
            mocked_request.return_value = {
                'id': 'chatcmpl_local',
                'model': 'aetherlab-legal-local-v1:latest',
                'choices': [
                    {
                        'message': {
                            'role': 'assistant',
                            'content': 'Resposta enxuta local',
                        }
                    }
                ],
            }
            mocked_get.return_value = {
                'object': 'list',
                'data': [{'id': 'aetherlab-legal-local-v1:latest'}],
            }

            payload = messages_json(
                {
                    'messages': [
                        {'role': 'user', 'content': [{'type': 'text', 'text': 'mensagem 1'}]},
                        {'role': 'assistant', 'content': [{'type': 'text', 'text': 'mensagem 2'}]},
                        {'role': 'user', 'content': [{'type': 'text', 'text': 'mensagem 3'}]},
                        {'role': 'assistant', 'content': [{'type': 'text', 'text': 'mensagem 4'}]},
                        {'role': 'user', 'content': [{'type': 'text', 'text': 'mensagem 5'}]},
                    ],
                    'model': 'aetherlab-legal-local-v1',
                    'max_tokens': 1200,
                },
                env={
                    'AICORE_LOCAL_LLM_BASE_URL': 'http://127.0.0.1:11434',
                    'AICORE_LOCAL_LOW_RESOURCE_MODE': 'true',
                },
            )

        self.assertEqual(payload['metadata']['performance_profile'], 'low_resource')
        self.assertEqual(payload['metadata']['effective_max_tokens'], 96)
        self.assertEqual(payload['metadata']['history_messages_used'], 3)

    def test_messages_json_enriches_local_chat_with_session_memory_and_hybrid_rag(self) -> None:
        with patch('api.server._json_request') as mocked_request, \
             patch('api.server._json_get_request') as mocked_get, \
             patch('api.server.FileBackedLongTermMemory.load') as mocked_load, \
             patch('api.server.search_supabase_context') as mocked_supabase, \
             patch('api.server.search_obsidian_context') as mocked_obsidian:
            mocked_request.return_value = {
                'id': 'chatcmpl_local',
                'model': 'aetherlab-legal-local-v1:latest',
                'choices': [
                    {
                        'message': {
                            'role': 'assistant',
                            'content': 'Resposta com memoria',
                        }
                    }
                ],
            }
            mocked_get.return_value = {
                'object': 'list',
                'data': [{'id': 'aetherlab-legal-local-v1:latest'}],
            }
            mocked_load.return_value.entries = (
                'user_query: revisar acordo',
                'final_output: prazo informado de 15 dias',
            )
            mocked_supabase.return_value = ObsidianRagContext(
                    enabled=True,
                    vault_path='supabase://dotobot_memory_embeddings',
                    memory_dir=None,
                    matches=(
                        ObsidianMatch(
                            id='supa-1',
                            title='Prazo recurso',
                            path='supabase://1',
                            score=0.9,
                            excerpt='prazo de 15 dias encontrado',
                            metadata={'source': 'supabase_pgvector'},
                        ),
                    ),
                    vector_backend='supabase_pgvector',
            )
            mocked_obsidian.return_value = ObsidianRagContext(
                enabled=True,
                vault_path='D:/Obsidian/hermidamaia',
                memory_dir='D:/Obsidian/hermidamaia/Dotobot/Memory',
                matches=(
                    ObsidianMatch(
                        id='obs-1',
                        title='Cliente Maia',
                        path='D:/Obsidian/hermidamaia/Dotobot/Memory/cliente-maia.md',
                        score=0.7,
                        excerpt='cliente com acordo anterior relevante',
                        metadata={'source': 'obsidian'},
                    ),
                ),
                vector_backend='obsidian_hybrid_local_index',
            )

            payload = messages_json(
                {
                    'messages': [{'role': 'user', 'content': [{'type': 'text', 'text': 'qual o prazo do acordo?'}]}],
                    'model': 'aetherlab-legal-local-v1',
                    'sessionId': 'sess_test_memory',
                },
                env={
                    'AICORE_LOCAL_LLM_BASE_URL': 'http://127.0.0.1:11434',
                    'AICORE_LOCAL_LOW_RESOURCE_MODE': 'true',
                },
            )

        self.assertEqual(payload['metadata']['session_id'], 'sess_test_memory')
        self.assertGreaterEqual(payload['metadata']['conversation_turns_used'], 1)
        self.assertEqual(payload['metadata']['memory_entries_used'], 2)
        self.assertGreaterEqual(payload['metadata']['rag_matches_used'], 1)
        self.assertIn('obsidian', payload['metadata']['rag_sources'])

    def test_probe_prefers_openai_chat_when_model_catalog_is_empty(self) -> None:
        with patch('api.server._json_request') as mocked_request, patch('api.server._json_get_request') as mocked_get:
            mocked_request.side_effect = [
                RuntimeError('404'),
                {
                    'id': 'chatcmpl_local',
                    'model': 'aetherlab-legal-local-v1:latest',
                    'choices': [
                        {
                            'message': {
                                'role': 'assistant',
                                'content': 'ok',
                            }
                        }
                    ],
                },
            ]
            mocked_get.return_value = {'object': 'list', 'data': None}

            payload = messages_json(
                {
                    'messages': [{'role': 'user', 'content': [{'type': 'text', 'text': 'Olá local'}]}],
                    'model': 'aetherlab-legal-local-v1',
                },
                env={'AICORE_LOCAL_LLM_BASE_URL': 'http://127.0.0.1:11434'},
            )

        self.assertEqual(payload['metadata']['route'], 'openai_chat_completions')
        self.assertEqual(payload['metadata']['resolved_model'], 'aetherlab-legal-local-v1:latest')

    def test_messages_json_falls_back_to_degraded_execute_when_local_model_runs_out_of_memory(self) -> None:
        with patch('api.server._json_request') as mocked_request, patch('api.server._json_get_request') as mocked_get:
            mocked_request.side_effect = RuntimeError('model requires more system memory (20.3 GiB) than is available (12.5 GiB)')
            mocked_get.return_value = {
                'object': 'list',
                'data': [{'id': 'llama3.1:latest'}],
            }

            payload = messages_json(
                {
                    'messages': [{'role': 'user', 'content': [{'type': 'text', 'text': 'Olá local'}]}],
                    'model': 'aetherlab-legal-local-v1',
                    'context': {'route': '/interno/copilot'},
                },
                env={'LOCAL_LLM_BASE_URL': 'http://127.0.0.1:11434'},
            )

        self.assertEqual(payload['metadata']['provider'], 'local')
        self.assertEqual(payload['metadata']['route'], 'degraded_execute_fallback')
        self.assertTrue(payload['metadata']['degraded'])
        self.assertIn('modo degradado', payload['content'][0]['text'].lower())

    def test_degraded_local_fallback_hides_raw_unimplemented_tool_error(self) -> None:
        with patch('api.server._json_request') as mocked_request, patch('api.server._json_get_request') as mocked_get:
            mocked_request.side_effect = RuntimeError('model requires more system memory (20.3 GiB) than is available (12.5 GiB)')
            mocked_get.return_value = {
                'object': 'list',
                'data': [{'id': 'llama3.1:latest'}],
            }

            payload = messages_json(
                {
                    'messages': [{'role': 'user', 'content': [{'type': 'text', 'text': 'OK'}]}],
                    'model': 'aetherlab-legal-local-v1',
                },
                env={'LOCAL_LLM_BASE_URL': 'http://127.0.0.1:11434'},
            )

        self.assertIn('modo seguro ativo', payload['content'][0]['text'].lower())
        self.assertNotIn('NotebookEditTool', payload['content'][0]['text'])

    def test_messages_json_raises_when_local_model_is_not_found(self) -> None:
        with patch('api.server._json_request') as mocked_request, patch('api.server._json_get_request') as mocked_get:
            mocked_request.side_effect = RuntimeError("model 'aetherlab-legal-local-v1' not found")
            mocked_get.return_value = {
                'object': 'list',
                'data': None,
            }

            with self.assertRaises(RuntimeError):
                messages_json(
                    {
                        'messages': [{'role': 'user', 'content': [{'type': 'text', 'text': 'prazo recurso'}]}],
                        'model': 'aetherlab-legal-local-v1',
                    },
                    env={'LOCAL_LLM_BASE_URL': 'http://127.0.0.1:11434'},
                )

    def test_messages_json_prefers_runtime_catalog_model_when_local_alias_is_unavailable(self) -> None:
        with patch('api.server._json_request') as mocked_request, patch('api.server._json_get_request') as mocked_get:
            mocked_request.return_value = {
                'id': 'chatcmpl_local',
                'model': 'llama3.1:latest',
                'choices': [
                    {
                        'message': {
                            'role': 'assistant',
                            'content': 'Resposta do runtime real',
                        }
                    }
                ],
            }
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
        self.assertEqual(payload['metadata']['effective_model'], 'llama3.1:latest')
        self.assertEqual(payload['metadata']['resolved_model'], 'llama3.1:latest')
        self.assertEqual(payload['content'][0]['text'], 'Resposta do runtime real')

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
        self.assertEqual(capabilities['rag']['local_embedding']['ranking'], 'lexical_plus_embedding')
        self.assertEqual(capabilities['rag']['local_vector_index']['backend'], 'obsidian_hybrid_local_index')
        self.assertEqual(capabilities['rag']['local_vector_index']['ranking'], 'lexical_plus_embedding')
        self.assertEqual(capabilities['persistence']['mode'], 'obsidian_only')
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
        self.assertEqual(health_payload['capabilities']['rag']['local_vector_index']['backend'], 'obsidian_hybrid_local_index')

    def test_persistence_reports_local_supabase_contract_when_configured(self) -> None:
        env = {
            'AICORE_OFFLINE_MODE': 'true',
            'LOCAL_LLM_BASE_URL': 'http://127.0.0.1:8000',
            'SUPABASE_URL': 'http://127.0.0.1:54321',
            'SUPABASE_SERVICE_ROLE_KEY': 'local-service-role',
            'NEXT_PUBLIC_SUPABASE_ANON_KEY': 'local-anon',
        }

        capabilities = capabilities_json(env)
        health_payload = health(env)

        self.assertEqual(capabilities['persistence']['mode'], 'local_structured_configured')
        self.assertEqual(capabilities['persistence']['base_url_kind'], 'local')
        self.assertTrue(capabilities['persistence']['structured_configured'])
        self.assertTrue(health_payload['persistence']['local_ready'])
        self.assertEqual(health_payload['capabilities']['persistence']['anon_key_source'], 'NEXT_PUBLIC_SUPABASE_ANON_KEY')

    def test_persistence_blocks_remote_supabase_in_offline_mode(self) -> None:
        env = {
            'AICORE_OFFLINE_MODE': 'true',
            'LOCAL_LLM_BASE_URL': 'http://127.0.0.1:8000',
            'SUPABASE_URL': 'https://example.supabase.co',
            'SUPABASE_SERVICE_ROLE_KEY': 'remote-service-role',
        }

        capabilities = capabilities_json(env)
        health_payload = health(env)

        self.assertEqual(capabilities['persistence']['mode'], 'remote_blocked_offline')
        self.assertTrue(capabilities['persistence']['remote_blocked'])
        self.assertEqual(health_payload['capabilities']['persistence']['base_url_kind'], 'remote')

    def test_persistence_ignores_placeholder_supabase_keys(self) -> None:
        env = {
            'AICORE_OFFLINE_MODE': 'true',
            'LOCAL_LLM_BASE_URL': 'http://127.0.0.1:8000',
            'SUPABASE_URL': 'http://127.0.0.1:54321',
            'SUPABASE_SERVICE_ROLE_KEY': '<service-role-local>',
            'NEXT_PUBLIC_SUPABASE_ANON_KEY': '<anon-local>',
        }

        capabilities = capabilities_json(env)
        health_payload = health(env)

        self.assertEqual(capabilities['persistence']['mode'], 'local_structured_partial')
        self.assertFalse(capabilities['persistence']['structured_configured'])
        self.assertFalse(health_payload['persistence']['local_ready'])

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
