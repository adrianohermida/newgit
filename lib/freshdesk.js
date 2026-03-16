// Utilitário para criar tickets no Freshdesk
import fetch from 'node-fetch';

export async function createFreshdeskTicket({ name, email, subject, description, priority = 1, status = 2, custom_fields = {} }) {
  const FRESHDESK_DOMAIN = process.env.FRESHDESK_DOMAIN;
  const FRESHDESK_BASIC_TOKEN = process.env.FRESHDESK_BASIC_TOKEN;

  const url = `${FRESHDESK_DOMAIN}/api/v2/tickets`;
  const body = {
    name,
    email,
    subject,
    description,
    priority,
    status,
    custom_fields
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': FRESHDESK_BASIC_TOKEN,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Erro ao criar ticket: ${error}`);
  }

  return await res.json();
}
