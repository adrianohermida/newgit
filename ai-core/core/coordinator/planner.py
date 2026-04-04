class PlannerAgent:
    async def plan(self, input_text, memories, context):
        return {
            "goal": input_text,
            "steps": [
                {"id": 1, "action": "interpretar pedido"},
                {"id": 2, "action": "buscar dados relevantes"},
                {"id": 3, "action": "executar ação"},
                {"id": 4, "action": "gerar resposta"}
            ]
        }
