from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from core.agents import CriticAgent, ExecutionPlan, ExecutorAgent, PlanStep, PlannerAgent
from core.coordinator import Coordinator
from core.memory import FileBackedLongTermMemory


class OrchestrationEngineTests(unittest.TestCase):
    def test_simple_query_single_tool_plan(self) -> None:
        planner = PlannerAgent()
        plan = planner.build_plan('Read the current workspace status')
        self.assertEqual(len(plan.steps), 1)
        self.assertIsNotNone(plan.steps[0].tool)

        report = ExecutorAgent().execute_plan(plan)
        verdict = CriticAgent().validate(report)
        self.assertEqual(verdict.status, 'ok')

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

        with tempfile.TemporaryDirectory() as tmp_dir:
            memory = FileBackedLongTermMemory(base_dir=Path(tmp_dir))
            coordinator = Coordinator(executor=FailingExecutor(), memory_store=memory)
            result = coordinator.execute('Inspect and report', context={'session_id': 'retry-session'})
            self.assertIn(result.status, {'ok', 'retry', 'fail'})
            self.assertTrue(any('critic_status=retry' in line for line in result.logs))

    def test_memory_affects_planning(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            memory = FileBackedLongTermMemory(base_dir=Path(tmp_dir))
            coordinator = Coordinator(memory_store=memory)
            first = coordinator.execute('Store this memory entry', context={'session_id': 'memory-session'})
            self.assertTrue(first.logs)

            second = coordinator.execute('Use prior context and respond', context={'session_id': 'memory-session'})
            self.assertTrue(second.steps)
            step_input = second.steps[0].get('input', {})
            self.assertTrue(step_input.get('memory'))

    def test_api_health_and_execute(self) -> None:
        try:
            from fastapi.testclient import TestClient
            from api.server import app
        except Exception as exc:  # pragma: no cover - optional dependency skip
            self.skipTest(f'FastAPI test client unavailable: {exc}')
            return

        client = TestClient(app)
        health = client.get('/health')
        self.assertEqual(health.status_code, 200)
        self.assertEqual(health.json()['status'], 'ok')

        execute = client.post('/execute', json={'query': 'Summarize workspace', 'context': {}})
        self.assertEqual(execute.status_code, 200)
        payload = execute.json()
        self.assertIn('result', payload)
        self.assertIn('steps', payload)
        self.assertIn('logs', payload)


if __name__ == '__main__':
    unittest.main()
