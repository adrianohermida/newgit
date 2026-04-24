import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export interface Tool {
  name: string;
  description: string;
  parameters: any;
  execute: (args: any) => Promise<any>;
}

export class AiOrchestrator {
  private supabase: any;
  private tools: Map<string, Tool> = new Map();
  private maxIterations = 5;
  private config: any;
  private systemPrompt: string;

  constructor(supabaseUrl: string, supabaseKey: string, config: any) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.config = config;
    this.systemPrompt = `
Você é o DotoBot v5.2, o assistente de IA oficial do escritório Hermida Maia Advocacia.
Sua missão é ser proativo, preciso e operacional.

DIRETRIZES DE COMPORTAMENTO:
1. Use as ferramentas disponíveis para consultar dados reais antes de responder.
2. Se o usuário pedir algo sobre clientes, tarefas ou tickets, use as ferramentas de CRM/Suporte.
3. Mantenha um tom profissional, mas amigável.
4. SEMPRE cite a base legal ou o contexto do processo quando disponível na memória RAG.
5. Se não encontrar uma informação, admita e sugira o próximo passo.

PADRÕES DE RESPOSTA (Baseados no Slack Bolt):
- Use formatação mrkdwn do Slack (*negrito*, _itálico_, > citações).
- Responda em tópicos quando houver muita informação.
- Não invente dados que não estão nas ferramentas ou na memória.
`;
    this.registerDefaultTools();
  }

  private registerDefaultTools() {
    const workspaceOps = [
      { name: "contact_lookup", desc: "Busca contato por email/telefone" },
      { name: "contact_update", desc: "Atualiza dados de um contato" },
      { name: "tasks_list", desc: "Lista tarefas pendentes" },
      { name: "task_create", desc: "Cria uma nova tarefa" },
      { name: "tickets_list", desc: "Lista tickets no Freshdesk" },
      { name: "deal_view", desc: "Visualiza detalhes de um negócio" }
    ];

    workspaceOps.forEach(op => {
      this.registerTool({
        name: op.name,
        description: op.desc,
        parameters: {},
        execute: async (args) => this.callWorkspaceOp(op.name, args)
      });
    });

    this.registerTool({
      name: "cloudflare_agent_info",
      description: "Fornece informações sobre o Cloudflare Agents SDK e melhores práticas",
      parameters: { topic: "string" },
      execute: async (args) => {
        return "O Cloudflare Agents SDK permite criar agentes com estado persistente usando Durable Objects. Use `runFiber()` para garantir resiliência e `setState()` para persistência.";
      }
    });
  }

  private registerTool(tool: Tool) {
    this.tools.set(tool.name, tool);
  }

  private async callWorkspaceOp(op: string, params: any) {
    const response = await fetch(`${this.config.AI_CORE_URL}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: op, params })
    });
    return response.json();
  }

  private async getConversationHistory(userId: string, limit = 5) {
    const { data } = await this.supabase
      .from("dotobot_memory")
      .select("content, metadata")
      .eq("metadata->>user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    
    return data?.reverse().map((m: any) => ({
      role: m.metadata?.role || "user",
      content: m.content
    })) || [];
  }

  private async searchHybridMemory(query: string) {
    const { data, error } = await this.supabase.rpc("hybrid_search_dotobot_memory", {
      query_text: query,
      match_count: 3
    });
    if (error) return "";
    return data.map((d: any) => d.content).join("\n---\n");
  }

  async orchestrate(prompt: string, userId: string) {
    const history = await this.getConversationHistory(userId);
    const context = await this.searchHybridMemory(prompt);
    
    const fullSystemPrompt = `${this.systemPrompt}\n\nCONTEXTO RAG:\n${context}\n\nFerramentas disponíveis: ${Array.from(this.tools.keys()).join(", ")}`;

    const llmResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${this.config.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.config.CLOUDFLARE_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: fullSystemPrompt },
            ...history,
            { role: "user", content: prompt }
          ]
        }),
      }
    ).then(res => res.json());

    const answer = llmResponse.result?.response || "Desculpe, não consegui processar sua solicitação agora.";

    await this.supabase.from("dotobot_memory").insert([
      { content: prompt, metadata: { user_id: userId, role: "user" } },
      { content: answer, metadata: { user_id: userId, role: "assistant" } }
    ]);

    return {
      answer,
      steps: 1,
      context_used: context.length > 0
    };
  }
}
