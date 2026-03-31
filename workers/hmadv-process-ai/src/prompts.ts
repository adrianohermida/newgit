export const SYSTEM_PROMPT = `
Voce e um analista juridico operacional para CRM.
Leia eventos e historicos processuais e devolva JSON estrito.
Nunca responda fora de JSON.
Quando houver pouca evidencia, prefira "baixa" confianca a inventar dados.
Prioridades:
- resumir andamentos, publicacoes e audiencias;
- detectar mudancas de status, fase e instancia;
- identificar inconsistencias;
- reconhecer conclusao, remessa, decisao e despacho como sinais relevantes do processo;
- sugerir anotacoes automaticas;
- sugerir tarefas e prazos preditivos;
- ignorar publicacoes de leilao/leiloes.
`;

export function buildActivityPrompt(payload: unknown) {
  return `
Analise o evento processual abaixo e responda apenas JSON com este formato:
{
  "kind": "andamento|publicacao|audiencia|outro",
  "summary_title": "string",
  "summary_note": "string",
  "status_signal": "ativo|baixado|suspenso|arquivado|indefinido",
  "phase_signal": "string|null",
  "instance_signal": "1|2|3|null",
  "hearing_detected": true,
  "hearing_date": "ISO|null",
  "deadline_detected": true,
  "deadline_date": "ISO|null",
  "movement_signal": "audiencia|publicacao|conclusao|remessa|decisao|despacho|outro",
  "predictive_task": {
    "should_create": true,
    "title": "string|null",
    "note": "string|null",
    "due_at": "ISO|null",
    "priority": "baixa|media|alta|null"
  },
  "inconsistencies": ["string"],
  "confidence": "alta|media|baixa"
}

Evento:
${JSON.stringify(payload, null, 2)}
`;
}

export function buildProcessPrompt(payload: unknown) {
  return `
Analise o historico consolidado do processo abaixo e responda apenas JSON com este formato:
{
  "account_note_title": "string",
  "account_note_body": "string",
  "current_status": "ativo|baixado|suspenso|arquivado|indefinido",
  "current_phase": "string|null",
  "current_instance": "1|2|3|null",
  "movement_signals": ["audiencia|publicacao|conclusao|remessa|decisao|despacho"],
  "latest_relevant_event": {
    "kind": "andamento|publicacao|audiencia|outro",
    "title": "string",
    "event_at": "ISO|null"
  },
  "inconsistencies": ["string"],
  "tasks": [
    {
      "title": "string",
      "note": "string",
      "due_at": "ISO|null",
      "priority": "baixa|media|alta"
    }
  ],
  "account_field_updates": {
    "status": "string|null",
    "fase": "string|null",
    "instancia": "string|null",
    "descricao_ultimo_movimento": "string|null",
    "data_ultimo_movimento": "ISO|null",
    "diario": "string|null",
    "publicacao_em": "ISO|null",
    "conteudo_publicacao": "string|null"
  },
  "confidence": "alta|media|baixa"
}

Historico consolidado:
${JSON.stringify(payload, null, 2)}
`;
}

