from __future__ import annotations

from typing import Any
from uuid import uuid4

from adapters.obsidian_adapter import ObsidianRagContext
from ..agents import CriticAgent, ExecutionResultPayload, ExecutorAgent, PlannerAgent
from ..memory import LongTermMemoryRecord, SessionMemory
from .models import OrchestrationError, OrchestrationResult, OrchestrationState
from .services import (
    DefaultRagService,
    LongTermMemoryStore,
    MemoryNoteSink,
    ObsidianMemoryNoteSink,
    RagService,
    build_default_memory_store,
)


class Coordinator:
    def __init__(
        self,
        planner: PlannerAgent | None = None,
        executor: ExecutorAgent | None = None,
        critic: CriticAgent | None = None,
        memory_store: LongTermMemoryStore | None = None,
        rag_service: RagService | None = None,
        memory_note_sink: MemoryNoteSink | None = None,
    ) -> None:
        self._planner = planner or PlannerAgent()
        self._executor = executor or ExecutorAgent()
        self._critic = critic or CriticAgent()
        self._memory_store = memory_store or build_default_memory_store()
        self._rag_service = rag_service or DefaultRagService()
        self._memory_note_sink = memory_note_sink or ObsidianMemoryNoteSink()

    def execute(self, query: str, context: dict[str, Any] | None = None) -> OrchestrationResult:
        normalized_context = context or {}
        session_id = str(normalized_context.get('session_id') or uuid4().hex)
        state = OrchestrationState(session_id=session_id)
        errors: list[OrchestrationError] = []
        rag_context = self._safe_rag_search(query=query, top_k=5, errors=errors, logs=state.logs)
        rag_matches = tuple(match.to_dict() for match in rag_context.matches)

        long_term_record = self._safe_load_memory(session_id=session_id, errors=errors, logs=state.logs)
        short_term = SessionMemory(session_id=session_id, entries=list(long_term_record.entries))
        state.logs.append(f'session={session_id}')
        state.logs.append(f'memory_loaded={len(short_term.entries)}')
        state.logs.append(f'obsidian_rag_matches={len(rag_matches)}')

        planner_context = {
            **normalized_context,
            'rag': rag_context.to_dict(),
        }
        state.plan = self._planner.build_plan(
            query=query,
            context=planner_context,
            memory_items=short_term.latest(),
            rag_matches=rag_matches,
        )
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

        self._persist_memory(
            short_term=short_term,
            query=query,
            final_report=final_report,
            rag_context=rag_context,
            context=normalized_context,
            errors=errors,
            logs=state.logs,
        )

        status = state.verdict.status if state.verdict else 'fail'
        steps = list(final_report.results if final_report else [])
        result_payload = final_report.final_output if final_report and final_report.final_output else ExecutionResultPayload(
            kind='message',
            message='No report produced',
        )
        return OrchestrationResult(
            result=result_payload,
            steps=steps,
            logs=state.logs,
            status=status,
            session_id=session_id,
            rag=rag_context,
            errors=tuple(errors),
        )

    def _persist_memory(
        self,
        short_term: SessionMemory,
        query: str,
        final_report,
        rag_context: ObsidianRagContext,
        context: dict[str, Any],
        errors: list[OrchestrationError],
        logs: list[str],
    ) -> None:
        short_term.append(f'user_query: {query}')
        short_term.append(f'final_output: {final_report.final_output}')
        record = LongTermMemoryRecord(session_id=short_term.session_id, entries=tuple(short_term.entries))
        try:
            self._memory_store.persist(record)
            logs.append('memory_persisted=true')
        except Exception as exc:
            logs.append(f'memory_persisted=false reason={exc}')
            errors.append(
                OrchestrationError(
                    code='memory_persist_failed',
                    message='Unable to persist long-term memory.',
                    details={'error': str(exc), 'session_id': short_term.session_id},
                )
            )

        try:
            self._memory_note_sink.write(
                query=query,
                answer=final_report.final_output.message if final_report.final_output else '',
                session_id=short_term.session_id,
                context=context,
                rag_matches=rag_context.matches,
                title=final_report.final_output.message[:120] if final_report.final_output else None,
            )
            logs.append('memory_note_written=true')
        except Exception as exc:
            logs.append(f'memory_note_written=false reason={exc}')
            errors.append(
                OrchestrationError(
                    code='memory_note_write_failed',
                    message='Unable to write the memory note.',
                    details={'error': str(exc), 'session_id': short_term.session_id},
                )
            )

    def _safe_load_memory(
        self,
        *,
        session_id: str,
        errors: list[OrchestrationError],
        logs: list[str],
    ) -> LongTermMemoryRecord:
        try:
            return self._memory_store.load(session_id)
        except Exception as exc:
            logs.append(f'memory_loaded=false reason={exc}')
            errors.append(
                OrchestrationError(
                    code='memory_load_failed',
                    message='Unable to load long-term memory.',
                    details={'error': str(exc), 'session_id': session_id},
                )
            )
            return LongTermMemoryRecord(session_id=session_id, entries=())

    def _safe_rag_search(
        self,
        *,
        query: str,
        top_k: int,
        errors: list[OrchestrationError],
        logs: list[str],
    ) -> ObsidianRagContext:
        try:
            return self._rag_service.search(query=query, top_k=top_k)
        except Exception as exc:
            logs.append(f'obsidian_rag_failed reason={exc}')
            errors.append(
                OrchestrationError(
                    code='rag_lookup_failed',
                    message='Unable to fetch RAG context.',
                    details={'error': str(exc)},
                )
            )
            return ObsidianRagContext(enabled=False, vault_path=None, memory_dir=None, error=str(exc))
