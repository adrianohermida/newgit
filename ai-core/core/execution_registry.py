from __future__ import annotations

from dataclasses import dataclass

from .commands import execute_command, get_executable_commands
from .tools import execute_tool, get_executable_tools


@dataclass(frozen=True)
class RegisteredCommand:
    name: str
    source_hint: str

    def execute(self, prompt: str) -> str:
        return execute_command(self.name, prompt).message


@dataclass(frozen=True)
class RegisteredTool:
    name: str
    source_hint: str

    def execute(self, payload: str) -> str:
        return execute_tool(self.name, payload).message


@dataclass(frozen=True)
class ExecutionRegistry:
    commands: tuple[RegisteredCommand, ...]
    tools: tuple[RegisteredTool, ...]

    def command(self, name: str) -> RegisteredCommand | None:
        lowered = name.lower()
        for command in self.commands:
            if command.name.lower() == lowered:
                return command
        return None

    def tool(self, name: str) -> RegisteredTool | None:
        lowered = name.lower()
        for tool in self.tools:
            if tool.name.lower() == lowered:
                return tool
        return None


def build_execution_registry() -> ExecutionRegistry:
    return ExecutionRegistry(
        commands=tuple(RegisteredCommand(module.name, module.source_hint) for module in get_executable_commands()),
        tools=tuple(RegisteredTool(module.name, module.source_hint) for module in get_executable_tools()),
    )
