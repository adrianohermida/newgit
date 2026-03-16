// Cloudflare Pages Functions index file
// Reexporta todas as rotas de /api para compatibilidade com main = "functions/index.js"
export { onRequestPost as onRequestPostAgendar } from './api/agendar.js';
export { onRequestGet as onRequestGetConfirmar } from './api/confirmar.js';
export { onRequestGet as onRequestGetSlots } from './api/slots.js';
