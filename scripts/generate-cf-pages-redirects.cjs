/**
 * generate-cf-pages-redirects.cjs
 *
 * Gera os arquivos _redirects e _routes.json corretos para o Cloudflare Pages
 * com base nas páginas Next.js exportadas em out/.
 *
 * Problema resolvido:
 *   O Cloudflare Pages com output:'export' gera arquivos .html mas não cria
 *   automaticamente rewrite rules para /portal/login → /portal/login.html.
 *   Sem essas regras, o Pages retorna 404 para qualquer rota sem extensão.
 *
 * Solução:
 *   1. Escaneia out/ em busca de todos os arquivos .html
 *   2. Gera rewrite rules no _redirects: /rota → /rota.html  200
 *   3. Atualiza _routes.json para incluir as Functions de API (/api/*)
 *      e excluir os assets estáticos (_next/static/*)
 *
 * Executado automaticamente pelo build:pages após o export do Next.js.
 */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "out");

// Rotas que não devem gerar rewrite (servidas diretamente ou tratadas de outra forma)
const SKIP_ROUTES = new Set([
  "/",
  "/404",
  "/_not-found",
]);

// Rotas de API que devem ser tratadas pelas Pages Functions (não por assets estáticos)
const API_FUNCTION_PATTERNS = ["/api/*"];

// Assets estáticos que nunca devem passar pelas Functions
// NOTA: Não incluir /*.json aqui pois bloqueia respostas JSON das APIs
const STATIC_EXCLUDES = [
  "/_next/static/*",
  "/_next/data/*",
  "/icons/*",
  "/images/*",
  "/*.ico",
  "/*.png",
  "/*.jpg",
  "/*.webp",
  "/*.svg",
  "/*.woff",
  "/*.woff2",
  "/*.css",
  "/*.txt",
  "/*.xml",
  "/*.webmanifest",
];

function walkHtmlFiles(dir, base = dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Pular _next e outros diretórios de assets
      if (["_next", "functions"].includes(entry.name)) continue;
      walkHtmlFiles(full, base, results);
    } else if (entry.name.endsWith(".html")) {
      const rel = path.relative(base, full).replace(/\\/g, "/");
      results.push(rel);
    }
  }
  return results;
}

function htmlFileToRoute(htmlFile) {
  // "portal/login.html" → "/portal/login"
  // "index.html" → "/"
  // "_not-found.html" → null (skip)
  let route = "/" + htmlFile.replace(/\.html$/, "");
  if (route === "/index") route = "/";
  return route;
}

function generateRedirects(htmlFiles) {
  const lines = [];

  // Comentário de cabeçalho
  lines.push("# Gerado automaticamente por scripts/generate-cf-pages-redirects.cjs");
  lines.push("# NÃO edite manualmente — será sobrescrito no próximo build:pages");
  lines.push("");

  // Rewrites para API (passthrough para Pages Functions)
  lines.push("# API routes → Pages Functions");
  lines.push("/api/*   /api/:splat   200");
  lines.push("");

  // Rewrites para páginas estáticas (sem extensão → .html)
  lines.push("# Rewrites de páginas estáticas (sem extensão → .html)");

  const pageRoutes = [];
  for (const htmlFile of htmlFiles) {
    const route = htmlFileToRoute(htmlFile);
    if (!route || SKIP_ROUTES.has(route)) continue;
    // Pular arquivos especiais do Cloudflare Pages
    if (route.startsWith("/_")) continue;
    pageRoutes.push({ route, htmlFile });
  }

  // Ordenar: rotas mais específicas primeiro
  pageRoutes.sort((a, b) => {
    // Rotas mais longas primeiro (mais específicas)
    const depthA = a.route.split("/").length;
    const depthB = b.route.split("/").length;
    if (depthA !== depthB) return depthB - depthA;
    return a.route.localeCompare(b.route);
  });

  for (const { route, htmlFile } of pageRoutes) {
    lines.push(`${route}   /${htmlFile}   200`);
  }

  lines.push("");
  lines.push("# SPA fallback: rotas não mapeadas → 404");
  lines.push("/*   /404.html   404");
  lines.push("");

  return lines.join("\n");
}

function generateRoutesJson() {
  // _routes.json controla quais requisições passam pelas Pages Functions
  // include: rotas que DEVEM passar pelas Functions (APIs)
  // exclude: rotas que NÃO devem passar pelas Functions (assets estáticos)
  const routesJson = {
    version: 1,
    include: API_FUNCTION_PATTERNS,
    exclude: STATIC_EXCLUDES,
  };
  return JSON.stringify(routesJson, null, 2);
}

function main() {
  if (!fs.existsSync(OUT_DIR)) {
    console.error(
      "generate-cf-pages-redirects: out/ não encontrado. Execute npm run build:pages primeiro."
    );
    process.exit(1);
  }

  const htmlFiles = walkHtmlFiles(OUT_DIR).sort();
  console.log(
    `generate-cf-pages-redirects: encontrados ${htmlFiles.length} arquivo(s) .html em out/`
  );

  // Gerar _redirects
  const redirectsContent = generateRedirects(htmlFiles);
  const redirectsPath = path.join(OUT_DIR, "_redirects");
  fs.writeFileSync(redirectsPath, redirectsContent, "utf8");
  console.log(`generate-cf-pages-redirects: _redirects gerado (${redirectsPath})`);

  // Gerar _routes.json
  const routesJsonContent = generateRoutesJson();
  const routesJsonPath = path.join(OUT_DIR, "_routes.json");
  fs.writeFileSync(routesJsonPath, routesJsonContent, "utf8");
  console.log(`generate-cf-pages-redirects: _routes.json gerado (${routesJsonPath})`);

  // Também atualizar os arquivos raiz (para referência e próximo build)
  const rootRedirectsPath = path.join(ROOT, "_redirects");
  fs.writeFileSync(rootRedirectsPath, redirectsContent, "utf8");

  const rootRoutesJsonPath = path.join(ROOT, "_routes.json");
  fs.writeFileSync(rootRoutesJsonPath, routesJsonContent, "utf8");
  console.log("generate-cf-pages-redirects: arquivos raiz atualizados.");

  // Resumo das rotas geradas
  const pageCount = htmlFiles.filter((f) => {
    const r = htmlFileToRoute(f);
    return r && !SKIP_ROUTES.has(r) && !r.startsWith("/_");
  }).length;
  console.log(
    `generate-cf-pages-redirects: ${pageCount} rewrite(s) de página gerado(s).`
  );
}

main();
