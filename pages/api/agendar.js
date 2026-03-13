import { google } from 'googleapis';
import nodemailer from 'nodemailer';
import { supabase } from '../../lib/supabase';
import { v4 as uuidv4 } from 'uuid';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { nome, email, telefone, observacoes, area, data, hora } = req.body;

  // Validação de campos obrigatórios
  const camposFaltando = [];
  if (!nome) camposFaltando.push('Nome');
  if (!email) camposFaltando.push('E-mail');
  if (!telefone) camposFaltando.push('Telefone');
  if (!area) camposFaltando.push('Área de interesse');
  if (!data) camposFaltando.push('Data');
  if (!hora) camposFaltando.push('Hora');
  if (camposFaltando.length > 0) {
    return res.status(400).json({
      ok: false,
      error: `Por favor, preencha os seguintes campos obrigatórios: ${camposFaltando.join(', ')}.`
    });
  }

  // Autenticação OAuth2 (use variáveis de ambiente para as credenciais)
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

  const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

  // Checar se o slot está realmente disponível no Google Calendar
  const slotStart = `${data}T${hora}:00-03:00`;
  const slotEndHour = String(Number(hora.split(':')[0]) + 1).padStart(2, '0');
  const slotEnd = `${data}T${slotEndHour}:${hora.split(':')[1]}:00-03:00`;
  const busy = await calendar.freebusy.query({
    requestBody: {
      timeMin: slotStart,
      timeMax: slotEnd,
      timeZone: 'America/Sao_Paulo',
      items: [{ id: 'primary' }],
    },
  });
  const isBusy = busy.data.calendars['primary'].busy.length > 0;
  if (isBusy) {
    return res.status(409).json({ ok: false, error: 'Horário já está ocupado. Escolha outro.' });
  }

  // Gerar ID único para o agendamento
  const agendamentoId = uuidv4();

  // Persistir no Supabase
  const { error: supabaseError } = await supabase.from('agendamentos').insert([
    {
      id: agendamentoId,
      nome,
      email,
      telefone,
      area,
      data,
      hora,
      status: 'pendente',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ]);
  if (supabaseError) {
    return res.status(500).json({ ok: false, error: 'Erro ao salvar agendamento.' });
  }

  // Montar evento
  const event = {
    summary: `Consulta Jurídica - ${area}`,
    description: `Cliente: ${nome} (${email})\nTelefone: ${telefone}\nObservações: ${observacoes}`,
    start: { dateTime: slotStart },
    end: { dateTime: slotEnd },
    attendees: [{ email }],
  };

  try {
    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      sendUpdates: 'all',
    });

    // Enviar e-mail de confirmação via SMTP Yandex
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.MAIL_HOST,
        port: process.env.MAIL_PORT ? parseInt(process.env.MAIL_PORT) : 465,
        secure: process.env.MAIL_SECURE === 'true' || process.env.MAIL_SECURE === true,
        auth: {
          user: process.env.MAIL_USER,
          pass: process.env.MAIL_PASS,
        },
      });

      await transporter.sendMail({
        from: process.env.MAIL_FROM || `Agendamento Jurídico <${process.env.MAIL_USER}>`,
        to: "suporte@hermidamaia.adv.br",
        subject: 'Confirmação de Agendamento',
        text: `Olá, ${nome}!\n\nSua consulta jurídica foi agendada com sucesso para o dia ${data} às ${hora}.\n\nÁrea: ${area}\nTelefone: ${telefone}\nObservações: ${observacoes || 'Nenhuma'}\n\nSe precisar reagendar, entre em contato conosco.\n\nAtenciosamente,\nEquipe Jurídica`,
      });
    } catch (mailError) {
      // Não interrompe o fluxo principal, mas pode logar o erro
      console.error('Erro ao enviar e-mail de confirmação:', mailError);
    }

    return res.status(200).json({ ok: true, eventId: response.data.id, agendamentoId });
  } catch (error) {
    let mensagemErro = 'Ocorreu um erro ao tentar agendar sua consulta. Por favor, tente novamente mais tarde.';
    // Mensagens mais amigáveis para erros comuns
    if (error.code === 401 || error.code === 403) {
      mensagemErro = 'Erro de autenticação com o Google Calendar. Entre em contato com o suporte.';
    } else if (error.code === 400) {
      mensagemErro = 'Dados inválidos enviados. Verifique as informações e tente novamente.';
    }
    return res.status(500).json({ ok: false, error: mensagemErro });
  }
}
