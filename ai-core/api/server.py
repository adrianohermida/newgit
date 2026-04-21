from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Mapping

from core.coordinator import Coordinator
from core.command_graph import build_command_graph
from core.commands import build_command_backlog, get_executable_commands
from core.memory import FileBackedLongTermMemory
from adapters.obsidian_adapter import get_local_vector_index_config, search_obsidian_context
from adapters.supabase_rag_adapter import is_configured as supabase_rag_is_configured, search_supabase_context
from core.coordinator.rag_fusion import merge_rag_contexts


_MAX_QUERY_LENGTH = 8_000
_DEFAULT_TIMEOUT_SECONDS = 45
_LOCAL_PROVIDER_TIMEOUT_SECONDS = 180
_DEFAULT_LOCAL_MODEL = 'aetherlab-legal-local-v1'
_DEFAULT_CLOUD_MODEL = 'aetherlab-legal-v1'
_DEFAULT_LOCAL_MAX_TOKENS = 512
_DEFAULT_LOCAL_FAST_MAX_TOKENS = 160
_DEFAULT_LOCAL_HISTORY_LIMIT = 3
_DEFAULT_LOCAL_TEXT_LIMIT = 1_200
_DEFAULT_LOCAL_SYSTEM_LIMIT = 320
_DEFAULT_LOCAL_RAG_TOP_K = 2
_DEFAULT_LOCAL_MEMORY_ITEMS = 3
_DEFAULT_LOCAL_MEMORY_LINE_LIMIT = 90
_DEFAULT_LOCAL_AUGMENT_LIMIT = 480
_DEFAULT_LOCAL_CONVERSATION_SUMMARY_LIMIT = 320
_DEFAULT_LOCAL_SIMPLE_MAX_TOKENS = 96
_DEFAULT_LOCAL_SIMPLE_RAG_TOP_K = 1
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


_TRANSPORT_PROBE_CACHE: dict[tuple[str, str, str], tuple[float, ProviderTransportProbe]] = {}
_TRANSPORT_PROBE_TTL_SECONDS = 45.0
_PROVIDER_DEBUG_LOG_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), '..', '.runtime-logs', 'ai-core-provider.log')


def _append_provider_debug(event: str, payload: dict[str, Any]) -> None:
    try:
        os.makedirs(os.path.dirname(_PROVIDER_DEBUG_LOG_PATH), exist_ok=True)
        with open(_PROVIDER_DEBUG_LOG_PATH, 'a', encoding='utf-8') as fh:
            fh.write(json.dumps({'at': time.time(), 'event': event, **payload}, ensure_ascii=False) + '\n')
    except Exception:
        pass


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


def _is_local_low_resource_mode(env: Mapping[str, Any]) -> bool:
    _, value = _resolve_env(
        env,
        'AICORE_LOCAL_LOW_RESOURCE_MODE',
        'LOCAL_LLM_LOW_RESOURCE_MODE',
        'AICORE_LOW_RESOURCE_MODE',
    )
    if value is None:
        return _is_offline_mode(env)
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


def _is_placeholder_config(value: Any) -> bool:
    text = str(value or '').strip().lower()
    if not text:
        return True
    return any(marker in text for marker in ('<', 'changeme', 'placeholder', 'anon-local', 'service-role-local'))


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


def _local_embedding_config(env: Mapping[str, Any]) -> dict[str, Any]:
    return {
        'engine': 'hashed_token_bow',
        'dimensions': _int_env(env, 'DOTOBOT_LOCAL_EMBEDDING_DIMENSIONS', 'AICORE_LOCAL_EMBEDDING_DIMENSIONS', default=128),
        'local_only': True,
        'supports_network': False,
        'ranking': 'lexical_plus_embedding',
    }


def _url_kind(value: Any) -> str:
    candidate = _get_clean(value)
    if not candidate:
        return 'unconfigured'
    return 'local' if _is_local_url(candidate) else 'remote'


def _persistence_config(env: Mapping[str, Any]) -> dict[str, Any]:
    offline_mode = _is_offline_mode(env)
    supabase_url_key, supabase_url = _resolve_env(env, 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL')
    service_key_key, service_key = _resolve_env(env, 'SUPABASE_SERVICE_ROLE_KEY')
    anon_key_key, anon_key = _resolve_env(env, 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY')
    if _is_placeholder_config(supabase_url):
        supabase_url = None
    if _is_placeholder_config(service_key):
        service_key = None
    if _is_placeholder_config(anon_key):
        anon_key = None
    base_url_kind = _url_kind(supabase_url)
    structured_configured = bool(supabase_url and service_key)
    browser_configured = bool(supabase_url and anon_key)

    if not supabase_url:
        mode = 'obsidian_only'
        detail = 'Sem Supabase configurado; o offline usa somente Obsidian como memoria primária.'
    elif offline_mode and base_url_kind == 'remote':
        mode = 'remote_blocked_offline'
        detail = 'Modo offline ativo com SUPABASE_URL remota. Persistencia estruturada remota deve permanecer bloqueada.'
    elif base_url_kind == 'local' and structured_configured:
        mode = 'local_structured_configured'
        detail = 'Supabase local configurado para persistencia estruturada de sessoes, runs e memoria.'
    elif base_url_kind == 'local':
        mode = 'local_structured_partial'
        detail = 'SUPABASE_URL local detectada, mas ainda faltam chaves para fechar a persistencia estruturada.'
    elif structured_configured:
        mode = 'remote_structured_configured'
        detail = 'Persistencia estruturada configurada, mas ainda depende de um Supabase remoto.'
    else:
        mode = 'remote_structured_partial'
        detail = 'SUPABASE_URL remota detectada sem contrato completo de persistencia.'

    return {
        'mode': mode,
        'offline_mode': offline_mode,
        'base_url': supabase_url,
        'base_url_kind': base_url_kind,
        'base_url_source': supabase_url_key,
        'service_role_configured': bool(service_key),
        'service_role_source': service_key_key,
        'anon_key_configured': bool(anon_key),
        'anon_key_source': anon_key_key,
        'structured_configured': structured_configured,
        'browser_configured': browser_configured,
        'local_ready': bool(base_url_kind == 'local' and structured_configured),
        'remote_blocked': bool(offline_mode and base_url_kind == 'remote'),
        'detail': detail,
        'recommended_envs': {
            'url': 'SUPABASE_URL',
            'service_role': 'SUPABASE_SERVICE_ROLE_KEY',
            'anon': 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        },
    }


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
    except (TimeoutError, OSError) as exc:
        raise RuntimeError(str(exc)) from exc


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
    except (TimeoutError, OSError) as exc:
        raise RuntimeError(str(exc)) from exc


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
        'AICORE_LOCAL_LLM_BASE_URL',
        'LOCAL_LLM_BASE_URL',
        'LLM_BASE_URL',
        'LAWDESK_CODE_API_BASE_URL',
        'AICORE_API_BASE_URL',
        'DOTOBOT_PYTHON_API_BASE',
    )
    _, api_key = _resolve_env(env, 'LOCAL_LLM_API_KEY', 'LLM_API_KEY', 'AICORE_LOCAL_LLM_API_KEY')
    _, auth_token = _resolve_env(env, 'LOCAL_LLM_AUTH_TOKEN', 'LLM_AUTH_TOKEN', 'AICORE_LOCAL_LLM_AUTH_TOKEN')
    _, model = _resolve_env(env, 'AICORE_LOCAL_LLM_MODEL', 'LOCAL_LLM_MODEL', 'LLM_MODEL', default=_DEFAULT_LOCAL_MODEL)
    low_resource_mode = _is_local_low_resource_mode(env)
    default_max_tokens = _DEFAULT_LOCAL_FAST_MAX_TOKENS if low_resource_mode else _DEFAULT_LOCAL_MAX_TOKENS
    max_tokens = _int_env(env, 'AICORE_LOCAL_LLM_MAX_TOKENS', 'LOCAL_LLM_MAX_TOKENS', 'LLM_MAX_TOKENS', default=default_max_tokens)
    return CompatibleProviderConfig(
        provider_id='local',
        label='Ai-Core Local',
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
        label='Ai-Core Cloud',
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
    persistence = _persistence_config(runtime_env)
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
            'local_embedding': _local_embedding_config(runtime_env),
            'local_vector_index': get_local_vector_index_config(),
        },
        'persistence': persistence,
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


def _compact_text(value: str, limit: int) -> str:
    normalized = ' '.join(str(value or '').split()).strip()
    if len(normalized) <= limit:
        return normalized
    return f"{normalized[: max(0, limit - 3)].rstrip()}..."


def _extract_message_sequence(payload: dict[str, Any]) -> list[dict[str, str]]:
    messages = payload.get('messages')
    if not isinstance(messages, list):
        return []
    normalized_messages: list[dict[str, str]] = []
    for message in messages:
        if not isinstance(message, dict):
            continue
        role = _get_clean(message.get('role')) or 'user'
        content = message.get('content')
        text = ''
        if isinstance(content, str):
            text = content.strip()
        elif isinstance(content, list):
            text = _extract_text_from_blocks(content)
        if text:
            normalized_messages.append({'role': role, 'content': text})
    return normalized_messages


def _get_session_id(payload: dict[str, Any]) -> str | None:
    context = payload.get('context') if isinstance(payload.get('context'), dict) else {}
    return (
        _get_clean(payload.get('session_id'))
        or _get_clean(payload.get('sessionId'))
        or _get_clean(context.get('session_id'))
        or _get_clean(context.get('sessionId'))
    )


def _load_session_memory_snippets(session_id: str | None) -> list[str]:
    if not session_id:
        return []
    try:
        record = FileBackedLongTermMemory().load(session_id)
    except (OSError, ValueError, KeyError):
        return []

    snippets: list[str] = []
    for entry in record.entries[-_DEFAULT_LOCAL_MEMORY_ITEMS:]:
        compact = _compact_text(str(entry), _DEFAULT_LOCAL_MEMORY_LINE_LIMIT)
        if compact:
            snippets.append(compact)
    return snippets


def _is_simple_local_query(query: str) -> bool:
    normalized = str(query or '').strip().lower()
    if not normalized:
        return True
    if len(normalized) > 180:
        return False
    complex_markers = (
        '[pagina:',
        '[selecao da pagina]',
        '[arquivo:',
        '[screenshot',
        'analise a pagina',
        'descreva a interface',
        'proximas acoes',
        'task',
        'tarefa',
        'navegar',
        'preencher',
        'extrair',
        'scraping',
    )
    return not any(marker in normalized for marker in complex_markers)


def _format_rag_memory_lines(query: str, top_k: int = _DEFAULT_LOCAL_RAG_TOP_K) -> tuple[list[str], dict[str, Any]]:
    effective_top_k = max(0, int(top_k or 0))
    if effective_top_k <= 0:
        return [], {'rag_matches_used': 0, 'rag_sources': []}
    contexts = []
    if supabase_rag_is_configured():
        try:
            contexts.append(search_supabase_context(query, top_k=effective_top_k))
        except Exception:
            pass
    try:
        contexts.append(search_obsidian_context(query, top_k=effective_top_k))
    except Exception:
        pass

    if not contexts:
        return [], {'rag_matches_used': 0, 'rag_sources': []}

    rag_context = merge_rag_contexts(*contexts, top_k=effective_top_k)
    lines: list[str] = []
    source_names: list[str] = []
    for match in rag_context.matches[:effective_top_k]:
        sources = match.metadata.get('sources', [match.metadata.get('source', 'local')])
        if isinstance(sources, list):
            source_names.extend(str(source) for source in sources if source)
        source_label = '+'.join(str(source) for source in sources if source) if isinstance(sources, list) else 'local'
        lines.append(_compact_text(f'[{source_label}] {match.title}: {match.excerpt}', _DEFAULT_LOCAL_MEMORY_LINE_LIMIT))

    return lines, {
        'rag_matches_used': len(lines),
        'rag_sources': sorted(set(source_names)),
        'rag_backend': rag_context.vector_backend,
        'rag_embedding_engine': rag_context.embedding_engine,
    }


def _build_conversation_summary(message_sequence: list[dict[str, str]]) -> str:
    if not message_sequence:
        return ''
    recent = message_sequence[-6:]
    user_points = [_compact_text(item['content'], 90) for item in recent if item.get('role') == 'user'][-3:]
    assistant_points = [_compact_text(item['content'], 90) for item in recent if item.get('role') == 'assistant'][-2:]
    parts: list[str] = []
    if user_points:
        parts.append('Pontos recentes do usuário: ' + ' | '.join(user_points))
    if assistant_points:
        parts.append('Pontos recentes já respondidos: ' + ' | '.join(assistant_points))
    if not parts:
        return ''
    return _compact_text('\n'.join(parts), _DEFAULT_LOCAL_CONVERSATION_SUMMARY_LIMIT)


def _build_local_operator_prompt(payload: dict[str, Any]) -> str:
    context = payload.get('context') if isinstance(payload.get('context'), dict) else {}
    extension = context.get('extension') if isinstance(context.get('extension'), dict) else {}
    local_roots = extension.get('local_roots') if isinstance(extension.get('local_roots'), list) else []
    local_apps = extension.get('local_apps') if isinstance(extension.get('local_apps'), list) else []
    browser_actions = extension.get('browser_actions') if isinstance(extension.get('browser_actions'), list) else []

    roots_line = ', '.join(str(item) for item in local_roots[:6]) if local_roots else 'nenhuma pasta local adicional configurada'
    apps_line = ', '.join(str(item) for item in local_apps[:8]) if local_apps else 'nenhum aplicativo local nomeado configurado'
    browser_line = ', '.join(str(item) for item in browser_actions[:12]) if browser_actions else 'ler pagina, usar selecao, capturar tela, gravar, replay e executar AI-Tasks'

    return (
        "Você é o Ai-Core Local do AetherLab operando dentro do Universal LLM Assistant acoplado ao navegador. "
        "Responda em português do Brasil, de forma objetiva, operacional, acolhedora e humana. "
        "Converse como um assistente real de trabalho: direto, claro, sem jargão desnecessário e sem soar robótico. "
        "Espere o contexto da conversa antes de concluir, conecte os pontos recentes e produza uma resposta coerente como continuação natural do diálogo. "
        "Reconheça explicitamente quando está usando contexto do navegador, memória local ou aprovação do usuário.\n\n"
        f"Capacidades atuais no navegador: {browser_line}.\n"
        f"Pastas locais autorizadas no bridge: {roots_line}.\n"
        f"Aplicativos locais autorizados no bridge: {apps_line}.\n"
        "Você enxerga o navegador apenas pelos dados enviados pelo bridge, como leitura da página, seleção atual, captura de tela, uploads, gravações e tarefas aprovadas pelo usuário. "
        "Se faltar contexto visual ou operacional, peça a ação correta em vez de inventar observações.\n"
        "Quando o pedido exigir execução, prefira quebrar em tasks auditáveis com passos claros. "
        "Quando o pedido for apenas conversacional, responda sem inventar tasks. "
        "Nunca afirme acesso a recursos que não estejam configurados no contexto atual."
    )


def _augment_local_chat_payload(
    payload: dict[str, Any],
    env: Mapping[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    del env
    query = _normalize_message_text(payload)
    session_id = _get_session_id(payload)
    message_sequence = _extract_message_sequence(payload)
    if not query:
        return payload, {'session_id': session_id, 'memory_entries_used': 0, 'rag_matches_used': 0, 'rag_sources': []}

    memory_snippets = _load_session_memory_snippets(session_id)
    rag_top_k = 0 if _is_simple_local_query(query) else _DEFAULT_LOCAL_RAG_TOP_K
    if memory_snippets and rag_top_k == 0:
        rag_top_k = _DEFAULT_LOCAL_SIMPLE_RAG_TOP_K
    rag_lines, rag_meta = _format_rag_memory_lines(query, top_k=rag_top_k)
    conversation_summary = _build_conversation_summary(message_sequence)
    blocks: list[str] = []
    if conversation_summary:
        blocks.append("Resumo recente da conversa:\n" + conversation_summary)
    if memory_snippets:
        blocks.append("Memoria recente da sessao:\n" + '\n'.join(f"- {item}" for item in memory_snippets))
    if rag_lines:
        blocks.append("Memoria local relevante (Obsidian + Supabase local):\n" + '\n'.join(f"- {item}" for item in rag_lines))

    if not blocks:
        return payload, {'session_id': session_id, 'memory_entries_used': 0, **rag_meta}

    context_block = _compact_text(
        "Use o contexto local apenas se ele ajudar diretamente a resposta.\n\n" + '\n\n'.join(blocks),
        _DEFAULT_LOCAL_AUGMENT_LIMIT,
    )
    augmented = dict(payload)
    operator_prompt = _build_local_operator_prompt(payload)
    existing_system = _get_clean(payload.get('system')) or _get_clean(payload.get('system_prompt')) or ''
    augmented['system'] = '\n\n'.join(part for part in (operator_prompt, existing_system, context_block) if part).strip()
    return augmented, {
        'session_id': session_id,
        'conversation_turns_used': len(message_sequence[-6:]),
        'memory_entries_used': len(memory_snippets),
        **rag_meta,
    }


def _optimize_local_payload(
    payload: dict[str, Any],
    config: CompatibleProviderConfig,
    env: Mapping[str, Any],
) -> tuple[str, str, int, list[dict[str, str]], str]:
    low_resource_mode = config.provider_id == 'local' and _is_local_low_resource_mode(env)
    system_prompt = _get_clean(payload.get('system')) or _get_clean(payload.get('system_prompt')) or ''
    model = _get_clean(payload.get('model')) or config.model
    raw_max_tokens = payload.get('max_tokens') or payload.get('maxTokens') or config.max_tokens
    try:
        max_tokens = int(raw_max_tokens)
    except (TypeError, ValueError):
        max_tokens = config.max_tokens

    message_sequence = _extract_message_sequence(payload)
    if message_sequence:
        last_messages = message_sequence[-_DEFAULT_LOCAL_HISTORY_LIMIT:] if low_resource_mode else message_sequence
        compacted_lines = [
            f"{item['role'].upper()}: {_compact_text(item['content'], _DEFAULT_LOCAL_TEXT_LIMIT if low_resource_mode else _MAX_QUERY_LENGTH)}"
            for item in last_messages
        ]
        text = '\n'.join(compacted_lines).strip()
    else:
        raw_text = _normalize_message_text(payload)
        text_limit = _DEFAULT_LOCAL_TEXT_LIMIT if low_resource_mode else _MAX_QUERY_LENGTH
        text = _compact_text(raw_text, text_limit)

    if low_resource_mode:
        system_prompt = _compact_text(system_prompt, _DEFAULT_LOCAL_SYSTEM_LIMIT)
        simple_query = _is_simple_local_query(text)
        dynamic_cap = _DEFAULT_LOCAL_SIMPLE_MAX_TOKENS if simple_query else _DEFAULT_LOCAL_FAST_MAX_TOKENS
        max_tokens = max(72, min(max_tokens, config.max_tokens, dynamic_cap))
    else:
        max_tokens = max(96, min(max_tokens, config.max_tokens))

    return text, system_prompt, max_tokens, message_sequence, ('low_resource' if low_resource_mode else 'standard')


def _is_provider_memory_error(error: Exception) -> bool:
    message = str(error or '').strip().lower()
    return 'requires more system memory' in message or 'memória' in message or 'memory' in message


def _is_provider_unavailable_error(error: Exception) -> bool:
    return _is_provider_memory_error(error)


def _search_local_rag_matches(query: str) -> list[dict[str, Any]]:
    supabase_context = None
    obsidian_context = None
    if supabase_rag_is_configured() and not _is_local_low_resource_mode(os.environ):
        try:
            supabase_context = search_supabase_context(query, top_k=_DEFAULT_LOCAL_RAG_TOP_K)
        except Exception:
            supabase_context = None
    try:
        obsidian_context = search_obsidian_context(query, top_k=_DEFAULT_LOCAL_RAG_TOP_K)
    except Exception as exc:
        if supabase_context is None:
            return [{'title': 'rag_unavailable', 'excerpt': str(exc), 'score': 0.0, 'path': None}]
        obsidian_context = None

    rag_context = merge_rag_contexts(
        *[context for context in (supabase_context, obsidian_context) if context is not None],
        top_k=_DEFAULT_LOCAL_RAG_TOP_K,
    )

    matches: list[dict[str, Any]] = []
    for match in getattr(rag_context, 'matches', ())[:_DEFAULT_LOCAL_RAG_TOP_K]:
        matches.append(
            {
                'title': getattr(match, 'title', '') or 'Sem titulo',
                'excerpt': (getattr(match, 'excerpt', '') or '')[:220],
                'score': round(float(getattr(match, 'score', 0.0) or 0.0), 3),
                'path': getattr(match, 'path', None),
            }
        )
    return matches


def _build_degraded_local_messages_response(
    payload: dict[str, Any],
    error: Exception,
) -> dict[str, Any]:
    text = _normalize_message_text(payload)
    context = payload.get('context') if isinstance(payload.get('context'), dict) else {}
    rag_matches = _search_local_rag_matches(text)
    fallback_message = (
        "O runtime local ficou sem memória para executar o modelo configurado. "
        "O Dotobot respondeu em modo degradado com orientação operacional até o provider local ser estabilizado."
    )
    if not _is_provider_memory_error(error):
        fallback_message = (
            "O provider local nao ficou operacional neste runtime. "
            "O Dotobot respondeu em modo degradado usando o contexto local disponivel atÃ© o modelo principal ser estabilizado."
        )

    should_run_execute_fallback = _is_provider_memory_error(error)
    execute_payload = None
    response_text = fallback_message
    if should_run_execute_fallback:
        try:
            execute_payload = execute_request(ExecuteRequest(query=text, context=context))
            result = execute_payload.get('result') if isinstance(execute_payload, dict) else {}
            if isinstance(result, dict):
                execute_text = (
                    _get_clean(result.get('message'))
                    or _get_clean(result.get('final_output'))
                    or _get_clean(result.get('output'))
                    or ''
                )
                response_text = _merge_degraded_response_text(fallback_message, execute_text, execute_payload)
            elif isinstance(result, str) and result.strip():
                response_text = _merge_degraded_response_text(fallback_message, result.strip(), execute_payload)
        except Exception:
            execute_payload = None

    if rag_matches:
        rag_lines = '\n'.join(
            f"- {item['title']} [{item['score']}] {item['excerpt']}"
            for item in rag_matches
        )
        response_text = f"{response_text}\n\nContexto local recuperado:\n{rag_lines}".strip()

    return {
        'id': 'msg_local_degraded',
        'type': 'message',
        'role': 'assistant',
        'model': payload.get('model') or 'local-degraded-fallback',
        'content': [{'type': 'text', 'text': response_text}],
        'usage': {},
        'request_id': 'msg_local_degraded',
        'metadata': {
            'provider': 'local',
            'requested_model': _get_clean(payload.get('model')),
            'effective_model': None,
            'resolved_model': None,
            'transport_default_model': None,
            'route': 'degraded_execute_fallback',
            'transport_endpoint': None,
            'degraded': True,
            'fallback_reason': str(error),
            'execute_payload': execute_payload,
            'rag_matches': rag_matches,
        },
    }


def _merge_degraded_response_text(
    fallback_message: str,
    execute_text: str,
    execute_payload: dict[str, Any] | None,
) -> str:
    if not execute_text or 'No tool selected; step processed as reasoning-only action.' in execute_text:
        return f"{fallback_message}\n\nModo seguro ativo: responda com perguntas curtas, resumos ou comandos simples enquanto o modelo principal estiver indisponivel.".strip()
    if 'not implemented in the execution registry' in execute_text.lower():
        return (
            f"{fallback_message}\n\n"
            "Modo seguro ativo: o planner encontrou uma tool ainda nao implementada para esta acao. "
            "Tente uma pergunta mais direta, um resumo textual ou uma task sem depender dessa tool especifica."
        ).strip()
    result = execute_payload.get('result') if isinstance(execute_payload, dict) else {}
    if isinstance(result, dict) and result.get('kind') == 'structured':
        return f"{fallback_message}\n\n{execute_text}".strip()
    return f"{fallback_message}\n\n{execute_text}".strip()


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


def _probe_provider_transport(
    config: CompatibleProviderConfig,
    timeout: float = 2.5,
) -> ProviderTransportProbe:
    if not config.base_url:
        raise RuntimeError(f"Provider '{config.provider_id}' is not configured.")

    cache_key = (config.provider_id, str(config.base_url), str(config.model))
    cached = _TRANSPORT_PROBE_CACHE.get(cache_key)
    if cached and (time.time() - cached[0]) < _TRANSPORT_PROBE_TTL_SECONDS:
        return cached[1]

    headers = _build_provider_headers(config)

    openai_endpoint = _join_url(config.base_url, '/v1/models')
    if openai_endpoint:
        try:
            payload = _json_get_request(openai_endpoint, headers=headers, timeout=timeout)
            model = config.model
            if config.provider_id != 'local' and isinstance(payload.get('data'), list) and payload['data']:
                first = payload['data'][0]
                if isinstance(first, dict):
                    model = _get_clean(first.get('id')) or model
            probe = ProviderTransportProbe(
                endpoint=_join_url(config.base_url, '/v1/chat/completions') or config.base_url,
                mode='openai_chat_completions',
                model=model,
            )
            _TRANSPORT_PROBE_CACHE[cache_key] = (time.time(), probe)
            return probe
        except RuntimeError:
            pass

    anthropic_endpoint = _join_url(config.base_url, '/v1/messages')
    if anthropic_endpoint and config.provider_id != 'local':
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
                timeout=timeout,
            )
            probe = ProviderTransportProbe(endpoint=anthropic_endpoint, mode='anthropic_messages', model=config.model)
            _TRANSPORT_PROBE_CACHE[cache_key] = (time.time(), probe)
            return probe
        except RuntimeError:
            pass

    openai_chat_endpoint = _join_url(config.base_url, '/v1/chat/completions')
    if openai_chat_endpoint:
        try:
            payload = _json_request(
                openai_chat_endpoint,
                {
                    'model': config.model,
                    'max_tokens': 8,
                    'stream': False,
                    'messages': [{'role': 'user', 'content': 'ping'}],
                },
                headers=headers,
                timeout=timeout,
            )
            probe = ProviderTransportProbe(
                endpoint=openai_chat_endpoint,
                mode='openai_chat_completions',
                model=_get_clean(payload.get('model')) or config.model,
            )
            _TRANSPORT_PROBE_CACHE[cache_key] = (time.time(), probe)
            return probe
        except RuntimeError as exc:
            message = str(exc).lower()
            if 'model' in message and 'not found' in message:
                probe = ProviderTransportProbe(
                    endpoint=openai_chat_endpoint,
                    mode='openai_chat_completions',
                    model=config.model,
                )
                _TRANSPORT_PROBE_CACHE[cache_key] = (time.time(), probe)
                return probe

    ollama_endpoint = _join_url(config.base_url, '/api/tags')
    if ollama_endpoint:
        try:
            payload = _json_get_request(ollama_endpoint, timeout=timeout)
            model = config.model
            models = payload.get('models')
            if config.provider_id != 'local' and isinstance(models, list) and models:
                first = models[0]
                if isinstance(first, dict):
                    model = _get_clean(first.get('name')) or model
            openai_chat_endpoint = _join_url(config.base_url, '/v1/chat/completions') or config.base_url
            probe = ProviderTransportProbe(
                endpoint=openai_chat_endpoint,
                mode='openai_chat_completions',
                model=model,
            )
            _TRANSPORT_PROBE_CACHE[cache_key] = (time.time(), probe)
            return probe
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
        probe_timeout = 6.0 if config.provider_id == 'local' else 1.5
        transport = _probe_provider_transport(config, timeout=probe_timeout)
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


def _discover_runtime_models(
    config: CompatibleProviderConfig,
    headers: dict[str, str] | None = None,
    timeout: float = 2.5,
) -> list[str]:
    discovered: list[str] = []
    if not config.base_url:
        return discovered

    openai_endpoint = _join_url(config.base_url, '/v1/models')
    if openai_endpoint:
        try:
            payload = _json_get_request(openai_endpoint, headers=headers, timeout=timeout)
            for item in payload.get('data') or []:
                if isinstance(item, dict):
                    model_id = _get_clean(item.get('id'))
                    if model_id:
                        discovered.append(model_id)
        except RuntimeError:
            pass

    ollama_endpoint = _join_url(config.base_url, '/api/tags')
    if ollama_endpoint:
        try:
            payload = _json_get_request(ollama_endpoint, timeout=timeout)
            for item in payload.get('models') or []:
                if isinstance(item, dict):
                    model_id = _get_clean(item.get('name'))
                    if model_id:
                        discovered.append(model_id)
        except RuntimeError:
            pass

    unique_models: list[str] = []
    for model_id in discovered:
        if model_id not in unique_models:
            unique_models.append(model_id)
    return unique_models


def _pick_local_runtime_model(requested_model: str | None, available_models: list[str]) -> str | None:
    normalized_requested = _get_clean(requested_model)
    if not available_models:
        return normalized_requested
    if not normalized_requested:
        return _pick_local_low_resource_model(None, available_models) or available_models[0]

    requested_base = normalized_requested.split(':', 1)[0].lower()
    for candidate in available_models:
        if candidate.lower() == normalized_requested.lower():
            return candidate
    if normalized_requested.lower() == _DEFAULT_LOCAL_MODEL.lower():
        for preferred in ('qwen3.5:cloud', 'qwen3.5:4b', 'qwen3:4b', 'llama3.2:latest', 'qwen3:8b'):
            for candidate in available_models:
                if candidate.lower() == preferred:
                    return candidate
    if requested_base == 'qwen3.5':
        for preferred in ('qwen3.5:4b', 'qwen3.5:latest'):
            for candidate in available_models:
                if candidate.lower() == preferred:
                    return candidate
        for candidate in available_models:
            if candidate.lower().startswith('qwen3.5:') and ':cloud' not in candidate.lower():
                return candidate
    for candidate in available_models:
        if candidate.split(':', 1)[0].lower() == requested_base:
            return candidate
    for candidate in available_models:
        candidate_lower = candidate.lower()
        if requested_base in candidate_lower or candidate_lower.split(':', 1)[0] in requested_base:
            return candidate
    return available_models[0]


def _pick_local_low_resource_model(current_model: str | None, available_models: list[str]) -> str | None:
    normalized_current = (_get_clean(current_model) or '').lower()
    priorities = [
        'qwen3.5:cloud',
        'qwen3.5:4b',
        'qwen3:4b',
        'qwen3:8b',
        'llama3.2:latest',
        'llama3.1:latest',
        'llama2:latest',
    ]
    for preferred in priorities:
        for candidate in available_models:
            normalized_candidate = _get_clean(candidate).lower()
            if normalized_candidate == preferred and normalized_candidate != normalized_current:
                return candidate
    for candidate in available_models:
        normalized_candidate = _get_clean(candidate).lower()
        if normalized_candidate and normalized_candidate != normalized_current and 'gemma4' not in normalized_candidate:
            return candidate
    return None


def _iter_local_runtime_fallback_models(current_model: str | None, available_models: list[str]) -> list[str]:
    normalized_current = _get_clean(current_model).lower()
    ordered: list[str] = []
    first = _pick_local_low_resource_model(current_model, available_models)
    if first:
      ordered.append(first)
    for candidate in available_models:
        normalized_candidate = _get_clean(candidate).lower()
        if not normalized_candidate or normalized_candidate == normalized_current or candidate in ordered:
            continue
        ordered.append(candidate)
    return ordered


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
    contexts = [search_obsidian_context(request.query, top_k=max(1, request.top_k))]
    if supabase_rag_is_configured():
        try:
            contexts.insert(0, search_supabase_context(request.query, top_k=max(1, request.top_k)))
        except Exception:
            pass
    rag_context = merge_rag_contexts(*contexts, top_k=max(1, request.top_k))
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


def _invoke_compatible_provider(
    config: CompatibleProviderConfig,
    payload: dict[str, Any],
    env: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    if not config.base_url:
        raise RuntimeError(f"Provider '{config.provider_id}' is not configured.")

    runtime_env = env or os.environ
    text, system_prompt, max_tokens, message_sequence, performance_profile = _optimize_local_payload(payload, config, runtime_env)
    model = _get_clean(payload.get('model')) or config.model
    transport = _probe_provider_transport(config, timeout=2.5)
    transport_default_model = transport.model or config.model
    requested_model = model or transport_default_model
    headers = _build_provider_headers(config)
    request_timeout = _LOCAL_PROVIDER_TIMEOUT_SECONDS if config.provider_id == 'local' else _DEFAULT_TIMEOUT_SECONDS
    provider_default_model = config.model or ''
    should_prefer_transport_model = (
        transport_default_model
        and requested_model
        and requested_model == provider_default_model
        and requested_model != transport_default_model
        and transport.mode in {'openai_chat_completions', 'ollama_chat'}
    )
    effective_model = transport_default_model if should_prefer_transport_model else requested_model
    if config.provider_id == 'local':
        available_models = _discover_runtime_models(config, headers=headers, timeout=2.5)
        effective_model = _pick_local_runtime_model(effective_model, available_models) or effective_model

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
            timeout=request_timeout,
        )
        response_content = response.get('content')
        response_model = response.get('model') or requested_model
    elif transport.mode == 'openai_chat_completions':
        request_payload = {
            'model': effective_model,
            'max_tokens': max_tokens,
            'stream': False,
            'messages': [
                *([{'role': 'system', 'content': system_prompt}] if system_prompt else []),
                {'role': 'user', 'content': text},
            ],
        }
        _append_provider_debug(
            'provider.openai_chat.start',
            {
                'requested_model': requested_model,
                'effective_model': effective_model,
                'transport_default_model': transport_default_model,
                'transport_endpoint': transport.endpoint,
                'available_models': available_models if config.provider_id == 'local' else [],
            },
        )
        try:
            response = _json_request(
                transport.endpoint,
                request_payload,
                headers=headers,
                timeout=request_timeout,
            )
        except RuntimeError as exc:
            _append_provider_debug(
                'provider.openai_chat.error',
                {
                    'model': request_payload.get('model'),
                    'error': str(exc),
                },
            )
            if not (config.provider_id == 'local' and _is_provider_memory_error(exc)):
                raise
            last_exc = exc
            response = None
            for fallback_model in _iter_local_runtime_fallback_models(effective_model, available_models):
                request_payload['model'] = fallback_model
                _append_provider_debug(
                    'provider.openai_chat.retry',
                    {
                        'fallback_model': fallback_model,
                        'previous_error': str(last_exc),
                    },
                )
                try:
                    response = _json_request(
                        transport.endpoint,
                        request_payload,
                        headers=headers,
                        timeout=request_timeout,
                    )
                    effective_model = fallback_model
                    _append_provider_debug(
                        'provider.openai_chat.retry_success',
                        {
                            'effective_model': effective_model,
                        },
                    )
                    break
                except RuntimeError as retry_exc:
                    last_exc = retry_exc
                    _append_provider_debug(
                        'provider.openai_chat.retry_error',
                        {
                            'fallback_model': fallback_model,
                            'error': str(retry_exc),
                        },
                    )
                    if not _is_provider_memory_error(retry_exc):
                        raise
            if response is None:
                raise last_exc
        choices = response.get('choices') if isinstance(response.get('choices'), list) else []
        message = choices[0].get('message') if choices and isinstance(choices[0], dict) else {}
        response_text = _get_clean(message.get('content')) or response.get('message') or response.get('result') or ''
        if not response_text:
            response_text = (
                "O modelo local concluiu o processamento sem texto final visivel. "
                "Tente uma pergunta mais direta ou selecione outro modelo local."
            )
        response_content = [{'type': 'text', 'text': response_text}]
        response_model = response.get('model') or requested_model
    elif transport.mode == 'ollama_chat':
        request_payload = {
            'model': effective_model,
            'stream': False,
            'messages': [
                *([{'role': 'system', 'content': system_prompt}] if system_prompt else []),
                {'role': 'user', 'content': text},
            ],
            'options': {
                'num_predict': max_tokens,
            },
        }
        try:
            response = _json_request(
                transport.endpoint,
                request_payload,
                headers=headers,
                timeout=request_timeout,
            )
        except RuntimeError as exc:
            if not (config.provider_id == 'local' and _is_provider_memory_error(exc)):
                raise
            last_exc = exc
            response = None
            for fallback_model in _iter_local_runtime_fallback_models(effective_model, available_models):
                request_payload['model'] = fallback_model
                try:
                    response = _json_request(
                        transport.endpoint,
                        request_payload,
                        headers=headers,
                        timeout=request_timeout,
                    )
                    effective_model = fallback_model
                    break
                except RuntimeError as retry_exc:
                    last_exc = retry_exc
                    if not _is_provider_memory_error(retry_exc):
                        raise
            if response is None:
                raise last_exc
        message = response.get('message') if isinstance(response.get('message'), dict) else {}
        response_text = _get_clean(message.get('content')) or response.get('response') or response.get('message') or ''
        response_content = [{'type': 'text', 'text': response_text or json.dumps(response)}]
        response_model = response.get('model') or requested_model
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
            'requested_model': requested_model,
            'effective_model': effective_model,
            'resolved_model': metadata.get('resolved_model') or response_model,
            'transport_default_model': transport_default_model,
            'route': transport.mode,
            'transport_endpoint': transport.endpoint,
            'performance_profile': performance_profile,
            'effective_max_tokens': max_tokens,
            'history_messages_used': len(message_sequence[-_DEFAULT_LOCAL_HISTORY_LIMIT:]) if performance_profile == 'low_resource' and message_sequence else len(message_sequence),
        },
    }


def messages_json(payload: dict[str, Any], env: Mapping[str, Any] | None = None) -> dict[str, Any]:
    runtime_env = env or os.environ
    provider_id = _resolve_runtime_provider(payload, runtime_env)
    if _is_offline_mode(runtime_env) and provider_id != 'local':
        raise RuntimeError(f"Offline mode is active. Provider '{provider_id}' is blocked.")
    config = build_local_provider_config(runtime_env) if provider_id == 'local' else build_cloud_provider_config(runtime_env)
    effective_payload = payload
    local_memory_meta: dict[str, Any] = {}
    if provider_id == 'local':
        effective_payload, local_memory_meta = _augment_local_chat_payload(payload, runtime_env)
    try:
        response = _invoke_compatible_provider(config, effective_payload, runtime_env)
        if local_memory_meta:
            response['metadata'] = {
                **(response.get('metadata') if isinstance(response.get('metadata'), dict) else {}),
                **local_memory_meta,
            }
        return response
    except RuntimeError as error:
        if provider_id == 'local' and _is_provider_unavailable_error(error):
            return _build_degraded_local_messages_response(payload, error)
        raise


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
    persistence = _persistence_config(runtime_env)
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
                'performance_profile': 'low_resource' if _is_local_low_resource_mode(runtime_env) else 'standard',
            },
            'cloud': {
                **cloud.to_public_dict(),
                'available': False if offline_mode else cloud.configured,
                'offline_blocked': offline_mode,
            },
        },
        'extension': extension,
        'persistence': persistence,
        'capabilities': {
            'skills': skills_json(runtime_env)['summary'],
            'commands': capabilities_json(runtime_env)['commands'],
            'browser_extension_profile': build_extension_profiles(runtime_env)['active_profile'],
            'orchestration': dict(_ORCHESTRATION_CAPABILITIES),
            'rag': {
                'offline_primary': 'obsidian',
                'local_embedding': _local_embedding_config(runtime_env),
                'local_vector_index': get_local_vector_index_config(),
            },
            'persistence': persistence,
        },
    }


def cloudflare_response(payload: dict[str, Any], status: int = 200) -> tuple[int, dict[str, str], str]:
    return status, {'Content-Type': 'application/json'}, json.dumps(payload)
