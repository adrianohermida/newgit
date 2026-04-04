// Universal LLM Assistant Local Extension (Node.js)
// Permite busca local, acesso à internet e controle do navegador via API local

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const open = require('open');

const app = express();
app.use(cors());
app.use(express.json());

// Busca arquivos em pasta/unidade
app.post('/search-files', (req, res) => {
  const { basePath, pattern } = req.body;
  if (!basePath || !pattern) return res.status(400).json({ error: 'basePath e pattern obrigatórios' });
  try {
    const results = [];
    function walk(dir) {
      fs.readdirSync(dir).forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) walk(fullPath);
        else if (file.match(pattern)) results.push(fullPath);
      });
    }
    walk(basePath);
    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Busca na internet
app.post('/web-search', (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'query obrigatória' });
  // Abre navegador local com busca
  open(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
  res.json({ status: 'ok', message: 'Busca aberta no navegador local.' });
});

// Abrir URL no navegador
app.post('/open-url', (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url obrigatória' });
  open(url);
  res.json({ status: 'ok', message: 'URL aberta no navegador local.' });
});

const PORT = 32123;
app.listen(PORT, () => {
  console.log(`Universal LLM Assistant Extension rodando em http://localhost:${PORT}`);
});
