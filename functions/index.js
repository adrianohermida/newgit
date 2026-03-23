// Cloudflare Pages Functions index file
// Exporta um Worker padrão para roteamento
import { onRequestPost as onRequestPostAgendar } from './api/agendar.js';
import { onRequestGet as onRequestGetConfirmar } from './api/confirmar.js';
import { onRequestGet as onRequestGetSlots } from './api/slots.js';
import { onRequestGet as onRequestGetSlotsMonth } from './api/slots-month.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);

		// Responder preflight CORS
		if (request.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers: CORS_HEADERS });
		}

		// Roteamento manual para funções
		if (url.pathname.startsWith('/api/agendar') && request.method === 'POST') {
			const resp = await onRequestPostAgendar({ request, env, ctx });
			const newResp = new Response(resp.body, resp);
			Object.entries(CORS_HEADERS).forEach(([k, v]) => newResp.headers.set(k, v));
			return newResp;
		}
		if (url.pathname.startsWith('/api/confirmar') && request.method === 'GET') {
			const resp = await onRequestGetConfirmar({ request, env, ctx });
			const newResp = new Response(resp.body, resp);
			Object.entries(CORS_HEADERS).forEach(([k, v]) => newResp.headers.set(k, v));
			return newResp;
		}
		if (url.pathname === '/api/slots-month' && request.method === 'GET') {
			const resp = await onRequestGetSlotsMonth({ request, env, ctx });
			const newResp = new Response(resp.body, resp);
			Object.entries(CORS_HEADERS).forEach(([k, v]) => newResp.headers.set(k, v));
			return newResp;
		}
		if (url.pathname.startsWith('/api/slots') && request.method === 'GET') {
			const resp = await onRequestGetSlots({ request, env, ctx });
			const newResp = new Response(resp.body, resp);
			Object.entries(CORS_HEADERS).forEach(([k, v]) => newResp.headers.set(k, v));
			return newResp;
		}
		// Fallback para 404
		return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
	}
};
