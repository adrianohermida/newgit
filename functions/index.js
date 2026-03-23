// Cloudflare Pages Function — rota raiz (/)
// As rotas /api/* são tratadas pelos arquivos em functions/api/
// Este arquivo existe apenas para garantir que a raiz seja servida pelo Pages

export async function onRequest(context) {
  // Deixa o Cloudflare Pages servir o index.html estático
  return context.next();
}
