# Universal LLM Assistant Extension

Permite ao Dotobot (ou outro LLM) acessar recursos do seu computador local com consentimento:

- Buscar arquivos em pastas/unidades selecionadas
- Realizar buscas na internet via navegador local
- Abrir URLs no navegador local

## Como usar

1. Instale as dependências:
   ```bash
   npm install express cors open
   ```
2. Execute o servidor local:
   ```bash
   node server.js
   ```
3. O Dotobot pode fazer requisições HTTP para:
   - `POST /search-files` `{ basePath, pattern }`
   - `POST /web-search` `{ query }`
   - `POST /open-url` `{ url }`

## Segurança
- O usuário deve aprovar explicitamente o diretório/unidade a ser buscada.
- O navegador só é aberto localmente, nunca remotamente.
- O Dotobot só acessa o que for permitido via API local.

## Integração
- O Dotobot detecta a extensão rodando em `http://localhost:32123`.
- Ao receber comandos como "buscar arquivo" ou "pesquisar na web", faz requisições para a API local.

---

**Exemplo de chamada via fetch:**
```js
fetch('http://localhost:32123/search-files', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ basePath: 'C:/Users/SeuUsuario/Documents', pattern: '.*\\.pdf$' })
})
.then(res => res.json())
.then(console.log);
```
