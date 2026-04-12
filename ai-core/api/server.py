from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Mapping

from core.coordinator import Coordinator
from adapters.obsidian_adapter import search_obsidian_context


_MAX_QUERY_LENGTH = 8_000
_DEFAULT_TIMEOUT_SECONDS = 45
_DEFAULT_LOCAL_MODEL = 'aetherlab-legal-local-v1'
_DEFAULT_CLOUD_MODEL = 'aetherlab-legal-v1'


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
    return {
        'status': 'ok',
        'default_provider': _resolve_runtime_provider({}, runtime_env),
        'providers': [local.to_public_dict(), cloud.to_public_dict()],
        'extension': extension,
    }


def _invoke_compatible_provider(config: CompatibleProviderConfig, payload: dict[str, Any]) -> dict[str, Any]:
    if not config.base_url:
        raise RuntimeError(f"Provider '{config.provider_id}' is not configured.")

    text = _normalize_message_text(payload)
    system_prompt = _get_clean(payload.get('system')) or _get_clean(payload.get('system_prompt')) or ''
    model = _get_clean(payload.get('model')) or config.model
    max_tokens = payload.get('max_tokens') or payload.get('maxTokens') or config.max_tokens
    endpoint = _join_url(config.base_url, '/v1/messages')
    if not endpoint:
        raise RuntimeError(f"Provider '{config.provider_id}' does not have a valid base URL.")

    request_payload = {
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
    }
    headers = {'x-llm-version': '2023-06-01'}
    if config.api_key:
        headers['x-api-key'] = config.api_key
    if config.auth_token:
        headers['Authorization'] = f'Bearer {config.auth_token}'
    response = _json_request(endpoint, request_payload, headers=headers)
    metadata = response.get('metadata') if isinstance(response.get('metadata'), dict) else {}
    return {
        'id': response.get('id') or f'msg_{config.provider_id}',
        'type': 'message',
        'role': 'assistant',
        'model': response.get('model') or model,
        'content': response.get('content')
        if isinstance(response.get('content'), list)
        else [{'type': 'text', 'text': response.get('message') or response.get('result') or json.dumps(response)}],
        'usage': response.get('usage') if isinstance(response.get('usage'), dict) else {},
        'request_id': response.get('request_id') or response.get('id'),
        'metadata': {
            **metadata,
            'provider': config.provider_id,
            'requested_model': model,
            'resolved_model': metadata.get('resolved_model') or response.get('model') or model,
            'route': '/v1/messages',
        },
    }


def messages_json(payload: dict[str, Any], env: Mapping[str, Any] | None = None) -> dict[str, Any]:
    runtime_env = env or os.environ
    provider_id = _resolve_runtime_provider(payload, runtime_env)
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
    endpoint = _join_url(str(extension['base_url']), '/execute')
    response = _json_request(endpoint, {'command': command, 'payload': command_payload})
    return {
        'status': 'ok',
        'extension': extension,
        'command': command,
        'result': response,
    }


def health(env: Mapping[str, Any] | None = None) -> dict[str, Any]:
    runtime_env = env or os.environ
    local = build_local_provider_config(runtime_env)
    cloud = build_cloud_provider_config(runtime_env)
    extension = build_extension_config(runtime_env)
    return {
        'status': 'ok',
        'service': 'ai-core',
        'providers': {
            'local': local.to_public_dict(),
            'cloud': cloud.to_public_dict(),
        },
        'extension': extension,
    }


def cloudflare_response(payload: dict[str, Any], status: int = 200) -> tuple[int, dict[str, str], str]:
    return status, {'Content-Type': 'application/json'}, json.dumps(payload)
