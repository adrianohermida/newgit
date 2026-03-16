// Cloudflare Pages Functions index file
// Exporta um Worker padrão para roteamento
import { onRequestPost as onRequestPostAgendar } from './api/agendar.js';
import { onRequestGet as onRequestGetConfirmar } from './api/confirmar.js';
import { onRequestGet as onRequestGetSlots } from './api/slots.js';

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		// Roteamento manual para funções
		if (url.pathname.startsWith('/api/agendar') && request.method === 'POST') {
			return await onRequestPostAgendar({ request, env, ctx });
		}
		if (url.pathname.startsWith('/api/confirmar') && request.method === 'GET') {
			return await onRequestGetConfirmar({ request, env, ctx });
		}
		if (url.pathname.startsWith('/api/slots') && request.method === 'GET') {
			return await onRequestGetSlots({ request, env, ctx });
		}
		// Fallback para 404
		return new Response('Not Found', { status: 404 });
	}
};
