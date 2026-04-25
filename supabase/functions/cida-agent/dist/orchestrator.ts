import { tools } from "./tools.ts";
import { detectIntent, extractCNJ } from "./intent.ts";
import { runLLM } from "./llm.ts";
import { getMemory, saveMemory } from "./memory.ts";
import { SYSTEM_PROMPT } from "./personality.ts";

export async function agent(input: string, channel: string) {
  const history = await getMemory(channel);

  const intent = detectIntent(input);
  const cnj = extractCNJ(input);

  if (intent === "processo" && cnj) {
    return await tools.consultar_processo(cnj);
  }

  if (intent === "agendamento") {
    return await tools.criar_agendamento({ texto: input });
  }

  if (intent === "lead") {
    return await tools.criar_contato({ texto: input });
  }

  const knowledge = await tools.buscar_conhecimento(input);

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((m: any) => ({ role: m.role, content: m.content })),
    {
      role: "user",
      content: input + "\n\nContexto:\n" + JSON.stringify(knowledge),
    },
  ];

  const response = await runLLM(messages);

  await saveMemory(channel, "user", input);
  await saveMemory(channel, "assistant", response);

  return response;
}