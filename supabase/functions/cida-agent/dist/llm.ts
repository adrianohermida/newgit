export async function runLLM(messages: any[]) {
  const ACCOUNT_ID = Deno.env.get("CF_ACCOUNT_ID")!;
  const API_TOKEN = Deno.env.get("CF_API_TOKEN")!;

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages }),
    }
  );

  const data = await res.json();
  return data.result?.response || "Sem resposta.";
}