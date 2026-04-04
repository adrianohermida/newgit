# Testes automatizados de integração (E2E) - Dotobot Copilot & AI Task

Este arquivo serve como roteiro para implementação de testes automatizados E2E usando Playwright, Cypress ou Jest+Supertest.

## Exemplos de cenários críticos:

- [ ] Usuário inicia conversa no chat Dotobot Copilot e recebe resposta do backend
- [ ] Usuário executa tarefa AI Task pela interface e resultado aparece no painel
- [ ] Falha de backend retorna mensagem de erro amigável no chat
- [ ] Logs de tarefas e eventos são persistidos corretamente no Supabase

## Sugestão de estrutura (Playwright):

```js
import { test, expect } from '@playwright/test';

test('Chat Dotobot responde corretamente', async ({ page }) => {
  await page.goto('https://SEU_DOMINIO/portal');
  await page.fill('#chat-input', 'Olá, Dotobot!');
  await page.click('#chat-send');
  await expect(page.locator('.chat-message.bot')).toContainText('Olá');
});

test('Execução de tarefa AI Task', async ({ page }) => {
  await page.goto('https://SEU_DOMINIO/portal/tasks');
  await page.click('button[data-task="exemplo"]');
  await expect(page.locator('.task-status')).toContainText('Concluída');
});
```

Adapte os seletores e URLs conforme seu frontend.

---

- Execute estes testes em PRs e deploys para garantir regressão zero.
- Use variáveis de ambiente de staging para não afetar produção.
