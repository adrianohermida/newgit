import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

serve(async (req) => {
  try {
    const body = await req.json().catch(() => null);

    if (!body || !body.cf_contact_id || !body.email) {
      return json({ error: "cf_contact_id e email são obrigatórios" }, 400);
    }

    const contactId = body.cf_contact_id;
    const email = body.email;

    const FRESHSALES_DOMAIN = Deno.env.get("FRESHSALES_DOMAIN");
    const FRESHSALES_API_KEY = Deno.env.get("FRESHSALES_API_KEY");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    // 🔢 Gerar PIN (6 dígitos)
    const pin = Math.floor(100000 + Math.random() * 900000)
      .toString()
      .padStart(6, "0");

    // 📡 Atualizar direto no Freshsales
    const updateResponse = await fetch(
      `https://${FRESHSALES_DOMAIN}/api/contacts/${contactId}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Token token=${FRESHSALES_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contact: {
            custom_fields: {
              cf_pin: pin,
            },
          },
        }),
      }
    );

    const updateData = await safeJson(updateResponse);

    if (!updateResponse.ok) {
      return json({
        error: "Erro ao atualizar PIN",
        details: updateData,
      }, 500);
    }

    // ✉️ Enviar email com o PIN
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Hermida Maia <noreply@hermidamaia.com>",
        to: [email],
        subject: "Seu código de acesso",
        html: `
          <div style="font-family: Arial, sans-serif;">
            <h2>Seu código de acesso</h2>
            <p>Utilize o código abaixo para confirmar sua identificação:</p>
            <h1 style="letter-spacing: 4px;">${pin}</h1>
            <p>Este código expira em poucos minutos.</p>
          </div>
        `,
      }),
    });

    return json({
      success: true,
      contact_id: contactId,
      pin,
    });

  } catch (err) {
    return json({
      error: "Erro interno",
      details: err.message,
    }, 500);
  }
});

// helpers
function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return { raw: await res.text() };
  }
}