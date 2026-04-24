# 🧹 Auditoria de Edge Functions: Remoção Segura (Depreciação)
**Data:** 24/04/2026 | **Autor:** Manus AI

O plano gratuito do Supabase possui um limite estrito de 100 Edge Functions simultâneas. Para viabilizar o deploy de novas capacidades (como as Probes do Freshsales e fluxos de IA), realizamos uma auditoria forense no código-fonte e no banco de dados para identificar funções órfãs.

Esta análise cruzou 100 funções deployadas com as seguintes fontes de invocação:
- **Agentes de IA:** `dotobot-slack`, `dotobot-agent`, `freddy-gateway`, `dotobot-rag`
- **Automações Agendadas:** `pg_cron` (tabela `cron.job`)
- **Webhooks Externos:** Freshdesk, Zoom, DataJud, Freshchat
- **Dependências Internas:** Chamadas entre Edge Functions (`invokeFunction`, `fetch`)

O resultado identificou **40 funções seguras para remoção**, que não são acionadas por nenhum fluxo ativo no sistema.

---

## 🗑️ Funções Candidatas à Remoção Segura (Órfãs)

As funções abaixo estão deployadas, consumindo vagas no Supabase, mas não são chamadas por nenhum componente do sistema atual. Todo o código fonte delas já foi baixado e versionado no repositório GitHub (`adrianohermida/newgit`), o que significa que podem ser removidas do Supabase sem risco de perda de código.

### 1. Funções de Teste, Debug e Diagnóstico (10)
Scripts isolados criados para testar conexões, que não fazem parte do pipeline de produção:
- `advise-diag`
- `advise-token-check`
- `fs-diag`
- `fs-diagnose`
- `fs-exec`
- `fs-inspect-account`
- `get-fs-key`
- `slack-diag`
- `slack-notify`
- `supabase-data-acess`

### 2. Funções Deprecadas de Integração e Sincronização (14)
Scripts antigos substituídos por versões mais novas (ex: `advise-sync`, `processo-sync`, `fs-contacts-sync`):
- `agendamentos-sync`
- `fs-account-enricher`
- `fs-activity-consolidate`
- `fs-fix-activities`
- `fs-freshdesk-sync`
- `fs-runner`
- `sync-advise-backfill`
- `sync-advise-publicacoes`
- `sync-advise-realtime`
- `process-datajud-queue`
- `datajud-sync-processo`
- `publicacao-vinculacao-v2`
- `criar-prazo-confirmado-v1`
- `fetch-emails-imap`

### 3. Trabalhadores Isolados de Tribunais (6)
Aparentemente substituídos pelo `datajud-worker` e `datajud-search`:
- `datajud_tjam`
- `datajud_tjsp`
- `datajud_trf1`
- `datajud_trf2`
- `datajud_trf3`
- `datajud_trf4`
- `datajud_trf5`
- `datajud_trf6` *(Atenção: TRF1 a TRF6 totalizam 6 funções, mas apenas as listadas estão deployadas)*

### 4. Experimentos DevStudio e IA Isolados (10)
Funções experimentais ou de módulos antigos não conectados aos fluxos atuais do Dotobot/Cida:
- `devstudio-create-module`
- `devstudio-generate-sprint-board`
- `devstudio-generate-sprint-cards-advanced`
- `dotobot-embed`
- `invokeLLM`
- `logLGPDTratamentoMovimento`
- `swift-action`
- `fix-workflow`

---

## 🛡️ Como Remover de Forma Segura

Como o código já está versionado, a remoção no Supabase é puramente operacional.

Para liberar as 40 vagas de uma vez, execute o seguinte comando no terminal do seu computador (estando na pasta do repositório `newgit` e autenticado no Supabase CLI):

```bash
# Executar no terminal local
for fn in advise-diag advise-token-check agendamentos-sync criar-prazo-confirmado-v1 datajud-sync-processo datajud_tjam datajud_tjsp datajud_trf1 datajud_trf2 datajud_trf3 datajud_trf4 datajud_trf5 datajud_trf6 devstudio-create-module devstudio-generate-sprint-board devstudio-generate-sprint-cards-advanced dotobot-embed fetch-emails-imap fix-workflow fs-account-enricher fs-activity-consolidate fs-diag fs-diagnose fs-exec fs-fix-activities fs-freshdesk-sync fs-inspect-account fs-runner get-fs-key invokeLLM logLGPDTratamentoMovimento process-datajud-queue publicacao-vinculacao-v2 slack-diag slack-notify supabase-data-acess swift-action sync-advise-backfill sync-advise-publicacoes sync-advise-realtime; do
  supabase functions delete $fn --project-ref sspvizogbcyigquqycsz
done
```

### Opcional: Arquivamento Local
Se desejar limpar também a visualização local (para que elas não apareçam no seu editor de código), você pode movê-las para a pasta `_archived`:

```bash
mkdir -p supabase/functions/_archived
for fn in advise-diag advise-token-check agendamentos-sync criar-prazo-confirmado-v1 datajud-sync-processo datajud_tjam datajud_tjsp datajud_trf1 datajud_trf2 datajud_trf3 datajud_trf4 datajud_trf5 datajud_trf6 devstudio-create-module devstudio-generate-sprint-board devstudio-generate-sprint-cards-advanced dotobot-embed fetch-emails-imap fix-workflow fs-account-enricher fs-activity-consolidate fs-diag fs-diagnose fs-exec fs-fix-activities fs-freshdesk-sync fs-inspect-account fs-runner get-fs-key invokeLLM logLGPDTratamentoMovimento process-datajud-queue publicacao-vinculacao-v2 slack-diag slack-notify supabase-data-acess swift-action sync-advise-backfill sync-advise-publicacoes sync-advise-realtime; do
  mv supabase/functions/$fn supabase/functions/_archived/ 2>/dev/null
done
```

---

## 🔒 Funções Ativas (NÃO REMOVER)

As 60 funções restantes foram confirmadas como **ATIVAS** e não devem ser removidas. Elas se dividem nas seguintes categorias:

1. **Pipeline Core:** `advise-sync`, `advise-drain-by-date`, `advise-backfill-runner`, `advise-backfill-lido`, `advise-drain-contratos`, `advise-drain-reverse`, `advise-import-planilha`
2. **DataJud:** `datajud-worker`, `datajud-search`, `datajud-andamentos-sync`, `datajud-webhook`, `datajud-import-processo`
3. **Freshsales (CRM):** `processo-sync`, `publicacoes-freshsales`, `publicacoes-partes`, `fs-contacts-sync`, `fs-repair-orphans`, `fs-account-repair`, `fs-tag-leilao`, `fs-webhook`
4. **Financeiro:** `deals-sync`, `billing-import`, `billing-deals-sync`
5. **Inteligência Artificial:** `dotobot-slack`, `dotobot-agent`, `dotobot-rag`, `freddy-gateway`, `agentlab-runner`, `advise-ai-enricher`, `ia-audit`, `publicacoes-audiencias`
6. **Webhooks & Integrações:** `zoom-webhook`, `zoom-recording-processor`, `freshdesk-cnj-webhook`, `freshdesk-ticket-process`, `fc-ingest-conversations`, `fc-last-conversation`, `fc-update-conversation`, `oauth`
7. **Utilitários e Governança:** `publicacoes-prazos`, `contact-hygiene-job`, `sync-worker`, `tpu-enricher`, `tpu-sync`, `governanca-homologacao-run`, `governanca-regressao-run`, `governanca-snapshot-v1`, `blog`, `blog-categories`, `send-email`, `send-email-smtp`, `users-me`, `generate-pin`, `workspace-ops`
8. **Probes (Diagnóstico Ativo):** `agentLabDashboardProbe`, `freshsalesProductsProbe`, `freshchatAgentProbe`, `fs-products-probe`
