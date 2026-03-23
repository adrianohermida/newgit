#!/usr/bin/env node
// scripts/test-integration.js
// Testa o fluxo completo da API de agendamento contra o servidor local (wrangler pages dev)
// Uso: npm run test:integration

// wrangler pages dev usa 8788 por padrão; wrangler dev usa 8787
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:8788';

const PAYLOAD_AGENDAR = {
  nome: 'Teste CI',
  email: 'dev@hermidamaia.com.br',
  telefone: '11999999999',
  area: 'Superendividamento',
  data: '2026-04-15',
  hora: '09:00',
};

const results = [];

function log(step, status, detail = '') {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️ ';
  const line = `${icon}  [${step}] ${status}${detail ? ' — ' + detail : ''}`;
  results.push({ step, status, detail });
  console.log(line);
}

function formatErrorBody(body) {
  if (!body || typeof body !== 'object') {
    return '';
  }

  const extras = [];
  if (body.detail) extras.push(`detail=${body.detail}`);
  if (body.route) extras.push(`route=${body.route}`);
  if (Array.isArray(body.ausentes) && body.ausentes.length > 0) {
    extras.push(`ausentes=${body.ausentes.join(',')}`);
  }
  if (body.stage) extras.push(`stage=${body.stage}`);
  return extras.length > 0 ? ` (${extras.join(' | ')})` : '';
}

async function testSlotsMonth() {
  const step = 'GET /api/slots-month?mes=2026-03';
  try {
    const res = await fetch(`${BASE_URL}/api/slots-month?mes=2026-03`);
    const body = await res.json();
    if (!res.ok) {
      log(step, 'FAIL', `HTTP ${res.status}: ${body.error || JSON.stringify(body)}${formatErrorBody(body)}`);
      return null;
    }
    if (!body.ok || typeof body.slots !== 'object') {
      log(step, 'FAIL', `Resposta inesperada: ${JSON.stringify(body)}`);
      return null;
    }
    const totalDias = Object.keys(body.slots).length;
    const totalSlots = Object.values(body.slots).reduce((acc, s) => acc + s.length, 0);
    log(step, 'PASS', `${totalDias} dias com slots, ${totalSlots} slots disponíveis no total`);
    return body.slots;
  } catch (err) {
    log(step, 'FAIL', err.message);
    return null;
  }
}

async function testAgendar() {
  const step = 'POST /api/agendar';
  try {
    const res = await fetch(`${BASE_URL}/api/agendar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(PAYLOAD_AGENDAR),
    });
    const body = await res.json();

    // 409 = horário ocupado (slot real do Google Calendar) — aceitável em CI
    if (res.status === 409) {
      log(step, 'WARN', `Horário ${PAYLOAD_AGENDAR.hora} já ocupado no Google Calendar (esperado em CI)`);
      return null;
    }
    if (!res.ok || !body.ok) {
      log(step, 'FAIL', `HTTP ${res.status}: ${body.error || JSON.stringify(body)}${formatErrorBody(body)}`);
      return null;
    }
    log(step, 'PASS', `agendamentoId=${body.agendamentoId} | eventId=${body.eventId}`);
    return body;
  } catch (err) {
    log(step, 'FAIL', err.message);
    return null;
  }
}

async function testConfirmar(token) {
  const step = 'GET /api/confirmar?token=...';
  if (!token) {
    log(step, 'WARN', 'Pulado — token não disponível (etapa anterior falhou ou horário ocupado)');
    return;
  }
  try {
    const res = await fetch(`${BASE_URL}/api/confirmar?token=${token}`, {
      redirect: 'manual',
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.status === 200 && contentType.includes('text/html')) {
      const html = await res.text();
      if (html.includes('Confirmado') || html.includes('confirmado')) {
        log(step, 'PASS', 'Página de sucesso retornada corretamente');
      } else {
        log(step, 'FAIL', 'HTML de sucesso não contém texto esperado');
      }
    } else if (res.status === 404) {
      log(step, 'FAIL', 'Token não encontrado no Supabase');
    } else if (res.status === 410) {
      log(step, 'WARN', 'Token expirado (OK se etapa 2 foi executada há mais de 24h)');
    } else if (res.status === 400) {
      const body = contentType.includes('application/json') ? await res.json().catch(() => null) : await res.text();
      log(step, 'FAIL', `HTTP 400: ${typeof body === 'string' ? body : body?.error || 'Token inválido'}`);
    } else {
      log(step, 'FAIL', `HTTP ${res.status} inesperado`);
    }
  } catch (err) {
    log(step, 'FAIL', err.message);
  }
}

async function checkServer() {
  try {
    await fetch(`${BASE_URL}/api/slots-month?mes=2026-01`, { signal: AbortSignal.timeout(3000) });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  Teste de Integração — Hermida Maia API');
  console.log(`  Base URL: ${BASE_URL}`);
  console.log('══════════════════════════════════════════════\n');

  const online = await checkServer();
  if (!online) {
    console.error(`❌  Servidor não encontrado em ${BASE_URL}`);
    console.error('   Inicie o servidor antes de rodar os testes:');
    console.error('   npx wrangler pages dev out\n');
    console.error('   Para usar outra porta:');
    console.error('   API_BASE_URL=http://localhost:8787 npm run test:integration\n');
    process.exit(1);
  }

  await testSlotsMonth();

  const agendarResult = await testAgendar();
  const token = agendarResult?.agendamentoId
    ? null // token_confirmacao não é retornado na resposta — buscamos por agendamentoId
    : null;

  // confirmar.js recebe o token_confirmacao, não o agendamentoId.
  // Em CI, não temos como recuperar o token sem consultar o Supabase diretamente.
  // Se quiser testar confirmar, passe o token via env: TOKEN_CONFIRMACAO=xxx npm run test:integration
  const tokenEnv = process.env.TOKEN_CONFIRMACAO || null;
  await testConfirmar(tokenEnv);

  // Relatório final
  console.log('\n══════════════════════════════════════════════');
  console.log('  Relatório Final');
  console.log('══════════════════════════════════════════════');
  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  const warn = results.filter(r => r.status === 'WARN').length;
  console.log(`  PASS: ${pass} | FAIL: ${fail} | WARN: ${warn}`);
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️ ';
    console.log(`  ${icon}  ${r.step}${r.detail ? ': ' + r.detail : ''}`);
  }
  console.log('══════════════════════════════════════════════\n');

  if (fail > 0) process.exit(1);
}

main();
