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
            steps.append(
                PlanStep(
                    id=idx,
                    action=step_input,
                    tool=tool.name if tool else None,
                    input=self._compose_step_input(step_input, planning_context),
                    selection=self._build_selection_payload(step_input, ranked_tools),
                )
            )
        goal = planning_context.query
        if planning_context.context.get('goal_hint'):
            goal = str(planning_context.context['goal_hint'])
        return ExecutionPlan(goal=goal, steps=steps)

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
        for separator in (' then ', ' and then ', ' and ', ';'):
            raw = raw.replace(separator, '.')
        chunks = [part.strip() for part in raw.split('.') if part.strip()]
        if chunks:
            return chunks
        return [query.strip() or 'Process user query']
