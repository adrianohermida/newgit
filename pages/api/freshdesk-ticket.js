// Endpoint para receber dados do formulário e criar ticket no Freshdesk
import { createFreshdeskTicket } from '../../lib/freshdesk';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { name, email, subject, description, priority, status, custom_fields } = req.body;
    if (!name || !email || !subject || !description) {
      return res.status(400).json({ ok: false, error: 'Campos obrigatórios ausentes.' });
    }
    const ticket = await createFreshdeskTicket({ name, email, subject, description, priority, status, custom_fields });
    return res.status(200).json({ ok: true, ticket });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
