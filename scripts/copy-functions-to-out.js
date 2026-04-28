// Script para copiar funções edge/API para a pasta correta do deploy Cloudflare Pages
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'functions');
const destDir = path.join(__dirname, '..', 'out', 'functions');

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyRecursive(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

copyRecursive(srcDir, destDir);
console.log('Funções copiadas para out/functions.');
