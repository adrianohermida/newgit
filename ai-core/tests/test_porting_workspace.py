from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path

from src.commands import PORTED_COMMANDS
from src.execution_registry import build_execution_registry
from src.parity_audit import run_parity_audit
from src.port_manifest import build_port_manifest
from src.query_engine import QueryEnginePort
from src.runtime import PortRuntime
from src.tools import PORTED_TOOLS


class PortingWorkspaceTests(unittest.TestCase):
    def test_manifest_counts_python_files(self) -> None:
        manifest = build_port_manifest()
        self.assertGreaterEqual(manifest.total_python_files, 20)
        self.assertTrue(manifest.top_level_modules)

    def test_query_engine_summary_mentions_workspace(self) -> None:
        summary = QueryEnginePort.from_workspace().render_summary()
        self.assertIn('Python Porting Workspace Summary', summary)
        self.assertIn('Command catalog:', summary)
        self.assertIn('Tool catalog:', summary)

    def test_root_file_coverage_is_complete_when_local_archive_exists(self) -> None:
        audit = run_parity_audit()
        if audit.archive_present:
            self.assertEqual(audit.root_file_coverage[0], audit.root_file_coverage[1])
            self.assertGreaterEqual(audit.directory_coverage[0], 28)
            self.assertGreaterEqual(audit.command_entry_ratio[0], 150)
            self.assertGreaterEqual(audit.tool_entry_ratio[0], 100)

    def test_command_and_tool_snapshots_are_nontrivial(self) -> None:
        self.assertGreaterEqual(len(PORTED_COMMANDS), 150)
        self.assertGreaterEqual(len(PORTED_TOOLS), 100)

    def test_subsystem_packages_expose_archive_metadata(self) -> None:
        from src import assistant, bridge, utils

        self.assertGreater(assistant.MODULE_COUNT, 0)
        self.assertGreater(bridge.MODULE_COUNT, 0)
        self.assertGreater(utils.MODULE_COUNT, 100)
        self.assertTrue(utils.SAMPLE_FILES)

    def test_route_prompt_prefers_command_and_tool_matches(self) -> None:
        matches = PortRuntime().route_prompt('review MCP tool', limit=5)
        self.assertTrue(matches)
        self.assertIn('command', {match.kind for match in matches})
        self.assertIn('tool', {match.kind for match in matches})

    def test_bootstrap_session_tracks_turn_state(self) -> None:
        session = PortRuntime().bootstrap_session('review MCP tool', limit=5)
        self.assertGreaterEqual(len(session.turn_result.matched_tools), 1)
        self.assertIn('Prompt:', session.turn_result.output)
        self.assertGreaterEqual(session.turn_result.usage.input_tokens, 1)
        self.assertTrue(Path(session.persisted_session_path).name.endswith('.json'))

    def test_turn_loop_returns_structured_stop_reason(self) -> None:
        results = PortRuntime().run_turn_loop('review MCP tool', limit=5, max_turns=2, structured_output=True)
        self.assertTrue(results)
        self.assertIn(results[0].stop_reason, {'completed', 'max_budget_reached', 'max_turns_reached'})
        self.assertTrue(results[0].output)

    def test_execution_registry_runs(self) -> None:
        registry = build_execution_registry()
        self.assertEqual(len(registry.commands), 0)
        self.assertEqual(len(registry.tools), 0)
        self.assertIsNone(registry.command('review'))
        self.assertIsNone(registry.tool('MCPTool'))

    def test_catalog_entries_are_explicitly_placeholder_backed(self) -> None:
        self.assertTrue(PORTED_COMMANDS)
        self.assertTrue(PORTED_TOOLS)
        self.assertEqual(PORTED_COMMANDS[0].status, 'mirrored')
        self.assertEqual(PORTED_COMMANDS[0].execution_status, 'placeholder')
        self.assertEqual(PORTED_TOOLS[0].status, 'mirrored')
        self.assertEqual(PORTED_TOOLS[0].execution_status, 'placeholder')

    def test_load_session_cli_runs(self) -> None:
        session = PortRuntime().bootstrap_session('review MCP tool', limit=5)
        session_id = Path(session.persisted_session_path).stem
        result = subprocess.run(
            [sys.executable, '-m', 'src.main', 'load-session', session_id],
            check=True,
            capture_output=True,
            text=True,
        )
        self.assertIn(session_id, result.stdout)
        self.assertIn('messages', result.stdout)

    def test_summary_cli_runs(self) -> None:
        result = subprocess.run(
            [sys.executable, '-m', 'src.main', 'summary'],
            check=True,
            capture_output=True,
            text=True,
        )
        self.assertIn('Python Porting Workspace Summary', result.stdout)

    def test_orchestrate_cli_runs(self) -> None:
        result = subprocess.run(
            [sys.executable, '-m', 'src.main', 'orchestrate', 'summarize workspace', '--context', '{"channel":"cli"}'],
            check=True,
            capture_output=True,
            text=True,
        )
        self.assertIn('"status"', result.stdout)
        self.assertIn('"steps"', result.stdout)


if __name__ == '__main__':
    unittest.main()
