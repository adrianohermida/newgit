from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .models import PortingModule
from .permissions import ToolPermissionContext
from .tools import get_tools


@dataclass(frozen=True)
class ToolPool:
    tools: tuple[PortingModule, ...]
    simple_mode: bool
    include_mcp: bool

    def as_markdown(self) -> str:
        lines = [
            '# Tool Pool',
            '',
            f'Simple mode: {self.simple_mode}',
            f'Include MCP: {self.include_mcp}',
            f'Tool count: {len(self.tools)}',
        ]
        lines.extend(f'- {tool.name} - {tool.source_hint}' for tool in self.tools[:15])
        return '\n'.join(lines)


@dataclass(frozen=True)
class ToolDescriptor:
    name: str
    description: str
    input_schema: dict[str, Any]
    source_hint: str
    tags: tuple[str, ...] = ()

    @property
    def _search_corpus(self) -> str:
        """Pre-joined lowercased haystack for scoring — avoids repeated allocs."""
        return f'{self.name} {self.description} {self.source_hint} {" ".join(self.tags)}'.lower()


@dataclass(frozen=True)
class RankedTool:
    descriptor: ToolDescriptor
    score: int


@dataclass
class ToolRouterRegistry:
    descriptors: dict[str, ToolDescriptor] = field(default_factory=dict)

    def register(self, descriptor: ToolDescriptor) -> None:
        self.descriptors[descriptor.name.lower()] = descriptor

    def resolve(self, name: str) -> ToolDescriptor | None:
        return self.descriptors.get(name.lower())

    def all(self) -> tuple[ToolDescriptor, ...]:
        return tuple(self.descriptors.values())


_ROUTER_REGISTRY = ToolRouterRegistry()


def assemble_tool_pool(
    simple_mode: bool = False,
    include_mcp: bool = True,
    permission_context: ToolPermissionContext | None = None,
) -> ToolPool:
    return ToolPool(
        tools=get_tools(simple_mode=simple_mode, include_mcp=include_mcp, permission_context=permission_context),
        simple_mode=simple_mode,
        include_mcp=include_mcp,
    )


def build_tool_descriptors(
    simple_mode: bool = False,
    include_mcp: bool = True,
    permission_context: ToolPermissionContext | None = None,
) -> tuple[ToolDescriptor, ...]:
    modules = get_tools(simple_mode=simple_mode, include_mcp=include_mcp, permission_context=permission_context)
    descriptors = []
    for module in modules:
        descriptors.append(
            ToolDescriptor(
                name=module.name,
                description=module.responsibility,
                input_schema={'type': 'object', 'properties': {'payload': {'type': 'string'}}},
                source_hint=module.source_hint,
                tags=_infer_tags(module),
            )
        )
    return tuple(descriptors)


def register_dynamic_tool(descriptor: ToolDescriptor) -> None:
    _ROUTER_REGISTRY.register(descriptor)


def select_tools_ranked(
    input_text: str,
    candidate_tools: tuple[ToolDescriptor, ...] | None = None,
    limit: int = 5,
) -> list[RankedTool]:
    candidates = list(candidate_tools or build_tool_descriptors())
    candidates.extend(_ROUTER_REGISTRY.all())
    tokens = _tokenize(input_text)
    ranked: list[RankedTool] = []
    for descriptor in candidates:
        score = _score_tool(descriptor, tokens)
        if score > 0:
            ranked.append(RankedTool(descriptor=descriptor, score=score))
    ranked.sort(key=lambda item: (-item.score, item.descriptor.name))
    return ranked[:limit]


def select_best_tool(input_text: str, candidate_tools: tuple[ToolDescriptor, ...] | None = None) -> ToolDescriptor | None:
    ranked = select_tools_ranked(input_text=input_text, candidate_tools=candidate_tools, limit=1)
    if not ranked:
        return None
    return ranked[0].descriptor


def _tokenize(text: str) -> set[str]:
    normalized = text.lower().replace('/', ' ').replace('_', ' ').replace('-', ' ')
    return {token for token in normalized.split() if len(token) >= 3}


def _score_tool(descriptor: ToolDescriptor, tokens: set[str]) -> int:
    corpus = descriptor._search_corpus
    return sum(1 for token in tokens if token in corpus)


def _infer_tags(module: PortingModule) -> tuple[str, ...]:
    tags: list[str] = []
    lowered = f'{module.name} {module.source_hint} {module.responsibility}'.lower()
    for tag in ('read', 'write', 'mcp', 'command', 'filesystem', 'network', 'search', 'api'):
        if tag in lowered:
            tags.append(tag)
    return tuple(tags)
