# Integração Dotobot Copilot + AI Task + ai-core

## Visão Geral

Este projeto integra frontend (Next.js), backend (Cloudflare Pages Functions) e orquestração Python (ai-core) para prover chat inteligente e automação de tarefas.

---

## Configuração Centralizada
- Todas as variáveis de ambiente e endpoints críticos estão em `lib/config.js`.
- Segredos são gerenciados pelo Cloudflare Pages (ver `docs/cloudflare-pages-secrets-checklist.md`).

---

## Testes Automatizados
- Roteiro de testes E2E em `tests/e2e/README.md`.
- Execute testes após cada alteração crítica.

---

## Troubleshooting
- Verifique variáveis de ambiente no Cloudflare Pages em caso de erro 500/401.
- Consulte logs do Supabase para falhas de persistência.
- Use mensagens de fallback amigáveis para o usuário final.
- Para integração Python, garanta que endpoints HTTP estejam corretos e acessíveis.

---

## Fluxo de Integração
1. Usuário interage via chat (frontend Next.js)
2. Mensagem é processada por funções/API (Cloudflare Pages)
3. Orquestração/execução de tarefas ocorre via ai-core (Python) ou Supabase
4. Resultados/logs retornam para o frontend

---

## Manutenção
- Sempre atualizar `lib/config.js` ao adicionar/alterar variáveis de ambiente
- Atualize o checklist de segredos em `docs/cloudflare-pages-secrets-checklist.md` ao criar novos segredos
- Mantenha os testes E2E atualizados para cobrir novos fluxos
