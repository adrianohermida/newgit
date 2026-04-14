export function mapTaskRunSteps(steps, options) {
  const { runId, nowIso, fallbackDescription, normalizeTaskStepStatus, inferTaskPriority, classifyTaskAgent } = options;
  return (Array.isArray(steps) ? steps : []).map((step, index) => {
    const label = step?.action || step?.title || `Etapa ${index + 1}`;
    const dependencies = Array.isArray(step?.dependencies) ? step.dependencies : Array.isArray(step?.dependsOn) ? step.dependsOn : [];
    return {
      id: `${runId}_step_${index + 1}`,
      title: label,
      goal: label,
      description: label || fallbackDescription,
      step,
      steps: [label || fallbackDescription],
      status: normalizeTaskStepStatus(step?.status),
      priority: inferTaskPriority(step),
      assignedAgent: classifyTaskAgent(step),
      stage: step?.stage || null,
      parallelGroup: step?.parallel_group || null,
      moduleKeys: Array.isArray(step?.module_keys) ? step.module_keys : [],
      orchestrationTaskId: step?.id || step?.task_id || null,
      created_at: nowIso(),
      updated_at: nowIso(),
      logs: step?.error ? [step.error] : [],
      dependencies,
      dependencyCount: dependencies.length,
    };
  });
}
