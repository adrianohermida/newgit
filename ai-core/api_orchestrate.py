from fastapi import FastAPI, Request
from ai-core.core.coordinator.orchestrator import Orchestrator
from ai-core.core.coordinator.planner import PlannerAgent
from ai-core.core.coordinator.executor import ExecutorAgent
from ai-core.core.coordinator.critic import CriticAgent
from ai-core.core.memory.supabase_memory import SupabaseMemory
from ai-core.core.memory.obsidian_sync import ObsidianSync
import uvicorn

app = FastAPI()

@app.post("/orchestrate")
async def orchestrate(request: Request):
    data = await request.json()
    user_input = data.get("input", "")
    context = data.get("context", {})

    # Instanciar agentes
    planner = PlannerAgent()
    executor = ExecutorAgent()
    critic = CriticAgent()
    memory = SupabaseMemory()  # ou combine com ObsidianSync se desejar

    orchestrator = Orchestrator(planner, executor, critic, memory)
    result = await orchestrator.run(user_input, context)
    return {"result": result}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
