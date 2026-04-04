from __future__ import annotations

import concurrent.futures
from dataclasses import dataclass
from time import perf_counter
from typing import Any

from ..execution_registry import build_execution_registry
from ..tool_pool import ToolDescriptor, select_best_tool
from .contracts import ExecutionPlan, ExecutionReport, ExecutionResultPayload, StepExecutionResult


@dataclass(frozen=True)
class ExecutorConfig:
    max_attempts_per_step: int = 2
    step_timeout_seconds: float = 30.0


class ExecutorAgent:
    """Sequential executor with retry-ready contracts."""

    def __init__(self, config: ExecutorConfig | None = None) -> None:
        self._config = config or ExecutorConfig()
        self._registry = build_execution_registry()

    def execute_plan(self, plan: ExecutionPlan) -> ExecutionReport:
        report = ExecutionReport()
        for step in plan.steps:
            result = self._execute_step(step_id=step.id, action=step.action, tool_name=step.tool, payload=step.input)
            report.results.append(result)
            report.logs.append(f"step={step.id} status={result.status} tool={result.tool or 'none'} attempts={result.attempts}")
        if report.results:
            report.final_output = ExecutionResultPayload.from_raw(report.results[-1].output)
        else:
            report.final_output = ExecutionResultPayload(kind='message', message='No steps to execute')
        return report

    def retry_steps(self, plan: ExecutionPlan, step_ids: set[int], suggestion: str | None = None) -> ExecutionReport:
        report = ExecutionReport(logs=[f'retry_suggestion={suggestion or "none"}'])
        for step in plan.steps:
            if step.id not in step_ids:
                continue
            payload = step.input
            if isinstance(payload, dict) and suggestion:
                payload = dict(payload)
                payload['critic_suggestion'] = suggestion
            result = self._execute_step(step_id=step.id, action=step.action, tool_name=step.tool, payload=payload)
            report.results.append(result)
            report.logs.append(f"retry_step={step.id} status={result.status} attempts={result.attempts}")
        if report.results:
            report.final_output = ExecutionResultPayload.from_raw(report.results[-1].output)
        return report

    def _execute_step(self, step_id: int, action: str, tool_name: str | None, payload: str | dict[str, Any] | None) -> StepExecutionResult:
        selected_tool = tool_name
        if selected_tool is None:
            descriptor = select_best_tool(action)
            selected_tool = descriptor.name if descriptor else None

        attempts = 0
        last_error: str | None = None
        while attempts < self._config.max_attempts_per_step:
            attempts += 1
            started_at = perf_counter()
            try:
                if not selected_tool:
                    output = {
                        'status': 'ok',
                        'tool': None,
                        'payload': payload,
                        'message': 'No tool selected; step processed as reasoning-only action.',
                    }
                    return StepExecutionResult(
                        step_id=step_id,
                        action=action,
                        tool=selected_tool,
                        input=payload,
                        output=output,
                        status='ok',
                        attempts=attempts,
                        telemetry={
                            'duration_ms': round((perf_counter() - started_at) * 1000, 3),
                            'selection_reason': 'No tool selected; reasoning-only step.',
                        },
                    )

                registry_tool = self._registry.tool(selected_tool)
                if registry_tool is None:
                    return StepExecutionResult(
                        step_id=step_id,
                        action=action,
                        tool=selected_tool,
                        input=payload,
                        output={
                            'status': 'unimplemented',
                            'tool': selected_tool,
                            'payload': payload,
                            'message': f"Tool '{selected_tool}' is not implemented in the execution registry.",
                        },
                        status='unimplemented',
                        attempts=attempts,
                        error=f"Tool '{selected_tool}' is not implemented in the execution registry.",
                        telemetry={
                            'duration_ms': round((perf_counter() - started_at) * 1000, 3),
                            'selection_reason': f"Tool '{selected_tool}' was selected but is not executable.",
                        },
                    )

                with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                    future = pool.submit(registry_tool.execute, self._serialize_payload(payload))
                    try:
                        output = future.result(timeout=self._config.step_timeout_seconds)
                    except concurrent.futures.TimeoutError:
                        last_error = f"Tool '{selected_tool}' timed out after {self._config.step_timeout_seconds}s"
                        continue
                if self._is_placeholder_output(output):
                    return StepExecutionResult(
                        step_id=step_id,
                        action=action,
                        tool=selected_tool,
                        input=payload,
                        output={
                            'status': 'unimplemented',
                            'tool': selected_tool,
                            'payload': payload,
                            'message': str(output),
                        },
                        status='unimplemented',
                        attempts=attempts,
                        error=f"Tool '{selected_tool}' only has a mirrored placeholder implementation.",
                        telemetry={
                            'duration_ms': round((perf_counter() - started_at) * 1000, 3),
                            'selection_reason': f"Tool '{selected_tool}' resolved to a placeholder shim.",
                        },
                    )

                return StepExecutionResult(
                    step_id=step_id,
                    action=action,
                    tool=selected_tool,
                    input=payload,
                    output=output,
                    status='ok',
                    attempts=attempts,
                    telemetry={
                        'duration_ms': round((perf_counter() - started_at) * 1000, 3),
                        'selection_reason': f"Tool '{selected_tool}' executed successfully.",
                    },
                )
            except Exception as exc:  # pragma: no cover - defensive branch
                last_error = str(exc)

        return StepExecutionResult(
            step_id=step_id,
            action=action,
            tool=selected_tool,
            input=payload,
            output=None,
            status='fail',
            attempts=attempts,
            error=last_error or 'unknown execution failure',
            telemetry={
                'selection_reason': f"Tool '{selected_tool}' raised an exception during execution." if selected_tool else 'Reasoning-only step failed.',
            },
        )

    @staticmethod
    def _serialize_payload(payload: str | dict[str, Any] | None) -> str:
        if payload is None:
            return ''
        if isinstance(payload, str):
            return payload
        return str(payload)

    @staticmethod
    def _is_placeholder_output(output: dict[str, Any] | str | None) -> bool:
        if isinstance(output, str):
            lowered = output.lower()
            return 'mirrored tool' in lowered or 'mirrored command' in lowered or 'placeholder' in lowered
        if isinstance(output, dict):
            message = str(output.get('message') or '').lower()
            status = str(output.get('status') or '').lower()
            return 'placeholder' in message or status == 'unimplemented'
        return False
