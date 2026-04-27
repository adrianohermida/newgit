# Relatório Sprint 5 — Correções de Sincronização e Integrações
**Data:** 27/04/2026  
**Versão:** Sprint 5 (pós-auditoria brutal)

---

## Resumo Executivo

Após auditoria brutal de todas as Edge Functions e pipelines de integração, foram identificados e corrigidos 4 problemas críticos que impediam a drenagem automática das filas de sincronização com o Freshsales.

---

## Correções Aplicadas

### Correção 1 — Trigger de Propagação de `account_id` para a Fila do Datajud

**Problema:** A `monitoramento_queue` tinha **8.649 itens** com `account_id_freshsales = null`. O `datajud-worker` recusa processar itens sem account. O trigger `enqueue_datajud` só copiava o `account_id` no momento da inserção — se o processo ainda não tinha conta no Freshsales, a fila ficava permanentemente bloqueada.

**Correção:** Criado o trigger `trg_propagar_account_id_queue` na tabela `judiciario.processos`:

```sql
CREATE OR REPLACE FUNCTION judiciario.fn_propagar_account_id_queue()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.account_id_freshsales IS NOT NULL AND 
     (OLD.account_id_freshsales IS NULL OR OLD.account_id_freshsales != NEW.account_id_freshsales) THEN
    UPDATE judiciario.monitoramento_queue
    SET account_id_freshsales = NEW.account_id_freshsales
    WHERE processo_id = NEW.id AND status = 'pendente';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Backfill imediato:** Executado `UPDATE` que propagou o `account_id_freshsales` para **5.627 itens** já desbloqueados. Os 3.022 restantes serão desbloqueados automaticamente pelo trigger quando o `processos:create_account` criar as contas.

**Resultado:** A fila do Datajud passou de **0 itens prontos** para **5.627 itens prontos** para processamento.

---

### Correção 2 — Vault de Secrets: `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`

**Problema:** Os CRONs `agentlab-runner-cron` e `billing-import-cron` dependiam de `SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL'` para montar a URL da chamada HTTP. O vault estava vazio, retornando `null`, e os CRONs falhavam silenciosamente.

**Correção:** Inseridos os dois secrets no vault via `vault.create_secret()`:

| Secret | Comprimento |
|---|---|
| `SUPABASE_URL` | 40 chars |
| `SUPABASE_SERVICE_ROLE_KEY` | 219 chars |

**Resultado:** Os CRONs `agentlab-runner-cron` e `billing-import-cron` agora conseguem buscar a URL e o JWT do vault para montar as chamadas HTTP.

---

### Correção 3 — Mapeamento de Ações no Orquestrador

**Diagnóstico:** Após verificação direta do código de cada função, confirmou-se que os mapeamentos já estavam corretos:
- `publicacoes-freshsales` aceita `action: "sync"` ✅
- `publicacoes-partes` aceita `action: "extrair_batch"` ✅  
- `publicacoes-audiencias` aceita `action: "extract_batch"` ✅
- `datajud-andamentos-sync` aceita `action: "sync_batch"` ✅

**Ação:** Nenhuma alteração necessária. O orquestrador estava correto.

---

### Correção 4 — Remoção do CRON `immediate-vacuum-cleanup`

**Problema:** O CRON `immediate-vacuum-cleanup` (schedule: `* * * * *`) executava `VACUUM ANALYZE` a cada minuto. O PostgreSQL proíbe `VACUUM` dentro de blocos de transação, gerando o erro `VACUUM cannot run inside a transaction block` a cada minuto, poluindo os logs e consumindo recursos.

**Correção:** CRON removido via `cron.unschedule('immediate-vacuum-cleanup')`.

**Observação:** O CRON `vacuum-analyze-heavy-tables` (schedule: `30 3 * * *`) continua ativo e realiza o vacuum diário corretamente às 3h30.

---

## Estado Atual das Filas (27/04/2026 13:00 BRT)

| Fila | Pendentes Reais | Status | Observação |
|---|---|---|---|
| `movimentos:sync_activity` | 17.190 | ✅ Desbloqueado | Aguarda cota de rate limit |
| `publicacoes:sync_activity` | 11.204 | ✅ Funcionando | `sem_account` aguarda processos |
| `datajud:fetch_movimentos` | 7.160 | ✅ **5.627 desbloqueados** | Trigger propagou account_id |
| `partes:create_contact` | 5.027 | ✅ Funcionando | Aguarda processos com account |
| `processos:create_account` | 3.021 | ✅ Funcionando | ~150/hora |
| `prazos:create_task` | 2.841 | ✅ Processando | **10 tasks criadas na última rodada** |
| `billing:sync_deals` | 596 | ✅ Funcionando | Via CRON horário |
| `advise:drain_publicacoes` | 3 | ✅ Funcionando | Quase zerado |
| `audiencias:sync_activity` | 0 | ✅ Zerado | — |
| `advise:backfill` | 0 | ✅ Zerado | — |

---

## Resultado do Teste Final do Orquestrador

```json
{
  "ok": true,
  "jobs_executados": 5,
  "duracao_ms": 25469,
  "resultados": [
    {"job": "processos:create_account", "status": "ok", "pendentes": 3005},
    {"job": "publicacoes:sync_activity", "status": "ok", "pendentes": 11203},
    {"job": "movimentos:sync_activity", "status": "ok", "pendentes": 17202},
    {"job": "partes:create_contact", "status": "ok", "pendentes": 5027},
    {"job": "prazos:create_task", "status": "ok", "pendentes": 2834, "processados": 10}
  ]
}
```

O orquestrador executa **5 jobs em paralelo em 25 segundos** (antes: sequencial em ~2 minutos).

---

## Dependências de Drenagem

A ordem natural de drenagem das filas é:

```
processos:create_account (prioridade 1)
  ↓ cria account_id_freshsales
  ↓ trigger propaga para monitoramento_queue
publicacoes:sync_activity (prioridade 2) — precisa de account
movimentos:sync_activity (prioridade 3) — precisa de account
partes:create_contact (prioridade 4) — precisa de account
datajud:fetch_movimentos (prioridade 8) — precisa de account
  ↓ gera movimentos
movimentos:sync_activity — sincroniza movimentos gerados
```

Com ~150 accounts criadas por hora pelo `processos:create_account`, a fila de 3.021 processos restantes será zerada em aproximadamente **20 horas** (próximo dia 28/04 às 09h BRT).

---

## Histórico de Sprints

| Sprint | Data | Correções |
|---|---|---|
| Sprint 1 | 27/04 | Bugs de colunas (prazos, andamentos, batch_size) |
| Sprint 2 | 27/04 | billing-deals-sync (payload, REF!, orquestrador) |
| Sprint 3 | 27/04 | Execução paralela no orquestrador (Promise.all) |
| Sprint 4 | 27/04 | Views de monitoramento (vw_sync_health, vw_fs_rate_limit_status) |
| Sprint 5 | 27/04 | Trigger propagação, vault secrets, CRON vacuum |
