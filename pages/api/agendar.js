import { google } from 'googleapis';
import nodemailer from 'nodemailer';

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

  // Montar evento
  const event = {
    summary: `Consulta Jurídica - ${area}`,
    description: `Cliente: ${nome} (${email})\nTelefone: ${telefone}\nObservações: ${observacoes}`,
    start: { dateTime: `${data}T${hora}:00-03:00` },
    end: { dateTime: `${data}T${String(Number(hora.split(':')[0]) + 1).padStart(2, '0')}:${hora.split(':')[1]}:00-03:00` },
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
        host: process.env.YANDEX_SMTP_HOST || 'smtp.yandex.com',
        port: process.env.YANDEX_SMTP_PORT ? parseInt(process.env.YANDEX_SMTP_PORT) : 465,
        secure: true,
        auth: {
          user: process.env.YANDEX_SMTP_USER,
          pass: process.env.YANDEX_SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: `Agendamento Jurídico <${process.env.YANDEX_SMTP_USER}>`,
        to: email,
        subject: 'Confirmação de Agendamento',
        text: `Olá, ${nome}!\n\nSua consulta jurídica foi agendada com sucesso para o dia ${data} às ${hora}.\n\nÁrea: ${area}\nTelefone: ${telefone}\nObservações: ${observacoes || 'Nenhuma'}\n\nSe precisar reagendar, entre em contato conosco.\n\nAtenciosamente,\nEquipe Jurídica`,
      });
    } catch (mailError) {
      // Não interrompe o fluxo principal, mas pode logar o erro
      console.error('Erro ao enviar e-mail de confirmação:', mailError);
    }

    return res.status(200).json({ ok: true, eventId: response.data.id });
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
