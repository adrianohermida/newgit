#!/usr/bin/env node
// scripts/test-integration.js
// Testa o fluxo completo da API de agendamento contra o servidor local (wrangler pages dev)
// Uso: npm run test:integration

const fs = require('fs');
const path = require('path');

loadLocalEnv();

// wrangler pages dev usa 8788 por padrão; wrangler dev usa 8787
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:8788';

const results = [];

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), '.dev.vars');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1);
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

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
  if (body.minimumLeadHours) extras.push(`minimumLeadHours=${body.minimumLeadHours}`);
  return extras.length > 0 ? ` (${extras.join(' | ')})` : '';
}

async function testSlotsMonth() {
  const step = 'GET /api/slots-month?mes=...';
  const targetMonth = process.env.TEST_MONTH || getSuggestedMonth();
  try {
    const res = await fetch(`${BASE_URL}/api/slots-month?mes=${targetMonth}`);
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
    const selected = pickFirstAvailableSlot(body.slots);
    if (!selected) {
      log(step, 'FAIL', `Nenhum slot disponível encontrado em ${targetMonth}`);
      return null;
    }
    log(step, 'PASS', `${totalDias} dias com slots, ${totalSlots} slots disponíveis no total | escolhido ${selected.data} ${selected.hora}`);
    return selected;
  } catch (err) {
    log(step, 'FAIL', err.message);
    return null;
  }
}

async function verifySupabaseCredentials() {
  const step = 'Preflight Supabase';
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    log(step, 'FAIL', 'NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente');
    return false;
  }

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/agendamentos?select=id&limit=1`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = body && typeof body === 'object'
        ? `${body.message || 'erro'}${body.hint ? ` | ${body.hint}` : ''}`
        : `HTTP ${res.status}`;
      log(step, 'FAIL', detail);
      return false;
    }
    log(step, 'PASS', 'credenciais do Supabase aceitas');
    return true;
  } catch (err) {
    log(step, 'FAIL', err.message);
    return false;
  }
}

async function testAgendar(slot) {
  const step = 'POST /api/agendar';
  if (!slot) {
    log(step, 'WARN', 'Pulado — nenhum slot válido disponível');
    return null;
  }

  const payload = {
    nome: 'Teste CI',
    email: process.env.TEST_EMAIL || 'dev@hermidamaia.com.br',
    telefone: '11999999999',
    area: 'Superendividamento',
    data: slot.data,
    hora: slot.hora,
    observacoes: 'Teste automatizado de integração',
  };

  try {
    const res = await fetch(`${BASE_URL}/api/agendar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json();

    // 409 = horário ocupado (slot real do Google Calendar) — aceitável em CI
    if (res.status === 409) {
      log(step, 'WARN', `Horário ${payload.hora} em ${payload.data} já ocupado no Google Calendar`);
      return null;
    }
    if (!res.ok || !body.ok) {
      log(step, 'FAIL', `HTTP ${res.status}: ${body.error || JSON.stringify(body)}${formatErrorBody(body)}`);
      return null;
    }
    log(step, 'PASS', `agendamentoId=${body.agendamentoId} | eventId=${body.eventId}`);
    return { ...body, payload };
  } catch (err) {
    log(step, 'FAIL', err.message);
    return null;
  }
}

async function fetchTokenByAgendamentoId(agendamentoId) {
  const step = 'Lookup token no Supabase';
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey || !agendamentoId) {
    log(step, 'WARN', 'Pulado — credenciais do Supabase ou agendamentoId indisponíveis');
    return null;
  }

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/agendamentos?id=eq.${agendamentoId}&select=id,token_confirmacao,status,confirmed_at`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
    });
    const body = await res.json().catch(() => []);
    if (!res.ok || !Array.isArray(body) || body.length === 0) {
      log(step, 'FAIL', `HTTP ${res.status}: não foi possível localizar token para ${agendamentoId}`);
      return null;
    }
    log(step, 'PASS', `token encontrado para ${agendamentoId}`);
    return body[0].token_confirmacao;
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

async function verifyConfirmedState(agendamentoId) {
  const step = 'Verificar status confirmado no Supabase';
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey || !agendamentoId) {
    log(step, 'WARN', 'Pulado — credenciais do Supabase ou agendamentoId indisponíveis');
    return;
  }

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/agendamentos?id=eq.${agendamentoId}&select=id,status,confirmed_at`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
    });
    const body = await res.json().catch(() => []);
    if (!res.ok || !Array.isArray(body) || body.length === 0) {
      log(step, 'FAIL', `HTTP ${res.status}: registro não encontrado`);
      return;
    }
    const row = body[0];
    if (row.status === 'confirmado' && row.confirmed_at) {
      log(step, 'PASS', `status=${row.status} | confirmed_at=${row.confirmed_at}`);
      return;
    }
    log(step, 'FAIL', `status=${row.status || 'desconhecido'} | confirmed_at=${row.confirmed_at || 'null'}`);
  } catch (err) {
    log(step, 'FAIL', err.message);
  }
}

function getSuggestedMonth() {
  const now = new Date();
  now.setUTCDate(1);
  now.setUTCMonth(now.getUTCMonth() + 1);
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function pickFirstAvailableSlot(slotsByDay) {
  const days = Object.keys(slotsByDay).sort();
  for (const day of days) {
    const horarios = Array.isArray(slotsByDay[day]) ? slotsByDay[day] : [];
    if (horarios.length > 0) {
      return { data: day, hora: horarios[0] };
    }
  }
  return null;
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

  const slot = await testSlotsMonth();
  const supabaseReady = await verifySupabaseCredentials();

  const agendarResult = supabaseReady ? await testAgendar(slot) : null;
  const lookedUpToken = agendarResult?.agendamentoId
    ? await fetchTokenByAgendamentoId(agendarResult.agendamentoId)
    : null;

  const tokenEnv = process.env.TOKEN_CONFIRMACAO || null;
  await testConfirmar(lookedUpToken || tokenEnv);
  if (agendarResult?.agendamentoId) {
    await verifyConfirmedState(agendarResult.agendamentoId);
  }

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
