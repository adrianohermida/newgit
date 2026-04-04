class ExecutorAgent:
    async def execute(self, plan):
        results = []
        for step in plan["steps"]:
            results.append({
                "step": step["action"],
                "status": "done"
            })
        return results
