import httpx

class SupabaseMemory:
    async def store(self, query, response):
        await httpx.post(
            "https://SEU_SUPABASE/rest/v1/rpc/upsert_dotobot_memory_embedding",
            json={
                "query": query,
                "response_text": str(response)
            },
            headers={
                "apikey": "SUPABASE_KEY"
            }
        )

    async def search(self, query):
        res = await httpx.post(
            "https://SEU_SUPABASE/rest/v1/rpc/match_dotobot_memory_embeddings",
            json={
                "query_embedding": query
            }
        )
        return res.json()
