from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Mapping

from core.coordinator import Coordinator
from core.command_graph import build_command_graph
from core.commands import build_command_backlog, get_executable_commands
from adapters.obsidian_adapter import get_local_embedding_config, search_obsidian_context


_MAX_QUERY_LENGTH = 8_000
_DEFAULT_TIMEOUT_SECONDS = 45
_DEFAULT_LOCAL_MODEL = 'aetherlab-legal-local-v1'
_DEFAULT_CLOUD_MODEL = 'aetherlab-legal-v1'
_LOCAL_EXTENSION_DEFAULT_ALLOWLIST = (
    'search_files',
    'open_local_file',
    'open_url',
    'run_local_command',
    'extract_page_content',
)
_OFFLINE_BLOCKED_EXTENSION_COMMANDS = frozenset(
    {
        'web_search',
        'search_web',
        'browse_web',
        'remote_fetch',
        'open_external_url',
    }
)
_OFFLINE_URL_COMMANDS = frozenset({'open_url', 'navigate', 'navigate_url'})
_DOMAIN_SKILLS = (
    {
        'id': 'legal_analysis',
        'name': 'Analise Juridica',
        'category': 'juridico',
        'surface': ('copilot', 'ai-task'),
        'offline_ready': True,
        'rag_sources': ('obsidian', 'crm'),
    },
    {
        'id': 'legal_document',
        'name': 'Elaboracao de Pecas Juridicas',
        'category': 'juridico',
        'surface': ('copilot', 'ai-task'),
        'offline_ready': True,
        'rag_sources': ('obsidian', 'processos'),
    },
    {
        'id': 'case_triage',
        'name': 'Triagem de Casos',
        'category': 'operacional',
        'surface': ('copilot', 'ai-task'),
        'offline_ready': True,
        'rag_sources': ('obsidian', 'crm'),
    },
    {
        'id': 'process_monitoring',
        'name': 'Monitoramento de Processos',
        'category': 'operacional',
        'surface': ('copilot', 'ai-task'),
        'offline_ready': False,
        'rag_sources': ('obsidian', 'publicacoes'),
    },
    {
        'id': 'data_organization',
        'name': 'Organizacao de Informacoes',
        'category': 'organizacao',
        'surface': ('copilot', 'ai-task'),
        'offline_ready': True,
        'rag_sources': ('obsidian',),
    },
    {
        'id': 'superendividamento',
        'name': 'Superendividamento e Renegociacao',
        'category': 'juridico',
        'surface': ('copilot', 'ai-task'),
        'offline_ready': True,
        'rag_sources': ('obsidian', 'crm', 'processos'),
    },
    {
        'id': 'client_summary',
        'name': 'Resumo de Cliente',
        'category': 'operacional',
        'surface': ('copilot', 'ai-task'),
        'offline_ready': True,
        'rag_sources': ('obsidian', 'crm'),
    },
    {
        'id': 'compliance_check',
        'name': 'Verificacao de Conformidade',
        'category': 'conformidade',
        'surface': ('copilot', 'ai-task'),
        'offline_ready': True,
        'rag_sources': ('obsidian', 'processos'),
    },
)

_ORCHESTRATION_CAPABILITIES = {
    'planner': True,
    'executor': True,
    'critic': True,
    'multi_agent': True,
    'multi_task': True,
    'repository_modules_context': True,
}


@dataclass(frozen=True)
class ExecuteRequest:
    query: str
    context: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class RagContextRequest:
    query: str
    context: dict[str, Any] = field(default_factory=dict)
    top_k: int = 5


@dataclass(frozen=True)
class CompatibleProviderConfig:
    provider_id: str
    label: str
    base_url: str | None
    model: str
    api_key: str | None = None
    auth_token: str | None = None
    max_tokens: int = 1400

    @property
    def configured(self) -> bool:
        return bool(self.base_url)

    def to_public_dict(self) -> dict[str, Any]:
        return {
            'id': self.provider_id,
            'label': self.label,
            'configured': self.configured,
            'available': self.configured,
            'base_url': self.base_url,
            'model': self.model,
            'auth': {
                'api_key': bool(self.api_key),
                'auth_token': bool(self.auth_token),
            },
        }


@dataclass(frozen=True)
class ProviderTransportProbe:
    endpoint: str
    mode: str
    model: str | None = None


def _is_offline_mode(env: Mapping[str, Any]) -> bool:
    _, value = _resolve_env(
        env,
        'AICORE_OFFLINE_MODE',
        'AI_CORE_OFFLINE_MODE',
        'LAWDESK_OFFLINE_MODE',
    )
    if value is None:
        return False
    return str(value).strip().lower() in {'1', 'true', 'yes', 'y', 'on'}


def _get_clean(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if (text.startswith('"') and text.endswith('"')) or (text.startswith("'") and text.endswith("'")):
        return text[1:-1].strip() or None
    return text


def _resolve_env(env: Mapping[str, Any], *keys: str, default: str | None = None) -> tuple[str | None, str | None]:
    for key in keys:
        value = _get_clean(env.get(key))
        if value:
            return key, value
    return None, default


def _int_env(env: Mapping[str, Any], *keys: str, default: int) -> int:
    _, value = _resolve_env(env, *keys)
    if value is None:
        return default
    try:
        return max(1, int(value))
    except (TypeError, ValueError):
        return default


def _join_url(base_url: str | None, suffix: str) -> str | None:
    if not base_url:
        return None
    return f'{base_url.rstrip("/")}/{suffix.lstrip("/")}'


def _is_local_url(value: Any) -> bool:
    candidate = _get_clean(value)
    if not candidate:
        return False
    normalized = candidate.lower()
    return (
        normalized.startswith('http://127.0.0.1')
        or normalized.startswith('http://localhost')
        or normalized.startswith('https://127.0.0.1')
        or normalized.startswith('https://localhost')
        or normalized.startswith('file:')
    )


def _json_request(
    url: str,
    payload: dict[str, Any],
    headers: dict[str, str] | None = None,
    timeout: int = _DEFAULT_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    request = urllib.request.Request(
        url=url,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json', **(headers or {})},
        method='POST',
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode('utf-8')
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode('utf-8', errors='replace')
        try:
            parsed = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            parsed = {'message': raw}
        message = (
            parsed.get('error', {}).get('message')
            if isinstance(parsed.get('error'), dict)
            else parsed.get('error')
        ) or parsed.get('message') or raw or f'HTTP {exc.code}'
        raise RuntimeError(str(message)) from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(str(exc.reason or exc)) from exc


def _json_get_request(
    url: str,
    headers: dict[str, str] | None = None,
    timeout: int = _DEFAULT_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    request = urllib.request.Request(
        url=url,
        headers={**(headers or {})},
        method='GET',
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode('utf-8')
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode('utf-8', errors='replace')
        try:
            parsed = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            parsed = {'message': raw}
        message = (
            parsed.get('error', {}).get('message')
            if isinstance(parsed.get('error'), dict)
            else parsed.get('error')
        ) or parsed.get('message') or raw or f'HTTP {exc.code}'
        raise RuntimeError(str(message)) from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(str(exc.reason or exc)) from exc


def _ensure_query(value: Any) -> str:
    query = str(value or '').strip()
    if not query:
        raise ValueError('query is required')
    if len(query) > _MAX_QUERY_LENGTH:
        raise ValueError(f'query exceeds maximum length of {_MAX_QUERY_LENGTH} characters')
    return query


def build_local_provider_config(env: Mapping[str, Any]) -> CompatibleProviderConfig:
    _, base_url = _resolve_env(
        env,
        'LOCAL_LLM_BASE_URL',
        'LLM_BASE_URL',
        'AICORE_LOCAL_LLM_BASE_URL',
        'LAWDESK_CODE_API_BASE_URL',
        'AICORE_API_BASE_URL',
        'DOTOBOT_PYTHON_API_BASE',
    )
    _, api_key = _resolve_env(env, 'LOCAL_LLM_API_KEY', 'LLM_API_KEY', 'AICORE_LOCAL_LLM_API_KEY')
    _, auth_token = _resolve_env(env, 'LOCAL_LLM_AUTH_TOKEN', 'LLM_AUTH_TOKEN', 'AICORE_LOCAL_LLM_AUTH_TOKEN')
    _, model = _resolve_env(env, 'LOCAL_LLM_MODEL', 'LLM_MODEL', 'AICORE_LOCAL_LLM_MODEL', default=_DEFAULT_LOCAL_MODEL)
    max_tokens = _int_env(env, 'LOCAL_LLM_MAX_TOKENS', 'LLM_MAX_TOKENS', 'AICORE_LOCAL_LLM_MAX_TOKENS', default=1400)
    return CompatibleProviderConfig(
        provider_id='local',
        label='AetherLab Local',
        base_url=base_url,
        model=model or _DEFAULT_LOCAL_MODEL,
        api_key=api_key,
        auth_token=auth_token,
        max_tokens=max_tokens,
    )


def build_cloud_provider_config(env: Mapping[str, Any]) -> CompatibleProviderConfig:
    _, base_url = _resolve_env(
        env,
        'CUSTOM_LLM_BASE_URL',
        'PROCESS_AI_BASE',
        'LAWDESK_AI_BASE_URL',
        'HMADV_RUNNER_URL',
        'AICORE_CLOUD_BASE_URL',
    )
    _, api_key = _resolve_env(env, 'CUSTOM_LLM_API_KEY', 'AICORE_CLOUD_API_KEY')
    _, auth_token = _resolve_env(
        env,
        'CUSTOM_LLM_AUTH_TOKEN',
        'HMDAV_AI_SHARED_SECRET',
        'HMADV_AI_SHARED_SECRET',
        'LAWDESK_AI_SHARED_SECRET',
        'AICORE_CLOUD_AUTH_TOKEN',
    )
    _, model = _resolve_env(
        env,
        'CUSTOM_LLM_MODEL',
        'AETHERLAB_LEGAL_MODEL',
        'CLOUDFLARE_WORKERS_AI_MODEL',
        'CF_WORKERS_AI_MODEL',
        'AICORE_CLOUD_MODEL',
        default=_DEFAULT_CLOUD_MODEL,
    )
    max_tokens = _int_env(env, 'CUSTOM_LLM_MAX_TOKENS', 'AICORE_CLOUD_MAX_TOKENS', default=1400)
    return CompatibleProviderConfig(
        provider_id='cloud',
        label='AetherLab Cloud',
        base_url=base_url,
        model=model or _DEFAULT_CLOUD_MODEL,
        api_key=api_key,
        auth_token=auth_token,
        max_tokens=max_tokens,
    )


def build_extension_config(env: Mapping[str, Any]) -> dict[str, Any]:
    _, base_url = _resolve_env(
        env,
        'UNIVERSAL_LLM_EXTENSION_BASE_URL',
        'UNIVERSAL_LLM_ASSISTANT_BASE_URL',
        'BROWSER_EXTENSION_BASE_URL',
        default='http://127.0.0.1:32123',
    )
    return {
        'enabled': bool(base_url),
        'base_url': base_url,
    }


def build_extension_profiles(env: Mapping[str, Any]) -> dict[str, Any]:
    offline_mode = _is_offline_mode(env)
    allowlist = list(_LOCAL_EXTENSION_DEFAULT_ALLOWLIST)
    return {
        'active_profile': 'offline' if offline_mode else 'online',
        'profiles': {
            'online': {
                'id': 'online',
                'label': 'Navegacao assistida',
                'web_search_enabled': True,
                'remote_urls_allowed': True,
                'local_files_enabled': True,
                'allowed_commands': allowlist + ['web_search'],
                'blocked_commands': [],
            },
            'offline': {
                'id': 'offline',
                'label': 'Modo local isolado',
                'web_search_enabled': False,
                'remote_urls_allowed': False,
                'local_files_enabled': True,
                'allowed_commands': allowlist,
                'blocked_commands': sorted(_OFFLINE_BLOCKED_EXTENSION_COMMANDS),
            },
        },
    }


def skills_json(env: Mapping[str, Any] | None = None) -> dict[str, Any]:
    runtime_env = env or os.environ
    offline_mode = _is_offline_mode(runtime_env)
    categories = sorted({item['category'] for item in _DOMAIN_SKILLS})
    return {
        'status': 'ok',
        'offline_mode': offline_mode,
        'skills': [
            {
                **item,
                'surface': list(item['surface']),
                'rag_sources': list(item['rag_sources']),
                'available': bool(item['offline_ready']) if offline_mode else True,
            }
            for item in _DOMAIN_SKILLS
        ],
        'summary': {
            'total': len(_DOMAIN_SKILLS),
            'offline_ready': sum(1 for item in _DOMAIN_SKILLS if item['offline_ready']),
            'categories': categories,
        },
    }


def capabilities_json(env: Mapping[str, Any] | None = None) -> dict[str, Any]:
    runtime_env = env or os.environ
    offline_mode = _is_offline_mode(runtime_env)
    providers = providers_json(runtime_env)
    extension = build_extension_config(runtime_env)
    extension_profiles = build_extension_profiles(runtime_env)
    command_backlog = build_command_backlog()
    command_graph = build_command_graph()
    executable_commands = get_executable_commands()
    skill_payload = skills_json(runtime_env)
    return {
        'status': 'ok',
        'offline_mode': offline_mode,
        'providers': providers['providers'],
        'skills': skill_payload['skills'],
        'skills_summary': skill_payload['summary'],
        'commands': {
            'total': len(command_backlog.modules),
            'executable': len(executable_commands),
            'builtins': len(command_graph.builtins),
            'plugin_like': len(command_graph.plugin_like),
            'skill_like': len(command_graph.skill_like),
            'preview': [module.name for module in executable_commands[:8]],
        },
        'browser_extension': {
            'enabled': bool(extension.get('enabled')),
            'base_url': extension.get('base_url'),
            'profiles': extension_profiles,
        },
        'rag': {
            'offline_primary': 'obsidian',
            'remote_disabled': offline_mode,
            'obsidian_expected': True,
            'supabase_optional': True,
            'local_embedding': get_local_embedding_config(),
        },
        'orchestration': {
            **_ORCHESTRATION_CAPABILITIES,
        },
    }


def _normalize_message_text(payload: dict[str, Any]) -> str:
    messages = payload.get('messages')
    if isinstance(messages, list):
        parts: list[str] = []
        for message in messages:
            if not isinstance(message, dict):
                continue
            content = message.get('content')
            if isinstance(content, str):
                parts.append(content.strip())
                continue
            if isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and block.get('type') == 'text':
                        text = _get_clean(block.get('text'))
                        if text:
                            parts.append(text)
        combined = '\n'.join(part for part in parts if part).strip()
        if combined:
            return combined
    return _ensure_query(payload.get('query') or payload.get('prompt') or payload.get('input'))


def _resolve_runtime_provider(payload: dict[str, Any], env: Mapping[str, Any]) -> str:
    explicit = _get_clean(payload.get('provider'))
    if explicit in {'local', 'cloud'}:
        return explicit

    model = (_get_clean(payload.get('model')) or '').lower()
    if any(token in model for token in ('cloud', 'remote')):
        return 'cloud'
    if any(token in model for token in ('local', 'ollama')):
        return 'local'

    _, default_provider = _resolve_env(env, 'AI_CORE_DEFAULT_PROVIDER', 'AICORE_DEFAULT_PROVIDER', default='local')
    return default_provider if default_provider in {'local', 'cloud'} else 'local'


def _build_provider_headers(config: CompatibleProviderConfig) -> dict[str, str]:
    headers: dict[str, str] = {}
    if config.api_key:
        headers['x-api-key'] = config.api_key
        headers.setdefault('Authorization', f'Bearer {config.api_key}')
    if config.auth_token:
        headers['Authorization'] = f'Bearer {config.auth_token}'
    return headers


def _probe_provider_transport(config: CompatibleProviderConfig) -> ProviderTransportProbe:
    if not config.base_url:
        raise RuntimeError(f"Provider '{config.provider_id}' is not configured.")

    headers = _build_provider_headers(config)
    anthropic_endpoint = _join_url(config.base_url, '/v1/messages')
    if anthropic_endpoint:
        try:
            _json_request(
                anthropic_endpoint,
                {
                    'model': config.model,
                    'max_tokens': 8,
                    'stream': False,
                    'messages': [
                        {
                            'role': 'user',
                            'content': [{'type': 'text', 'text': 'ping'}],
                        }
                    ],
                },
                headers={'x-llm-version': '2023-06-01', **headers},
                timeout=12,
            )
            return ProviderTransportProbe(endpoint=anthropic_endpoint, mode='anthropic_messages', model=config.model)
        except RuntimeError:
            pass

    openai_endpoint = _join_url(config.base_url, '/v1/models')
    if openai_endpoint:
        try:
            payload = _json_get_request(openai_endpoint, headers=headers, timeout=12)
            model = config.model
            if isinstance(payload.get('data'), list) and payload['data']:
                first = payload['data'][0]
                if isinstance(first, dict):
                    model = _get_clean(first.get('id')) or model
            return ProviderTransportProbe(
                endpoint=_join_url(config.base_url, '/v1/chat/completions') or config.base_url,
                mode='openai_chat_completions',
                model=model,
            )
        except RuntimeError:
            pass

    ollama_endpoint = _join_url(config.base_url, '/api/tags')
    if ollama_endpoint:
        try:
            payload = _json_get_request(ollama_endpoint, timeout=12)
            model = config.model
            models = payload.get('models')
            if isinstance(models, list) and models:
                first = models[0]
                if isinstance(first, dict):
                    model = _get_clean(first.get('name')) or model
            return ProviderTransportProbe(
                endpoint=_join_url(config.base_url, '/api/chat') or config.base_url,
                mode='ollama_chat',
                model=model,
            )
        except RuntimeError:
            pass

    raise RuntimeError(
        f"Provider '{config.provider_id}' did not respond as /v1/messages, /v1/models or /api/tags."
    )


def _runtime_family_from_transport(mode: str | None) -> str | None:
    if mode == 'anthropic_messages':
        return 'anthropic_compatible'
    if mode == 'openai_chat_completions':
        return 'openai_compatible'
    if mode == 'ollama_chat':
        return 'ollama'
    return None


def _provider_runtime_diagnostics(config: CompatibleProviderConfig) -> dict[str, Any]:
    diagnostics: dict[str, Any] = {
        'configured': config.configured,
        'base_url': config.base_url,
        'model': config.model,
        'runtime_family': None,
        'transport': None,
        'transport_endpoint': None,
        'reachable': False,
        'error': None,
    }
    if not config.configured:
        diagnostics['error'] = 'Provider is not configured.'
        return diagnostics
    try:
        transport = _probe_provider_transport(config)
        diagnostics.update(
            {
                'runtime_family': _runtime_family_from_transport(transport.mode),
                'transport': transport.mode,
                'transport_endpoint': transport.endpoint,
                'reachable': True,
                'resolved_model': transport.model or config.model,
            }
        )
    except RuntimeError as exc:
        diagnostics['error'] = str(exc)
    return diagnostics


def _extract_text_from_blocks(blocks: Any) -> str:
    if isinstance(blocks, str):
        return blocks
    if not isinstance(blocks, list):
        return ''
    parts: list[str] = []
    for block in blocks:
        if isinstance(block, dict):
            text = _get_clean(block.get('text'))
            if text:
                parts.append(text)
    return '\n'.join(parts).strip()


def execute_request(request: ExecuteRequest) -> dict[str, Any]:
    coordinator = Coordinator()
    outcome = coordinator.execute(query=request.query, context=request.context)
    return outcome.to_dict()


def rag_context_request(request: RagContextRequest) -> dict[str, Any]:
    rag_context = search_obsidian_context(request.query, top_k=max(1, request.top_k))
    return rag_context.to_dict()


def execute_json(payload: dict[str, Any]) -> dict[str, Any]:
    query = _ensure_query(payload.get('query'))
    context = payload.get('context') if isinstance(payload.get('context'), dict) else {}
    return execute_request(ExecuteRequest(query=query, context=context))


def rag_context_json(payload: dict[str, Any]) -> dict[str, Any]:
    query = _ensure_query(payload.get('query'))
    context = payload.get('context') if isinstance(payload.get('context'), dict) else {}
    top_k = payload.get('top_k', 5)
    try:
        top_k_int = int(top_k)
    except (TypeError, ValueError):
        top_k_int = 5
    return rag_context_request(RagContextRequest(query=query, context=context, top_k=top_k_int))


def providers_json(env: Mapping[str, Any] | None = None) -> dict[str, Any]:
    runtime_env = env or os.environ
    local = build_local_provider_config(runtime_env)
    cloud = build_cloud_provider_config(runtime_env)
    extension = build_extension_config(runtime_env)
    offline_mode = _is_offline_mode(runtime_env)
    local_diagnostics = _provider_runtime_diagnostics(local)
    return {
        'status': 'ok',
        'default_provider': 'local' if offline_mode else _resolve_runtime_provider({}, runtime_env),
        'offline_mode': offline_mode,
        'providers': [
            {
                **local.to_public_dict(),
                'diagnostics': local_diagnostics,
                'available': bool(local.configured and local_diagnostics.get('reachable')),
            },
            {
                **cloud.to_public_dict(),
                'available': False if offline_mode else cloud.configured,
                'offline_blocked': offline_mode,
            },
        ],
        'extension': extension,
        'skills_summary': skills_json(runtime_env)['summary'],
    }


def _invoke_compatible_provider(config: CompatibleProviderConfig, payload: dict[str, Any]) -> dict[str, Any]:
    if not config.base_url:
        raise RuntimeError(f"Provider '{config.provider_id}' is not configured.")

    text = _normalize_message_text(payload)
    system_prompt = _get_clean(payload.get('system')) or _get_clean(payload.get('system_prompt')) or ''
    model = _get_clean(payload.get('model')) or config.model
    max_tokens = payload.get('max_tokens') or payload.get('maxTokens') or config.max_tokens
    transport = _probe_provider_transport(config)
    resolved_model = transport.model or model
    headers = _build_provider_headers(config)

    if transport.mode == 'anthropic_messages':
        response = _json_request(
            transport.endpoint,
            {
                'model': model,
                'max_tokens': max_tokens,
                'system': system_prompt,
                'stream': False,
                'messages': [
                    {
                        'role': 'user',
                        'content': [{'type': 'text', 'text': text}],
                    }
                ],
            },
            headers={'x-llm-version': '2023-06-01', **headers},
        )
        response_content = response.get('content')
        response_model = response.get('model') or resolved_model
    elif transport.mode == 'openai_chat_completions':
        response = _json_request(
            transport.endpoint,
            {
                'model': resolved_model,
                'max_tokens': max_tokens,
                'stream': False,
                'messages': [
                    *([{'role': 'system', 'content': system_prompt}] if system_prompt else []),
                    {'role': 'user', 'content': text},
                ],
            },
            headers=headers,
        )
        choices = response.get('choices') if isinstance(response.get('choices'), list) else []
        message = choices[0].get('message') if choices and isinstance(choices[0], dict) else {}
        response_text = _get_clean(message.get('content')) or response.get('message') or response.get('result') or ''
        response_content = [{'type': 'text', 'text': response_text or json.dumps(response)}]
        response_model = response.get('model') or resolved_model
    elif transport.mode == 'ollama_chat':
        response = _json_request(
            transport.endpoint,
            {
                'model': resolved_model,
                'stream': False,
                'messages': [
                    *([{'role': 'system', 'content': system_prompt}] if system_prompt else []),
                    {'role': 'user', 'content': text},
                ],
                'options': {
                    'num_predict': max_tokens,
                },
            },
            headers=headers,
        )
        message = response.get('message') if isinstance(response.get('message'), dict) else {}
        response_text = _get_clean(message.get('content')) or response.get('response') or response.get('message') or ''
        response_content = [{'type': 'text', 'text': response_text or json.dumps(response)}]
        response_model = response.get('model') or resolved_model
    else:
        raise RuntimeError(f"Unsupported provider transport '{transport.mode}'.")

    metadata = response.get('metadata') if isinstance(response.get('metadata'), dict) else {}
    return {
        'id': response.get('id') or f'msg_{config.provider_id}',
        'type': 'message',
        'role': 'assistant',
        'model': response_model,
        'content': response_content if isinstance(response_content, list) else [{'type': 'text', 'text': _extract_text_from_blocks(response_content)}],
        'usage': response.get('usage') if isinstance(response.get('usage'), dict) else {},
        'request_id': response.get('request_id') or response.get('id'),
        'metadata': {
            **metadata,
            'provider': config.provider_id,
            'requested_model': model,
            'resolved_model': metadata.get('resolved_model') or response_model,
            'route': transport.mode,
            'transport_endpoint': transport.endpoint,
        },
    }


def messages_json(payload: dict[str, Any], env: Mapping[str, Any] | None = None) -> dict[str, Any]:
    runtime_env = env or os.environ
    provider_id = _resolve_runtime_provider(payload, runtime_env)
    if _is_offline_mode(runtime_env) and provider_id != 'local':
        raise RuntimeError(f"Offline mode is active. Provider '{provider_id}' is blocked.")
    config = build_local_provider_config(runtime_env) if provider_id == 'local' else build_cloud_provider_config(runtime_env)
    return _invoke_compatible_provider(config, payload)


def browser_execute_json(payload: dict[str, Any], env: Mapping[str, Any] | None = None) -> dict[str, Any]:
    runtime_env = env or os.environ
    extension = build_extension_config(runtime_env)
    if not extension.get('base_url'):
        raise RuntimeError('Universal LLM Assistant local extension is not configured.')

    command = _get_clean(payload.get('command'))
    command_payload = payload.get('payload') if isinstance(payload.get('payload'), dict) else {}
    if not command:
        raise ValueError('command is required')
    offline_mode = _is_offline_mode(runtime_env)
    if offline_mode and command in _OFFLINE_BLOCKED_EXTENSION_COMMANDS:
        raise RuntimeError(f"Offline mode blocks browser extension command '{command}'.")
    if offline_mode and command in _OFFLINE_URL_COMMANDS and not _is_local_url(command_payload.get('url') or command_payload.get('target')):
        raise RuntimeError('Offline mode allows only localhost or file URLs in browser navigation commands.')
    endpoint = _join_url(str(extension['base_url']), '/execute')
    response = _json_request(endpoint, {'command': command, 'payload': command_payload})
    return {
        'status': 'ok',
        'extension': extension,
        'profile': build_extension_profiles(runtime_env)['active_profile'],
        'command': command,
        'result': response,
    }


def health(env: Mapping[str, Any] | None = None) -> dict[str, Any]:
    runtime_env = env or os.environ
    local = build_local_provider_config(runtime_env)
    cloud = build_cloud_provider_config(runtime_env)
    extension = build_extension_config(runtime_env)
    offline_mode = _is_offline_mode(runtime_env)
    local_diagnostics = _provider_runtime_diagnostics(local)
    return {
        'status': 'ok',
        'service': 'ai-core',
        'offline_mode': offline_mode,
        'providers': {
            'local': {
                **local.to_public_dict(),
                'available': bool(local.configured and local_diagnostics.get('reachable')),
                'diagnostics': local_diagnostics,
            },
            'cloud': {
                **cloud.to_public_dict(),
                'available': False if offline_mode else cloud.configured,
                'offline_blocked': offline_mode,
            },
        },
        'extension': extension,
        'capabilities': {
            'skills': skills_json(runtime_env)['summary'],
            'commands': capabilities_json(runtime_env)['commands'],
            'browser_extension_profile': build_extension_profiles(runtime_env)['active_profile'],
            'orchestration': dict(_ORCHESTRATION_CAPABILITIES),
            'rag': {
                'offline_primary': 'obsidian',
                'local_embedding': get_local_embedding_config(),
            },
        },
    }


def cloudflare_response(payload: dict[str, Any], status: int = 200) -> tuple[int, dict[str, str], str]:
    return status, {'Content-Type': 'application/json'}, json.dumps(payload)
