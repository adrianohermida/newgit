const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

export async function getMemory(channel: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/messages?channel=eq.${channel}&order=created_at.desc&limit=10`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    }
  );

  return await res.json();
}

export async function saveMemory(channel: string, role: string, content: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
    },
    body: JSON.stringify({
      channel,
      role,
      content,
    }),
  });
}