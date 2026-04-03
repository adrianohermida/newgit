from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from uuid import uuid4

from ..agents import CriticAgent, CriticVerdict, ExecutionPlan, ExecutionReport, ExecutorAgent, PlannerAgent
from ..memory import FileBackedLongTermMemory, LongTermMemoryRecord, SessionMemory


@dataclass
class OrchestrationState:
    session_id: str
    plan: ExecutionPlan | None = None
    report: ExecutionReport | None = None
    retry_report: ExecutionReport | None = None
    verdict: CriticVerdict | None = None
    retry_count: int = 0
    logs: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class OrchestrationResult:
    result: dict[str, Any] | str | None
    steps: list[dict[str, Any]]
    logs: list[str]
    status: str
    session_id: str

    def to_dict(self) -> dict[str, Any]:
        return {
            'result': self.result,
            'steps': self.steps,
            'logs': self.logs,
            'status': self.status,
            'session_id': self.session_id,
        }


class Coordinator:
    def __init__(
        self,
        planner: PlannerAgent | None = None,
        executor: ExecutorAgent | None = None,
        critic: CriticAgent | None = None,
        memory_store: FileBackedLongTermMemory | None = None,
    ) -> None:
        self._planner = planner or PlannerAgent()
        self._executor = executor or ExecutorAgent()
        self._critic = critic or CriticAgent()
        self._memory_store = memory_store or FileBackedLongTermMemory()

    def execute(self, query: str, context: dict[str, Any] | None = None) -> OrchestrationResult:
        normalized_context = context or {}
        session_id = str(normalized_context.get('session_id') or uuid4().hex)
        state = OrchestrationState(session_id=session_id)

        long_term_record = self._memory_store.load(session_id)
        short_term = SessionMemory(session_id=session_id, entries=list(long_term_record.entries))
        state.logs.append(f'session={session_id}')
        state.logs.append(f'memory_loaded={len(short_term.entries)}')

        state.plan = self._planner.build_plan(query=query, context=normalized_context, memory_items=short_term.latest())
        state.logs.append(f'planned_steps={len(state.plan.steps)}')

        state.report = self._executor.execute_plan(state.plan)
        state.logs.extend(state.report.logs)
        state.verdict = self._critic.validate(state.report)
        state.logs.append(f'critic_status={state.verdict.status}')

        final_report = state.report
        if state.verdict.status == 'retry' and state.retry_count == 0:
            failed_step_ids = {result.step_id for result in state.report.results if result.status != 'ok'}
            if failed_step_ids:
                state.retry_count += 1
                state.retry_report = self._executor.retry_steps(state.plan, failed_step_ids, suggestion=state.verdict.suggestion)
                state.logs.extend(state.retry_report.logs)
                retry_verdict = self._critic.validate(state.retry_report)
                state.logs.append(f'retry_critic_status={retry_verdict.status}')
                if retry_verdict.status == 'ok':
                    final_report = state.retry_report
                    state.verdict = retry_verdict
                else:
                    state.verdict = retry_verdict

        self._persist_memory(short_term=short_term, query=query, final_report=final_report)

        status = state.verdict.status if state.verdict else 'fail'
        steps = [step.to_dict() for step in (final_report.results if final_report else [])]
        result_payload = final_report.final_output if final_report else {'message': 'No report produced'}
        return OrchestrationResult(result=result_payload, steps=steps, logs=state.logs, status=status, session_id=session_id)

    def _persist_memory(self, short_term: SessionMemory, query: str, final_report: ExecutionReport) -> None:
        short_term.append(f'user_query: {query}')
        short_term.append(f'final_output: {final_report.final_output}')
        record = LongTermMemoryRecord(session_id=short_term.session_id, entries=tuple(short_term.entries))
        self._memory_store.persist(record)
