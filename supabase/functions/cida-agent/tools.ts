const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

export const tools = {
  async buscar_conhecimento(query: string) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_knowledge_chunks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
      },
      body: JSON.stringify({ query_text: query }),
    });

    return await res.json();
  },

  async criar_contato(data: any) {
    console.log("TOOL criar_contato:", data);

    // 🔥 aqui entra Freshsales depois
    return {
      status: "ok",
      message: "Contato registrado com sucesso."
    };
  },

  async consultar_processo(cnj: string) {
    console.log("TOOL consultar_processo:", cnj);

    // 🔥 depois conecta DataJud / API real
    return `Estou consultando o processo ${cnj}. Em breve trago detalhes.`;
  },

  async criar_agendamento(data: any) {
    console.log("TOOL agendamento:", data);

    return "Vamos agendar. Qual melhor dia e horário para você?";
  }
};