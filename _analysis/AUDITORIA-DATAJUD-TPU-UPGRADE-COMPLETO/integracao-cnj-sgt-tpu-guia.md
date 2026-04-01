# Guia de implementação — integração CNJ (SGT WSDL + TPU Swagger)

## Objetivo
Permitir consultar e sincronizar tabelas processuais unificadas (Classes, Assuntos, Movimentos) usando:
1. **SGT SOAP/WSDL** público do CNJ (`sgt_ws.php?wsdl`), e
2. **TPU Gateway Swagger** (`gateway.cloud.pje.jus.br/tpu/swagger-ui.html#/Consulta`).

Este guia está alinhado com a arquitetura atual do projeto (functions em Deno + entidades TPU locais).

---

## 1) O que já existe no projeto e pode ser reaproveitado

- Entidades locais TPU usadas no enrichment do processo:
  - `TPUClasse`, `TPUMovimento`, `TPUAssunto`. 【F:functions/sincronizarProcessoCompleto.ts†L108-L140】
- Importação SQL já existente para TPU (`importarTPUSql`) com mapeamento de tabelas. 【F:functions/importarTPUSql.ts†L57-L59】
- Consulta/fluxo DataJud já integrado ao ciclo de processo. 【F:functions/consultarDataJud.ts†L171-L171】【F:src/pages/Processos.jsx†L35-L35】

---

## 2) Implementação sugerida (arquitetura)

## 2.1 Camada de cliente CNJ
Foi adicionado utilitário dedicado em:
- `functions/utils/cnjSgtClient.ts`.

Ele expõe wrappers para os métodos públicos do SGT:
- `pesquisarItemPublicoWS`
- `getArrayDetalhesItemPublicoWS`
- `getArrayFilhosItemPublicoWS`
- `getStringPaisItemPublicoWS`
- `getComplementoMovimentoWS`
- `getDataUltimaVersao`

E também helper para Gateway Swagger:
- `consultarTPUGateway(...)`.

Referência: 【F:functions/utils/cnjSgtClient.ts†L1-L236】

## 2.2 Camada de aplicação (functions)
Crie (ou ajuste) functions de orquestração:

1. `functions/sincronizarTpuViaSgt.ts`
   - chama `getDataUltimaVersao()`;
   - faz `pesquisarItemPublicoWS` para A/M/C;
   - normaliza com `toTPUEntityPayload()`;
   - faz upsert em `TPUClasse`, `TPUMovimento`, `TPUAssunto`.

2. `functions/sincronizarTpuViaGateway.ts`
   - usa `consultarTPUGateway` apontando para rotas oficiais do Swagger;
   - pagina e persiste incremental.

3. `functions/sincronizarTpuCompleto.ts`
   - estratégia híbrida:
     - tenta gateway primeiro (mais estruturado),
     - fallback para SOAP SGT.

## 2.3 Camada de UI/Admin
No painel admin (já existente):
- adicionar ação “Sincronizar TPU CNJ (Online)” no `TPUImporter`/DataJud admin;
- mostrar versão CNJ (`getDataUltimaVersao`) e último sync local;
- registrar métricas em `SyncLog`.

---

## 3) Exemplo de uso rápido (backend function)

```ts
import {
  pesquisarItemPublicoWS,
  toTPUEntityPayload,
} from './utils/cnjSgtClient.ts';

// Assuntos por nome
const assuntos = await pesquisarItemPublicoWS('A', 'N', 'consumidor');
const payload = toTPUEntityPayload(assuntos);

for (const item of payload) {
  await base44.asServiceRole.entities.TPUAssunto.create({
    codigo: item.codigo,
    nome: item.nome,
    ativo: true,
    glossario: item.glossario,
  });
}
```

---

## 4) Mapeamento recomendado SGT -> entidades locais

- Tipo `A` -> `TPUAssunto`
- Tipo `M` -> `TPUMovimento`
- Tipo `C` -> `TPUClasse`

Campos mínimos:
- `codigo` <- `cod_item`
- `nome` <- `nome`
- `ativo` <- `true`

Campos enriquecidos (se disponíveis):
- `codigo_pai` <- `cod_item_pai`
- `glossario` <- `dscGlossario`
- árvore de pais/filhos via `getArrayFilhosItemPublicoWS` / `getStringPaisItemPublicoWS`

---

## 5) Segurança, confiabilidade e performance

1. **Nunca chamar SOAP diretamente no frontend**.
2. **Usar service role no backend** para persistência.
3. **Retry com backoff** em timeout/5xx.
4. **Sincronização incremental** por data de versão (`getDataUltimaVersao`).
5. **Rate limit** por lote (ex.: 100 itens por batch).
6. **Idempotência** por `codigo` (upsert).
7. **Observabilidade**: salvar logs por execução (`inicio`, `fim`, `versao`, `qtd`, `falhas`).

---

## 6) Estratégia prática de rollout

### Fase 1 — MVP técnico
- habilitar método SOAP (`pesquisarItemPublicoWS`) para A/M/C
- popular tabelas TPU locais
- validar enriquecimento em `sincronizarProcessoCompleto`

### Fase 2 — Produção
- adicionar sync agendado diário/semanal
- comparar versão remota x local
- monitorar erro/sucesso via SyncLog

### Fase 3 — Gateway first
- migrar gradualmente para endpoints do Swagger quando estáveis
- manter fallback SGT SOAP

---

## 7) Check de aceite

- [ ] Consulta SGT funcionando para A/M/C.
- [ ] Tabelas locais TPU atualizadas sem duplicar código.
- [ ] `sincronizarProcessoCompleto` aproveitando dados TPU atualizados.
- [ ] Log de sync e versão CNJ persistidos.
- [ ] Fallback Gateway -> SOAP validado.

