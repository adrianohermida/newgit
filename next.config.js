/** @type {import('next').NextConfig} */
/** @type {import('next').NextConfig} */
const isGithubPages = process.env.GITHUB_PAGES === 'true';
const repo = 'newgit'; // Altere para o nome do seu repositório

const nextConfig = {
  output: 'export',
  // Para GitHub Pages, defina o basePath e assetPrefix
  basePath: isGithubPages ? `/${repo}` : '',
  assetPrefix: isGithubPages ? `/${repo}/` : '',
  images: { unoptimized: true },
  // experimental: {}, // Removido alias @ para compatibilidade com Turbopack/Next.js 16+
};

module.exports = nextConfig;
