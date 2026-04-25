import { tools } from "./tools.ts";

export async function getKnowledge(query: string) {
  try {
    const result = await tools.buscar_conhecimento(query);

    if (!result || result.length === 0) return null;

    return result.map((r: any) => r.content).join("\n");
  } catch (err) {
    console.error("RAG ERROR:", err);
    return null;
  }
}