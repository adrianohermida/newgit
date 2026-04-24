import { executeWorkspaceOp } from "../lib/workspace-ops.js";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface OrchestrationStep {
  thought: string;
  tool?: string;
  tool_input?: Record<string, unknown>;
  observation?: string;
}

export class AiOrchestrator {
  private env: Record<string, string>;
  private aiCoreUrl: string;
  private gatewaySecret: string;

  constructor(env: Record<string, string>) {
    this.env = env;
    this.aiCoreUrl = env.AI_CORE_URL || "https://ai.aetherlab.com.br";
    this.gatewaySecret = env.HMADV_GATEWAY_SECRET || env.FREDDY_ACTION_SHARED_SECRET || "";
  }

  /**
   * Mapeia as operações do workspace-ops para definições de ferramentas da IA
   */
  getAvailableTools(): ToolDefinition[] {
    return [
      {
        name: "cloudflare_agent_build",
        description: "Gera código base para um novo agente de IA usando o Cloudflare Agents SDK.",
        parameters: { name: "string", capabilities: "string[] (ex: ['state', 'schedule', 'rpc'])" }
      },
      {
        name: "daily_summary",
        description: "Gera um resumo diário operacional (deals, faturas, audiências, tickets).",
        parameters: {}
      },
      {
        name: "contact_lookup",
        description: "Busca detalhes de um contato no Freshsales pelo e-mail.",
        parameters: { email: "string" }
      },
      {
        name: "contact_update",
        description: "Atualiza dados de um contato no Freshsales.",
        parameters: { id: "string", patch: "object (ex: { mobile_number: '...' })" }
      },
      {
        name: "account_view",
        description: "Visualiza detalhes de uma conta (empresa/cliente) no Freshsales.",
        parameters: { id: "string" }
      },
      {
        name: "deal_view",
        description: "Visualiza detalhes de um negócio (deal) no Freshsales.",
        parameters: { id: "string" }
      },
      {
        name: "deal_update",
        description: "Atualiza um negócio (deal) no Freshsales.",
        parameters: { id: "string", patch: "object" }
      },
      {
        name: "tasks_list",
        description: "Lista as tarefas pendentes no Freshsales.",
        parameters: { limit: "number" }
      },
      {
        name: "task_view",
        description: "Visualiza detalhes de uma tarefa específica.",
        parameters: { id: "string" }
      },
      {
        name: "task_create",
        description: "Cria uma nova tarefa no Freshsales.",
        parameters: { title: "string", description: "string", due_date: "string (YYYY-MM-DD)", targetable_type: "string (Contact/SalesAccount)", targetable_id: "string" }
      },
      {
        name: "task_update",
        description: "Atualiza uma tarefa existente.",
        parameters: { id: "string", patch: "object" }
      },
      {
        name: "task_delete",
        description: "Remove uma tarefa do Freshsales.",
        parameters: { id: "string" }
      },
      {
        name: "tickets_list",
        description: "Lista os últimos tickets de suporte no Freshdesk.",
        parameters: { limit: "number" }
      },
      {
        name: "ticket_view",
        description: "Visualiza detalhes de um ticket no Freshdesk.",
        parameters: { id: "string" }
      },
      {
        name: "ticket_create",
        description: "Cria um novo ticket no Freshdesk.",
        parameters: { subject: "string", description: "string", email: "string", priority: "number (1-4)", status: "number (2-5)" }
      },
      {
        name: "conversation_threads",
        description: "Busca threads de conversa do Agentlab/WhatsApp por e-mail do cliente.",
        parameters: { email: "string", limit: "number" }
      }
    ];
  }

  /**
   * Loop de orquestração multitarefa (ReAct)
   */
  async run(query: string, context: any = {}): Promise<{ result: string; steps: OrchestrationStep[] }> {
    const steps: OrchestrationStep[] = [];
    const tools = this.getAvailableTools();
    let iterations = 0;
    const maxIterations = 5; // Aumentado para permitir tarefas mais complexas

    while (iterations < maxIterations) {
      iterations++;
      
      // 1. Planejar/Pensar usando o ai-core
      const prompt = this.buildOrchestrationPrompt(query, steps, tools, context);
      const aiResponse = await this.callAi(prompt, context.session_id);
      
      const parsed = this.parseAiResponse(aiResponse);
      
      // Se a IA não retornar um pensamento válido ou decidir parar
      if (!parsed || !parsed.thought) {
        break;
      }

      steps.push({ thought: parsed.thought, tool: parsed.tool, tool_input: parsed.tool_input });

      if (!parsed.tool) {
        return { result: parsed.thought, steps };
      }

      // 2. Executar Ferramenta
      try {
        const opResult = await executeWorkspaceOp(this.env, parsed.tool, parsed.tool_input);
        const observation = opResult.ok ? (opResult.text || JSON.stringify(opResult.data)) : `Erro: ${opResult.text}`;
        steps[steps.length - 1].observation = observation;
      } catch (e) {
        steps[steps.length - 1].observation = `Erro na execução: ${String(e)}`;
      }
    }

    // Fallback se estourar iterações
    const lastThought = steps[steps.length - 1]?.thought || "Não consegui concluir a tarefa.";
    return { result: lastThought, steps };
  }

  private async callAi(prompt: string, sessionId: string) {
    const resp = await fetch(`${this.aiCoreUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.gatewaySecret ? { "x-hmadv-secret": this.gatewaySecret } : {}),
      },
      body: JSON.stringify({
        session_id: sessionId,
        system: "Você é o cérebro do DotoBot v5.1, um orquestrador multitarefa jurídico. Use as ferramentas para resolver a solicitação do usuário. Responda APENAS em formato JSON.",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 800,
        temperature: 0,
      }),
    });
    
    if (!resp.ok) return JSON.stringify({ thought: "Erro ao conectar com o ai-core.", tool: null });
    
    const data = await resp.json();
    return data?.content?.[0]?.text || data?.text || "";
  }

  private buildOrchestrationPrompt(query: string, steps: OrchestrationStep[], tools: ToolDefinition[], context: any) {
    return `
Usuário: ${query}
Contexto do Escritório: ${JSON.stringify(context)}

Ferramentas Disponíveis:
${JSON.stringify(tools, null, 2)}

Histórico de Execução:
${steps.map((s, i) => `Passo ${i+1}:
Pensamento: ${s.thought}
Ação: ${s.tool}(${JSON.stringify(s.tool_input)})
Observação: ${s.observation}`).join("\n\n")}

Instruções:
1. Analise a solicitação e o histórico.
2. Se precisar de mais informações, use uma ferramenta.
3. Se já tiver a resposta final, defina "tool" como null.
4. Responda SEMPRE no formato JSON:
{
  "thought": "seu raciocínio detalhado",
  "tool": "nome_da_ferramenta_ou_null",
  "tool_input": { "param": "valor" }
}
`;
  }

  private parseAiResponse(text: string) {
    try {
      const jsonStr = text.replace(/```json/g, "").replace(/```/g, "").trim();
      return JSON.parse(jsonStr);
    } catch {
      return { thought: text, tool: null, tool_input: {} };
    }
  }
}
