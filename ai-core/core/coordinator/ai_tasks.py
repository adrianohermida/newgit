from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any

from ..agents import CriticVerdict, ExecutionPlan, StepExecutionResult


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _infer_action(step_action: str, tool: str | None, payload: Any) -> dict[str, Any] | None:
    text = f"{step_action} {tool or ''} {payload or ''}".lower()
    if any(token in text for token in ("open_url", "navigate", "url", "site", "pagina")):
        return {"type": "navigate", "url": _extract_url(payload)}
    if any(token in text for token in ("click", "botao", "button")):
        return {"type": "click"}
    if any(token in text for token in ("input", "fill", "campo", "form")):
        return {"type": "input"}
    if tool:
        return {"type": "command", "command": tool, "payload": payload if isinstance(payload, dict) else {"raw": payload}}
    return None


def _extract_url(payload: Any) -> str | None:
    if isinstance(payload, dict):
        for key in ("url", "target", "href"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    if isinstance(payload, str) and payload.startswith("http"):
        return payload
    return None


def _requires_approval(action: dict[str, Any] | None) -> bool:
    if not action:
        return False
    if action["type"] in {"click", "input"}:
        return True
    if action["type"] == "navigate":
        url = str(action.get("url") or "")
        return bool(url and not ("127.0.0.1" in url or "localhost" in url or url.startswith("file:")))
    return False


def _step_status(result: StepExecutionResult | None, action: dict[str, Any] | None) -> str:
    if result is None:
        return "awaiting_approval" if _requires_approval(action) else "pending"
    if _requires_approval(action) and result.status in {"unimplemented", "retry"}:
        return "awaiting_approval"
    return {
        "ok": "done",
        "fail": "error",
        "retry": "error",
        "unimplemented": "pending",
    }.get(result.status, "pending")


def _task_status(steps: list[dict[str, Any]], verdict: CriticVerdict | None) -> str:
    statuses = {step["status"] for step in steps}
    if "awaiting_approval" in statuses:
        return "awaiting_approval"
    if "error" in statuses:
        return "error"
    if statuses and statuses == {"done"} and verdict and verdict.status == "ok":
        return "completed"
    if "done" in statuses:
        return "running"
    return "pending"


def build_ai_tasks(
    session_id: str,
    plan: ExecutionPlan | None,
    results: list[StepExecutionResult],
    logs: list[str],
    verdict: CriticVerdict | None,
) -> list[dict[str, Any]]:
    if plan is None:
        return []

    result_map = {result.step_id: result for result in results}
    created_at = _now_iso()
    ai_tasks: list[dict[str, Any]] = []
    orchestration_tasks = plan.orchestration.get("tasks", []) if isinstance(plan.orchestration, dict) else []

    if orchestration_tasks:
        for raw_task in orchestration_tasks:
            step_id = int(str(raw_task.get("id", "task_0")).split("_")[-1] or 0)
            matching_step = next((step for step in plan.steps if step.id == step_id), None)
            if matching_step is None:
                continue
            result = result_map.get(matching_step.id)
            action = _infer_action(matching_step.action, matching_step.tool, matching_step.input)
            step_payload = {
                "id": f"{session_id}_step_{matching_step.id}",
                "planStepId": matching_step.id,
                "description": matching_step.action,
                "status": _step_status(result, action),
                "action": action,
                "output": asdict(result) if result is not None else None,
                "error": result.error if result is not None else None,
            }
            ai_tasks.append({
                "id": f"{session_id}_{raw_task.get('id', f'task_{matching_step.id}')}",
                "sessionId": session_id,
                "title": str(raw_task.get("title") or matching_step.action),
                "goal": plan.goal,
                "source": "planner",
                "status": _task_status([step_payload], verdict),
                "progressPct": 100 if step_payload["status"] == "done" else 0,
                "currentStepId": step_payload["id"] if step_payload["status"] != "done" else None,
                "createdAt": created_at,
                "updatedAt": created_at,
                "steps": [step_payload],
                "logs": [line for line in logs if f"step={matching_step.id}" in line or f"retry_step={matching_step.id}" in line],
                "orchestration": {
                    "agentId": raw_task.get("agent_id"),
                    "agentRole": raw_task.get("agent_role"),
                    "stage": raw_task.get("stage"),
                    "tool": raw_task.get("tool"),
                    "moduleKeys": list(raw_task.get("module_keys", [])),
                    "dependsOn": list(raw_task.get("depends_on", [])),
                    "parallelGroup": raw_task.get("parallel_group"),
                },
            })
        return ai_tasks

    fallback_steps = []
    for step in plan.steps:
        result = result_map.get(step.id)
        action = _infer_action(step.action, step.tool, step.input)
        fallback_steps.append({
            "id": f"{session_id}_step_{step.id}",
            "planStepId": step.id,
            "description": step.action,
            "status": _step_status(result, action),
            "action": action,
            "output": asdict(result) if result is not None else None,
            "error": result.error if result is not None else None,
        })

    progress = int((sum(1 for step in fallback_steps if step["status"] == "done") / max(1, len(fallback_steps))) * 100)
    return [{
        "id": f"{session_id}_task_1",
        "sessionId": session_id,
        "title": plan.goal,
        "goal": plan.goal,
        "source": "planner",
        "status": _task_status(fallback_steps, verdict),
        "progressPct": progress,
        "currentStepId": next((step["id"] for step in fallback_steps if step["status"] != "done"), None),
        "createdAt": created_at,
        "updatedAt": created_at,
        "steps": fallback_steps,
        "logs": list(logs),
        "orchestration": {},
    }]
