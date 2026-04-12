from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ..query_engine import QueryEnginePort
from ..tool_pool import RankedTool, ToolDescriptor, select_tools_ranked
from .contracts import ExecutionPlan, PlanStep


@dataclass(frozen=True)
class PlanningContext:
    query: str
    context: dict[str, Any]
    memory_items: tuple[str, ...] = ()
    rag_matches: tuple[dict[str, Any], ...] = ()


class PlannerAgent:
    """Deterministic planner that converts a request into structured steps."""

    def __init__(self, query_engine: QueryEnginePort | None = None) -> None:
        self._query_engine = query_engine or QueryEnginePort.from_workspace()

    def build_plan(
        self,
        query: str,
        context: dict[str, Any] | None = None,
        memory_items: tuple[str, ...] = (),
        rag_matches: tuple[dict[str, Any], ...] = (),
    ) -> ExecutionPlan:
        normalized_context = context or {}
        engine_memory = self._query_engine.replay_user_messages()
        planning_context = PlanningContext(
            query=query.strip(),
            context=normalized_context,
            memory_items=memory_items + engine_memory,
            rag_matches=rag_matches,
        )
        step_inputs = self._split_into_steps(planning_context.query)
        steps: list[PlanStep] = []
        for idx, step_input in enumerate(step_inputs, start=1):
            ranked_tools = self._rank_tools(step_input)
            tool = ranked_tools[0].descriptor if ranked_tools else None
            agent_role = self._infer_agent_role(step_input, tool.name if tool else None)
            stage = self._infer_stage(step_input, tool.name if tool else None)
            module_keys = self._resolve_modules(step_input, planning_context.context)
            steps.append(
                PlanStep(
                    id=idx,
                    action=step_input,
                    tool=tool.name if tool else None,
                    input=self._compose_step_input(step_input, planning_context),
                    agent_role=agent_role,
                    stage=stage,
                    module_keys=module_keys,
                    depends_on=((idx - 1,),)[0] if idx > 1 else (),
                    parallel_group='analysis' if stage in {'retrieval', 'execution'} else None,
                )
            )
        goal = planning_context.query
        if planning_context.context.get('goal_hint'):
            goal = str(planning_context.context['goal_hint'])
        return ExecutionPlan(goal=goal, steps=steps, orchestration=self._build_orchestration(goal, steps, planning_context.context))

    def _rank_tools(self, step_input: str) -> list[RankedTool]:
        return select_tools_ranked(input_text=step_input, limit=3)

    def _compose_step_input(self, step_input: str, planning_context: PlanningContext) -> dict[str, Any]:
        return {
            'query': planning_context.query,
            'step': step_input,
            'context': planning_context.context,
            'memory': list(planning_context.memory_items[-5:]),
            'rag': list(planning_context.rag_matches[-5:]),
        }

    def _build_selection_payload(self, step_input: str, ranked_tools: list[RankedTool]) -> dict[str, Any]:
        if not ranked_tools:
            return {
                'reason': 'No catalog tool matched the step tokens.',
                'candidates': [],
                'step': step_input,
            }
        selected = ranked_tools[0]
        return {
            'reason': f"Selected '{selected.descriptor.name}' with score {selected.score}.",
            'candidates': [
                {
                    'name': ranked.descriptor.name,
                    'score': ranked.score,
                    'source_hint': ranked.descriptor.source_hint,
                }
                for ranked in ranked_tools
            ],
            'step': step_input,
        }

    def _split_into_steps(self, query: str) -> list[str]:
        raw = query.replace('\n', '.')
        for separator in (' then ', ' and then ', ' and ', ' e depois ', ' e ', ' antes de ', ' before ', ';'):
            raw = raw.replace(separator, '.')
        chunks = [part.strip() for part in raw.split('.') if part.strip()]
        if chunks:
            return chunks
        return [query.strip() or 'Process user query']

    @staticmethod
    def _infer_agent_role(step_input: str, tool_name: str | None) -> str:
        combined = f'{step_input} {tool_name or ""}'.lower()
        if any(token in combined for token in ('plan', 'planej', 'roteiro', 'estrateg')):
            return 'Planner'
        if any(token in combined for token in ('rag', 'context', 'retrieve', 'search', 'buscar', 'obsidian', 'supabase')):
            return 'Retriever'
        if any(token in combined for token in ('critic', 'review', 'valid', 'auditar', 'compliance')):
            return 'Critic'
        if any(token in combined for token in ('dispatch', 'orchestr', 'coordena', 'module', 'modulo')):
            return 'Supervisor'
        return 'Executor'

    @staticmethod
    def _infer_stage(step_input: str, tool_name: str | None) -> str:
        combined = f'{step_input} {tool_name or ""}'.lower()
        if any(token in combined for token in ('plan', 'planej', 'roteiro', 'estrateg')):
            return 'planning'
        if any(token in combined for token in ('rag', 'context', 'retrieve', 'search', 'buscar', 'obsidian', 'supabase')):
            return 'retrieval'
        if any(token in combined for token in ('critic', 'review', 'valid', 'auditar', 'compliance')):
            return 'review'
        if any(token in combined for token in ('dispatch', 'orchestr', 'coordena', 'govern')):
            return 'orchestration'
        return 'execution'

    @staticmethod
    def _resolve_modules(step_input: str, context: dict[str, Any]) -> tuple[str, ...]:
        modules = context.get('modules')
        if not isinstance(modules, list):
            return ()
        text = step_input.lower()
        matches: list[str] = []
        for module in modules:
            if not isinstance(module, dict):
                continue
            key = str(module.get('key') or '').strip()
            label = str(module.get('label') or '').strip().lower()
            route = str(module.get('route') or '').strip().lower()
            if not key:
                continue
            if label and label in text:
                matches.append(key)
                continue
            route_tokens = [token for token in route.replace('/', ' ').replace('-', ' ').split() if token]
            if route_tokens and any(token in text for token in route_tokens):
                matches.append(key)
        deduped = list(dict.fromkeys(matches))
        return tuple(deduped[:4])

    @staticmethod
    def _build_orchestration(goal: str, steps: list[PlanStep], context: dict[str, Any]) -> dict[str, Any]:
        modules = context.get('modules') if isinstance(context.get('modules'), list) else []
        subagents: dict[str, dict[str, Any]] = {}
        tasks: list[dict[str, Any]] = []
        for step in steps:
            agent_id = step.agent_role.lower()
            if agent_id not in subagents:
                subagents[agent_id] = {
                    'id': agent_id,
                    'role': step.agent_role,
                    'label': step.agent_role,
                    'stages': [],
                    'module_keys': [],
                }
            stage_list = subagents[agent_id]['stages']
            if step.stage not in stage_list:
                stage_list.append(step.stage)
            module_list = subagents[agent_id]['module_keys']
            for module_key in step.module_keys:
                if module_key not in module_list:
                    module_list.append(module_key)
            tasks.append(
                {
                    'id': f'task_{step.id}',
                    'title': step.action,
                    'agent_id': agent_id,
                    'agent_role': step.agent_role,
                    'stage': step.stage,
                    'tool': step.tool,
                    'module_keys': list(step.module_keys),
                    'depends_on': list(step.depends_on),
                    'parallel_group': step.parallel_group,
                }
            )

        return {
            'goal': goal,
            'multi_agent': len(subagents) > 1,
            'subagents': list(subagents.values()),
            'tasks': tasks,
            'available_modules': [
                {
                    'key': str(module.get('key') or ''),
                    'label': str(module.get('label') or ''),
                    'route': str(module.get('route') or ''),
                }
                for module in modules if isinstance(module, dict)
            ],
        }
