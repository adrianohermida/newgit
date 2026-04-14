export function summarizeOrchestration(orchestration) {
  const subagents = Array.isArray(orchestration?.subagents) ? orchestration.subagents : [];
  const tasks = Array.isArray(orchestration?.tasks) ? orchestration.tasks : [];
  const availableModules = Array.isArray(orchestration?.available_modules) ? orchestration.available_modules : [];
  const parallelGroups = new Set(tasks.map((task) => task?.parallel_group).filter(Boolean));
  const stages = Array.from(new Set(tasks.map((task) => task?.stage).filter(Boolean)));
  const dependencyEdges = tasks.reduce((total, task) => total + (Array.isArray(task?.depends_on) ? task.depends_on : Array.isArray(task?.dependencies) ? task.dependencies : []).filter(Boolean).length, 0);
  return { availableModules, dependencyEdges, enabled: Boolean(orchestration?.multi_agent || subagents.length || tasks.length), multiAgent: Boolean(orchestration?.multi_agent), parallelGroups, stages, subagents, tasks };
}
