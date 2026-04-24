import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createTransport } from 'npm:nodemailer';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: { to: string; subject: string; html: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { to, subject, html } = body;
  if (!to || !subject || !html) {
    return new Response(JSON.stringify({ ok: false, error: 'Campos obrigatórios: to, subject, html' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const transporter = createTransport({
    host: Deno.env.get('MAIL_HOST') ?? 'smtp.yandex.com',
    port: Number(Deno.env.get('MAIL_PORT') ?? '465'),
    secure: (Deno.env.get('MAIL_SECURE') ?? 'true') === 'true',
    auth: {
      user: Deno.env.get('MAIL_USER'),
      pass: Deno.env.get('MAIL_PASS'),
    },
  });

  try {
    await transporter.sendMail({
      from: `"Hermida Maia" <${Deno.env.get('MAIL_FROM') ?? Deno.env.get('MAIL_USER')}>`,
      to,
      subject,
      html,
    });
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('SMTP error:', err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
