const message = [
  "Deploy bloqueado: `wrangler pages deploy out` publica apenas os assets estaticos.",
  "Esse fluxo nao leva `functions/` nem `_routes.json`, e pode derrubar `/api/*` em producao.",
  "Use o build conectado do Cloudflare Pages a partir do repositorio ou habilite explicitamente `ALLOW_STATIC_ONLY_PAGES_DEPLOY=1` se estiver fazendo um deploy conscientemente estatico.",
].join("\n");

if (String(process.env.ALLOW_STATIC_ONLY_PAGES_DEPLOY || "").trim() === "1") {
  console.warn(message);
  console.warn("Continuando porque ALLOW_STATIC_ONLY_PAGES_DEPLOY=1 foi definido.");
  process.exit(0);
}

console.error(message);
process.exit(1);
