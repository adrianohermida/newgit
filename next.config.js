/** @type {import('next').NextConfig} */
const isGithubPages = process.env.GITHUB_PAGES === 'true';
const repo = 'newgit'; // Altere para o nome do seu repositório

module.exports = {
  output: 'export',
  // Para GitHub Pages, defina o basePath e assetPrefix
  basePath: isGithubPages ? `/${repo}` : '',
  assetPrefix: isGithubPages ? `/${repo}/` : '',
  images: { unoptimized: true },
};
