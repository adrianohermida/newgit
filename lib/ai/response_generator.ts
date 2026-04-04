// /lib/ai/response_generator.ts
// Camada de resposta natural para o Dotobot Copilot

export function generateNaturalResponse({ intent, result, userInput, context }) {
  // Persona: Assistente jurídico formal, objetivo, humano, proativo
  // TODO: Expandir para cada intent
  if (intent === "chat") {
    if (/oi|ol[áa]|bom dia|boa tarde|boa noite/i.test(userInput)) {
      return "Olá, Dr. Adriano. Como posso auxiliar nas operações do escritório hoje?";
    }
    return "Estou à disposição para ajudar. Como posso auxiliar?";
  }
  if (intent === "query_data") {
    // Exemplo: prazos
    if (/prazo|compromisso|agenda/i.test(userInput)) {
      if (result && result.length > 0) {
        return `Encontrei ${result.length} compromissos importantes para hoje. Deseja visualizar detalhes ou receber um resumo?`;
      }
      return "Não localizei compromissos para hoje. Precisa de ajuda com outra consulta?";
    }
    return "Estou verificando as informações solicitadas. Por favor, aguarde um momento.";
  }
  if (intent === "unknown") {
    return "Não entendi completamente o que você precisa. Pode me dar mais detalhes?";
  }
  // Outras intenções podem ser expandidas aqui
  return "Estou processando sua solicitação. Assim que possível, trarei uma resposta detalhada.";
}
