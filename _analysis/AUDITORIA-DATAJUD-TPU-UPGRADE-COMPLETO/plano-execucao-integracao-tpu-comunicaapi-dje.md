# Plano de execução — integração TPU (Gateway PJe) + ComunicaAPI (DJE)

## Contexto
Você pediu para complementar com base nos swaggger:
- TPU Gateway: `.../tpu/swagger-ui.html#/Consulta/pesquisarAssuntosUsingGET`
- ComunicaAPI: `.../swagger/index.html#/default/post_api_v1_login`

### Observação de ambiente
No ambiente atual de execução, o acesso direto aos dois endpoints Swagger retornou **403 (CONNECT tunnel failed)**, então este plano foi montado com base:
1) na arquitetura já implementada no repositório; e
2) nos contratos de endpoint fornecidos por você.

---

## 1) Estado atual do projeto (o que já temos)

### TPU/SGT já iniciado
- Cliente CNJ/SGT implementado (`cnjSgtClient.ts`) com chamadas SOAP e helper para gateway TPU.  
- Function `sincronizarTpuViaSgt.ts` criada com upsert idempotente e log em `SyncLog`.  
- `TPUImporter.jsx` já possui ação admin para sincronização online.

### Processos/DataJud já integrado
- Fluxo de importação e sincronização de processos com enriquecimento TPU em `sincronizarProcessoCompleto`.

### Gap principal
- **DJE/ComunicaAPI ainda não está integrado ponta-a-ponta** com autenticação, ingestão e reconciliação de publicações no módulo Processos.

---

## 2) Arquitetura alvo (TPU + DJE + Processos)

## 2.1 Camadas
1. **Conector TPU** (Gateway + fallback SGT)
2. **Conector DJE** (ComunicaAPI com login/token)
3. **Normalização canônica** (DTO único de eventos)
4. **Persistência idempotente** (`TPU*`, `PublicacaoDJE`, `SyncLog`)
5. **Orquestração de sincronização por processo**
6. **Exposição no front** (timeline unificada DataJud + DJE)

## 2.2 Entidades recomendadas
- `TPUClasse`, `TPUAssunto`, `TPUMovimento` (já existentes)
- `PublicacaoDJE` (nova)
  - chaves: `processo_numero`, `tribunal`, `data_publicacao`, `id_origem`, `hash_conteudo`
- `SyncLog` (já existente, ampliar metadata por fonte)

---

## 3) Plano de implementação por fases

## Fase 0 — Segurança e configuração (P0)
- Definir env vars:
  - `TPU_GATEWAY_BASE_URL`
  - `TPU_GATEWAY_TOKEN` (se exigido)
  - `COMUNICA_API_BASE_URL`
  - `COMUNICA_API_USER`
  - `COMUNICA_API_PASSWORD`
- Centralizar client HTTP server-side (nunca no frontend).
- Definir rotação/refresh de token ComunicaAPI.

## Fase 1 — TPU Gateway first (P0)
- Criar function `sincronizarTpuViaGateway.ts`:
  - consumir endpoint de consulta de assuntos (`pesquisarAssuntosUsingGET`) e correlatos de classes/movimentos;
  - paginação e persistência incremental;
  - fallback para `sincronizarTpuViaSgt` se gateway falhar.
- Critério de aceite:
  - atualiza TPU local sem duplicar códigos;
  - registra SyncLog por fonte (`tpu_gateway` / `tpu_sgt`).

## Fase 2 — ComunicaAPI login + ingestão DJE (P0)
- Implementar `functions/utils/comunicaApiClient.ts`:
  - `login()` via `POST /api/v1/login`;
  - `getToken()` com cache curto em memória + refresh.
- Implementar `functions/sincronizarDjePorProcesso.ts`:
  - consulta publicações por número CNJ (endpoint específico do swagger);
  - normaliza resultado para `PublicacaoDJE`;
  - upsert idempotente por `id_origem`/`hash_conteudo`.
- Critério de aceite:
  - processa publicações sem duplicar;
  - registra logs e falhas autenticadas.

## Fase 3 — Orquestrador único Processos (P1)
- Criar `functions/sincronizarProcessoIntegrado.ts`:
  1) sincroniza DataJud (estado processual)
  2) sincroniza TPU (tabelas de referência)
  3) sincroniza DJE (publicações/intimações)
  4) reconcilia timeline
- Regras de reconciliação:
  - DataJud: eventos processuais estruturados
  - DJE: publicações/intimações
  - TPU: taxonomia e classificação

## Fase 4 — Frontend e operação (P1)
- Em `/ProcessoDetalhe`:
  - aba “Publicações DJE”
  - timeline unificada (DataJud + DJE)
  - status de sincronização por fonte
- Em `DatajudAdmin/TPUImporter`:
  - opção de sync por fonte (Gateway ou SGT)
  - status de última versão TPU

---

## 4) Contratos técnicos (sugestão)

## 4.1 Sync TPU
`POST /functions/sincronizarTpuViaGateway`
```json
{
  "tipo": "A|M|C|ALL",
  "pagina": 1,
  "limite": 500
}
```

Resposta:
```json
{
  "success": true,
  "fonte": "tpu_gateway",
  "totalCriados": 0,
  "totalAtualizados": 0,
  "totalErros": 0,
  "versaoRemota": "..."
}
```

## 4.2 Sync DJE por processo
`POST /functions/sincronizarDjePorProcesso`
```json
{
  "processoId": "...",
  "numeroProcesso": "...",
  "tribunal": "..."
}
```

Resposta:
```json
{
  "success": true,
  "fonte": "comunicaapi_dje",
  "publicacoesNovas": 0,
  "publicacoesAtualizadas": 0,
  "erros": 0
}
```

---

## 5) Idempotência, observabilidade e resiliência

## 5.1 Idempotência
- TPU: chave `codigo`.
- DJE: `id_origem` ou `hash_conteudo + data_publicacao + tribunal`.

## 5.2 Observabilidade
- `SyncLog.metadata` padronizado:
  - `source`, `endpoint`, `status_code`, `duration_ms`, `records_read`, `records_written`.

## 5.3 Resiliência
- Retry exponencial para 429/5xx.
- Circuit breaker por fonte externa.
- DLQ lógico (lista de processos com falha recorrente para retry posterior).

---

## 6) Backlog objetivo (P0/P1/P2)

### P0
- [ ] `comunicaApiClient.ts` com login e token refresh.
- [ ] `sincronizarTpuViaGateway.ts` (gateway + fallback SGT).
- [ ] `sincronizarDjePorProcesso.ts` com upsert idempotente.

### P1
- [ ] `sincronizarProcessoIntegrado.ts` (DataJud + TPU + DJE).
- [ ] UI de status por fonte em ProcessoDetalhe.
- [ ] Métricas operacionais em SyncLog.

### P2
- [ ] Jobs agendados por janela de atualização.
- [ ] Alertas proativos para falha de autenticação no ComunicaAPI.
- [ ] Painel de qualidade de dados (divergências DataJud vs DJE).

---

## 7) Riscos e mitigação
- **Risco:** endpoint ComunicaAPI mudar contrato de login.
  - Mitigação: adapter com versionamento (`v1`, `v2`) + testes de contrato.

- **Risco:** inconsistência de publicação entre DJE e DataJud.
  - Mitigação: modelo de evento com `source` e reconciliação sem sobrescrita destrutiva.

- **Risco:** bloqueio de gateway por rate limit.
  - Mitigação: backoff + batch adaptativo + cache de última versão.

