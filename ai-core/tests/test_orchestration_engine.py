from __future__ import annotations

import unittest
from pathlib import Path
import shutil
from uuid import uuid4

from core.agents import CriticAgent, ExecutionPlan, ExecutorAgent, PlanStep, PlannerAgent
from core.coordinator import Coordinator
from core.memory import FileBackedLongTermMemory


class OrchestrationEngineTests(unittest.TestCase):
    def _make_local_tmp_dir(self) -> Path:
        root = Path('.test_tmp_memory')
        root.mkdir(parents=True, exist_ok=True)
        target = root / uuid4().hex
        target.mkdir(parents=True, exist_ok=True)
        return target

    def test_simple_query_single_tool_plan(self) -> None:
        planner = PlannerAgent()
        plan = planner.build_plan('Read the current workspace status')
        self.assertEqual(len(plan.steps), 1)
        self.assertIsNotNone(plan.steps[0].tool)

        report = ExecutorAgent().execute_plan(plan)
        self.assertEqual(report.results[0].status, 'unimplemented')
        verdict = CriticAgent().validate(report)
        self.assertEqual(verdict.status, 'fail')

    def test_complex_query_generates_multiple_steps(self) -> None:
        planner = PlannerAgent()
        plan = planner.build_plan('Collect context and summarize findings and prepare final answer')
        self.assertGreaterEqual(len(plan.steps), 2)

    def test_critic_retry_path(self) -> None:
        class FailingExecutor(ExecutorAgent):
            def execute_plan(self, plan: ExecutionPlan):  # type: ignore[override]
                report = super().execute_plan(plan)
                report.results[0] = type(report.results[0])(
                    step_id=report.results[0].step_id,
                    action=report.results[0].action,
                    tool=report.results[0].tool,
                    input=report.results[0].input,
                    output=None,
                    status='fail',
                    attempts=1,
                    error='forced failure for retry test',
                )
                return report

        tmp_dir = self._make_local_tmp_dir()
        try:
            memory = FileBackedLongTermMemory(base_dir=tmp_dir)
            coordinator = Coordinator(executor=FailingExecutor(), memory_store=memory)
            result = coordinator.execute('Inspect and report', context={'session_id': 'retry-session'})
            self.assertIn(result.status, {'ok', 'retry', 'fail'})
            self.assertTrue(any('critic_status=retry' in line for line in result.logs))
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    def test_memory_affects_planning(self) -> None:
        tmp_dir = self._make_local_tmp_dir()
        try:
            memory = FileBackedLongTermMemory(base_dir=tmp_dir)
            coordinator = Coordinator(memory_store=memory)
            first = coordinator.execute('Store this memory entry', context={'session_id': 'memory-session'})
            self.assertTrue(first.logs)

            second = coordinator.execute('Use prior context and respond', context={'session_id': 'memory-session'})
            self.assertTrue(second.steps)
            step_input = second.steps[0].get('input', {})
            self.assertTrue(step_input.get('memory'))
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    def test_api_health_and_execute(self) -> None:
        from api.server import ExecuteRequest, execute_request, health

        self.assertEqual(health()['status'], 'ok')
        payload = execute_request(ExecuteRequest(query='Summarize workspace', context={}))
        self.assertIn('result', payload)
        self.assertIn('steps', payload)
        self.assertIn('logs', payload)
        self.assertEqual(payload['status'], 'fail')

    def test_executor_marks_missing_tool_as_unimplemented(self) -> None:
        plan = ExecutionPlan(
            goal='missing tool',
            steps=[PlanStep(id=1, action='use tool', tool='DefinitelyMissingTool', input={'query': 'x'})],
        )

        report = ExecutorAgent().execute_plan(plan)
        self.assertEqual(report.results[0].status, 'unimplemented')
        self.assertIn('not implemented', str(report.results[0].error))

    def test_critic_rejects_unimplemented_steps(self) -> None:
        from core.agents import ExecutionReport, StepExecutionResult

        verdict = CriticAgent().validate(
            ExecutionReport(
                results=[
                    StepExecutionResult(
                        step_id=1,
                        action='placeholder',
                        tool='MCPTool',
                        input={'query': 'placeholder'},
                        output={'status': 'unimplemented', 'message': 'Mirrored tool placeholder'},
                        status='unimplemented',
                        error='placeholder implementation',
                    )
                ],
                final_output={'status': 'unimplemented', 'message': 'Mirrored tool placeholder'},
            )
        )
        self.assertEqual(verdict.status, 'fail')


if __name__ == '__main__':
    unittest.main()
