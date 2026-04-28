// Adaptação mínima para Worker do core de agendamento real
// Dependências utilitárias simplificadas para rodar no Worker

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export async function agendarHandler(request: Request, env: any): Promise<Response> {
  let body: any = {};
  try {
    body = await request.json();
  } catch {}
  const { nome, email, telefone, observacoes, area, data, hora } = body;

  // Validação de campos obrigatórios
  const camposFaltando = [];
  if (!nome) camposFaltando.push('Nome');
  if (!email) camposFaltando.push('E-mail');
  if (!telefone) camposFaltando.push('Telefone');
  if (!area) camposFaltando.push('Área de interesse');
  if (!data) camposFaltando.push('Data');
  if (!hora) camposFaltando.push('Hora');
  if (camposFaltando.length > 0) {
    return new Response(JSON.stringify({
      ok: false,
      error: `Por favor, preencha os seguintes campos obrigatórios: ${camposFaltando.join(', ')}.`
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  // TODO: Integrar Google Calendar, Supabase, e-mail, etc.
  // Por enquanto, retorna um agendamento "realista" (mock avançado)
  return new Response(JSON.stringify({
    ok: true,
    message: "Agendamento recebido! (realista, mas sem integração externa)",
    recebido: { nome, email, telefone, observacoes, area, data, hora },
    agendamentoId: uuidv4(),
    tokens: {
      confirmacao: uuidv4(),
      cancelamento: uuidv4(),
      remarcacao: uuidv4(),
    },
    links: {
      confirmar: `https://hermidamaia.adv.br/confirmar?token=${uuidv4()}`,
      cancelar: `https://hermidamaia.adv.br/cancelar?token=${uuidv4()}`,
      remarcar: `https://hermidamaia.adv.br/remarcar?token=${uuidv4()}`,
    }
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
