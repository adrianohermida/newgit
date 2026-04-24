/**
 * Edge Function: send-email-smtp
 * Envio via SMTP Standard (TLS/SSL) - Yandex, Gmail, Outlook
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts"

serve(async (req) => {
  try {
    const { to, subject, body } = await req.json()
    
    const client = new SmtpClient()
    await client.connectTLS({
      hostname: Deno.env.get("SMTP_HOST"),
      port: Number(Deno.env.get("SMTP_PORT") || 465),
      username: Deno.env.get("SMTP_USER"),
      password: Deno.env.get("SMTP_PASS"),
    })

    await client.send({
      from: Deno.env.get("SMTP_USER"), // Remetente deve ser o mesmo do auth
      to: typeof to === 'string' ? to : to[0].email,
      subject: subject,
      content: body,
      html: body,
    })

    await client.close()
    return new Response(JSON.stringify({ success: true }), { status: 200 })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})