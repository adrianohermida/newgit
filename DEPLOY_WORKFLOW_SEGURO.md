# Cloudflare Pages: Workflow de Deploy Seguro

## 1. Fluxo recomendado (CI/CD via GitHub)

- **Nunca use `wrangler pages deploy out` para produção!**
- O deploy seguro é feito pelo Cloudflare Pages conectado ao repositório GitHub.
- O build e deploy são disparados automaticamente a cada push no branch principal (ex: `main`).

### Passos para garantir deploy seguro:

1. **Confirme as configurações no Cloudflare Pages:**
   - Build command: `npm run build:pages`
   - Output directory: `out`
   - Deploy command: (deixe vazio)
   - Variáveis de ambiente: configure todas necessárias (Google, Supabase, Freshchat, etc).

2. **Faça commit e push normalmente:**
   ```sh
   git add .
   git commit -m "Sua mensagem de commit"
   git push
   ```
   O deploy será disparado automaticamente pelo Pages.

3. **Verifique o status do deploy no painel do Cloudflare Pages.**
   - Acesse a aba "Deployments" do projeto.
   - Veja logs e erros, se houver.

4. **Teste as rotas de API e páginas após o deploy:**
   - Exemplo: `https://<seu-projeto>.pages.dev/api/public-chat-config`
   - Exemplo: `https://<seu-projeto>.pages.dev/api/slots-month?mes=2026-04`

---

## 2. Deploy local para testes

- Use `npm run dev:pages` para simular o ambiente Pages localmente.
- Teste as rotas de API e páginas em `http://localhost:8788`.

---

## 3. Submódulos (ex: hmadv-process-ai)

- Para garantir sincronização automática ao clonar:
  ```sh
  git submodule add <URL_DO_REPO_HMADV_PROCESS_AI> workers/hmadv-process-ai
  git submodule update --init --recursive
  ```
- Ao clonar o repositório principal:
  ```sh
  git clone --recurse-submodules <URL_DO_REPO_PRINCIPAL>
  ```

---

## 4. Nunca faça:
- Deploy manual com `wrangler pages deploy out` (isso ignora funções e rotas de API).
- Alterar o output do build para fora da pasta `out/`.

---

## 5. Dicas finais
- Sempre valide as rotas de API após deploy.
- Mantenha as variáveis de ambiente atualizadas no painel do Pages.
- Se precisar de rollback, use o painel do Cloudflare Pages para restaurar um deploy anterior.
