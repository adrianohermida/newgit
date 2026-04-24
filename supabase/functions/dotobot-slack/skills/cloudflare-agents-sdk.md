# Skill: Cloudflare Agents SDK (v5.1)

Esta skill ensina o DotoBot a construir e gerenciar agentes de IA utilizando o Cloudflare Agents SDK, permitindo estado persistente, agendamento e orquestração durável.

## Capacidades do SDK

- **Estado Persistente**: Armazenamento via SQLite auto-sincronizado com `setState`.
- **Chamadas RPC**: Métodos decorados com `@callable()` invocáveis via WebSocket.
- **Agendamento**: Tarefas únicas (`schedule`), recorrentes (`scheduleEvery`) ou via cron.
- **Workflows**: Processamento durável em múltiplas etapas via `AgentWorkflow`.
- **Execução Durável**: `runFiber()` e `stash()` para garantir que o trabalho sobreviva a reinicializações.
- **Filas (Queues)**: Fila FIFO integrada com retries automáticos.
- **Integração MCP**: Conexão com servidores MCP ou criação de servidores próprios com `McpAgent`.

## Configuração Wrangler (wrangler.jsonc)

```json
{
  "compatibility_flags": ["nodejs_compat"],
  "durable_objects": {
    "bindings": [{ "name": "MyAgent", "class_name": "MyAgent" }]
  },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["MyAgent"] }],
  "ai": { "binding": "AI" }
}
```

## Exemplo de Agente Base

```ts
import { Agent, routeAgentRequest, callable } from "agents";

export class DotoBotAgent extends Agent<Env, { count: number }> {
  initialState = { count: 0 };

  @callable()
  async processTask(data: any) {
    this.setState({ count: this.state.count + 1 });
    // Lógica multitarefa aqui
    return { status: "success", current: this.state.count };
  }
}
```

## Melhores Práticas

1. **Sempre use `this.setState`**: Nunca modifique `this.state` diretamente para garantir a persistência.
2. **Evite Decoradores Experimentais**: Não ative `experimentalDecorators` no tsconfig, pois quebra o `@callable`.
3. **Use `runFiber` para I/O**: Garante que operações de rede longas não sejam perdidas se o Worker for despejado.
4. **Busca Híbrida**: Combine o Agents SDK com o `Vectorize` para RAG de alta performance.

## Comandos de Referência

- `this.schedule(delay, "task", payload)`: Agenda uma tarefa.
- `this.broadcast(msg)`: Envia mensagem para todos os clientes conectados.
- `this.sql`SELECT...``: Consulta direta ao banco SQLite do agente.
