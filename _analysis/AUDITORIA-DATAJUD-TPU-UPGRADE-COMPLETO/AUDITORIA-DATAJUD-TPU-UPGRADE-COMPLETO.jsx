# 🔍 AUDITORIA DATAJUD — TPU & ENRIQUECIMENTO
**Data:** 2026-02-26  
**Status:** ⚠️ **PARCIALMENTE IMPLEMENTADO**  
**Prioridade:** 🔴 **CRÍTICA — BLOQUEADOR SPRINT 18**

---

## 📋 RESUMO EXECUTIVO

| Área | Status | Progresso | Bloqueador |
|------|--------|-----------|-----------|
| **TPU Enriquecimento** | 🟡 Parcial | 60% | ❌ Sim |
| **DatajudAdminPanel** | ✅ Ativo | 100% | ✅ Não |
| **DatajudAdmin** | ✅ Ativo | 100% | ✅ Não |
| **Endpoints Testador** | 🟡 Básico | 40% | ❌ Sim |
| **Tabelas Suporte** | 🔴 Faltando | 0% | ❌ Sim |
| **Módulo Processos** | 🟡 Básico | 50% | ❌ Sim |

**Conclusão:** Infraestrutura 80% pronta, mas enriquecimento TPU e integração de tabelas CNJ precisam de implementação total.

---

## 1️⃣ ANÁLISE DETALHADA POR COMPONENTE

### 1.1 TPU Enriquecimento (Classe, Assunto, Movimento)

#### ✅ O que existe:
- `functions/sincronizarTpuViaSgt.ts` — SOAP/SGT completo
- `functions/utils/cnjSgtClient.ts` — Cliente CNJ/TPU
- `functions/importarTPUSql.ts` — Parser SQL stream
- `components/datajud/TPUImporter.jsx` — UI sync/import
- Entidades `TPUClasse`, `TPUAssunto`, `TPUMovimento` definidas

#### ❌ O que falta:
1. **Enriquecimento automático na sincronização** → `sincronizarProcessoDataJud.js` NÃO busca TPU
2. **Cache de TPU em memória** → queries lentas ao enriquecer
3. **Índices de busca por código** → sem índice em `TPUClasse.codigo`, etc.
4. **Integração em ProcessoCEJUSCForm** → assuntos/classes não vêm pré-preenchidas do TPU
5. **Validação de classe_codigo** → aceita valores inválidos

#### 📊 Impacto:
- **Usuários:** Não conseguem ver nomes de classe/assuntos, só códigos
- **Performance:** Lookups manuais necessários
- **DataJud:** Processos sincronizados sem contexto TPU enriquecido

---

### 1.2 Tabelas de Suporte (JuizoCNJ, Serventias, CodigoForoTJSP)

#### ✅ O que existe:
- `pages/DatajudAdminPanel` — UI shell com 5 abas
- Componentes importadores referenciados mas **NÃO implementados**:
  - `JuizoCNJCSVImporter`
  - `ServentiasCSVImporter`
  - `CodigoFotoTJSPImporter`

#### ❌ O que falta (CRÍTICO):
1. **Entidades não existem:**
   - `JuizoCNJ` → falta schema
   - `Serventia` → falta schema
   - `CodigoForoTJSP` → falta schema

2. **Componentes importadores não criados:**
   - Sem UI de upload CSV
   - Sem parsers específicos
   - Sem validação de dados

3. **Sincronização DataJud não usa estas tabelas:**
   - `codigo_orgao_julgador` não é enriquecido com JuizoCNJ
   - Serventias não são linkadas
   - TJSP não tem código foro preenchido

4. **Integrações de busca faltam:**
   - Processos não conseguem buscar juízo por código
   - Sem autocomplete de serventias
   - Sem mapeamento TJSP/código

#### 📊 Impacto:
- **Severity:** 🔴 **CRÍTICA**
- **Usuários:** Interfaces quebradas (componentes não existem)
- **DataJud:** Enriquecimento incompleto
- **Sprint 18:** BLOQUEADO até resolver

---

### 1.3 EndpointsManager (Guia de Endpoints)

#### ✅ O que existe:
- `pages/DatajudAdmin` → tab "🔌 Endpoints"
- `components/datajud/EndpointsManager` → **ARQUIVO NÃO ENCONTRADO**
- `DatajudEndpointTester` → testa um endpoint por vez
- `todosEndpoints()` em `CNJParser` → lista endpoints conhecidos

#### ❌ O que falta:
1. **EndpointsManager não existe** → import falha
2. **Documentação endpoints:**
   - Sem descrição de cada API
   - Sem status (funcional/deprecado)
   - Sem exemplos de request/response
   - Sem versionamento

3. **Tester incompleto:**
   - Só testa consulta básica
   - Sem teste de filtros avançados
   - Sem teste de paginação
   - Sem teste de erros esperados

#### 📊 Impacto:
- **Severity:** 🟡 **MÉDIA**
- **DevEx:** Documentação ausente prejudica onboarding
- **Sprint 18:** Não bloqueia, mas reduz eficiência

---

### 1.4 Integração Módulo Processos

#### ✅ O que existe:
- `ProcessoCEJUSCForm` → form básico funciona
- `AutoPreenchimentoProcesso` → busca DataJud
- Tab "DataJud" mostra assuntos/movimentos

#### ❌ O que falta:
1. **Classes TPU não são listadas:**
   - Campo `classe_judicial` é texto livre
   - Sem dropdown de classes válidas
   - Sem validação contra `TPUClasse.codigo`

2. **Assuntos não enriquecidos:**
   - Vêm como strings simples
   - Sem lookup em `TPUAssunto`
   - Sem link bidirecional processo ↔ assunto

3. **Órgãos julgadores sem enriquecimento:**
   - `orgao_julgador` é só nome
   - Sem busca em `JuizoCNJ`
   - Sem código_orgao_julgador

4. **Sem indicadores de completude:**
   - Usuário não sabe se classe é válida
   - Sem validação em tempo real
   - Sem sugestões

#### 📊 Impacto:
- **Severity:** 🟡 **MÉDIA**
- **Usuários:** Dados inconsistentes no ProcessoCEJUSC
- **DataJud:** Sincronização não consegue enriquecer

---

## 2️⃣ TABELA DE PENDÊNCIAS ESTRUTURADAS

### 📌 Bloqueadores Críticos (Sprint 18)

| ID | Pendência | Complexidade | Estimativa | Bloqueador |
|----|-----------|--------------|-----------|-----------|
| **P-001** | Criar entidades: JuizoCNJ, Serventia, CodigoForoTJSP | 🔴 Alta | 2h | ✅ SIM |
| **P-002** | Implementar 3 importadores CSV | 🔴 Alta | 4h | ✅ SIM |
| **P-003** | Integrar TPU em sincronizarProcessoDataJud | 🔴 Alta | 3h | ✅ SIM |
| **P-004** | Criar índices TPU e JuizoCNJ | 🟡 Média | 1h | ✅ SIM |
| **P-005** | Enriquecer órgão julgador com JuizoCNJ | 🟡 Média | 2h | ✅ SIM |
| **P-006** | Validar classe_codigo em ProcessoCEJUSCForm | 🟡 Média | 1.5h | ✅ SIM |

### 📌 Nice-to-Have (Sprint 19)

| ID | Pendência | Complexidade | Estimativa |
|----|-----------|--------------|-----------|
| **P-007** | Criar EndpointsManager com documentação | 🟡 Média | 3h |
| **P-008** | Implementar DatajudEndpointTester avançado | 🟡 Média | 2h |
| **P-009** | Cache em memória de TPU (Redis) | 🔴 Alta | 2h |
| **P-010** | Autocomplete de classes/assuntos | 🟡 Média | 2h |

---

## 3️⃣ PLANO DE AÇÃO INTEGRADO

### 🎯 Fase 1: Fundação Crítica (26-27/fev, ~8.5h)

#### Task 1.1: Criar Entidades de Suporte (2h)
```json
{
  "arquivos": [
    "entities/JuizoCNJ.json",
    "entities/Serventia.json", 
    "entities/CodigoForoTJSP.json"
  ],
  "campos_minimos": {
    "JuizoCNJ": ["codigo", "nome", "tribunal", "municipio", "ativo"],
    "Serventia": ["codigo", "nome", "tribunal", "cartorio_tipo", "ativo"],
    "CodigoForoTJSP": ["codigo_tjsp", "codigo_cnj", "nome_foro", "ativo"]
  }
}
```

#### Task 1.2: Implementar 3 Importadores CSV (4h)
Criar em `components/datajud/`:
- `JuizoCNJCSVImporter.jsx` (1.5h) — upload CSV → JuizoCNJ
- `ServentiasCSVImporter.jsx` (1.5h) — upload CSV → Serventia
- `CodigoFotoTJSPImporter.jsx` (1h) — upload CSV → CodigoForoTJSP

#### Task 1.3: Integração em DatajudAdminPanel (1h)
- Verificar imports funcionam
- Testar fluxos de upload
- Validar UIs renderizam

#### Task 1.4: Criar Índices (1.5h)
```sql
-- functions/utils/createIndexes.ts
TPUClasse: index(codigo)
TPUAssunto: index(codigo)
TPUMovimento: index(codigo)
JuizoCNJ: index(codigo, tribunal)
CodigoForoTJSP: index(codigo_tjsp, codigo_cnj)
```

---

### 🎯 Fase 2: Enriquecimento DataJud (27-28/fev, ~8h)

#### Task 2.1: Integrar TPU em sincronizarProcessoDataJud (3h)
Modificar `functions/sincronizarProcessoDataJud.js`:
```javascript
// Após receber dados DataJud:
1. Buscar TPUClasse.codigo = classe_codigo
2. Buscar TPUAssunto.codigo em assuntos
3. Enriquecer com nomes/glossários
4. Salvar em ProcessoCEJUSC
```

#### Task 2.2: Enriquecer Órgão Julgador com JuizoCNJ (2h)
```javascript
// Após DataJud:
if (codigo_orgao_julgador) {
  juizo = await JuizoCNJ.filter({ codigo })
  orgao_julgador = juizo.nome
  tribunal = juizo.tribunal
}
```

#### Task 2.3: Enriquecer Código Foro TJSP (2h)
```javascript
// Para TJSP (tribunal = TJSP):
if (tribunal === 'TJSP' && orgao_julgador) {
  foro = await CodigoForoTJSP.filter({ codigo_cnj })
  codigo_foro_tjsp = foro.codigo_tjsp
}
```

#### Task 2.4: Registrar SyncLog com TPU (1h)
Adicionar campos a SyncLog:
```json
{
  "tpu_classe_enriquecida": true,
  "tpu_assuntos_encontrados": 5,
  "juizo_encontrado": true,
  "metadata": { "classes": [...], "assuntos": [...] }
}
```

---

### 🎯 Fase 3: Integração ProcessoCEJUSCForm (28/fev, ~4h)

#### Task 3.1: Validação Classe TPU (1.5h)
```javascript
// ProcessoCEJUSCForm:
- Input classe_judicial com autocomplete
- Validar contra TPUClasse.codigo
- Mostrar erro se inválido
- Pre-fill quando DataJud carrega
```

#### Task 3.2: Enriquecimento Assuntos (1.5h)
```javascript
// Ao receber assuntos do DataJud:
assuntos = assuntos.map(a => ({
  ...a,
  nome: TPUAssunto.find(t => t.codigo === a.codigo)?.nome || a.nome,
  glossario: TPUAssunto.find(...)?.glossario
}))
```

#### Task 3.3: Indicadores Visuais (1h)
- Badge "Enriquecido com TPU" quando dados vêm de TPU
- Ícone de validação em classe_judicial
- Tooltip com informações do TPU

---

### 🎯 Fase 4: Documentação & Testes (1/mar, ~4h)

#### Task 4.1: EndpointsManager (2h)
Criar `components/datajud/EndpointsManager.jsx`:
- Lista todos endpoints DataJud
- Para cada: descrição, status, exemplo request/response
- Link para tester

#### Task 4.2: Testes Integrados (2h)
```javascript
// tests/datajud-tpu-integration.test.ts
1. Sincronizar processo com TPU ✓
2. Enriquecer classe ✓
3. Enriquecer assuntos ✓
4. Enriquecer órgão julgador ✓
5. Validar ProcessoCEJUSCForm ✓
```

---

## 4️⃣ CHECKLIST IMPLEMENTAÇÃO

### ✅ Entidades
- [ ] JuizoCNJ.json criada
- [ ] Serventia.json criada
- [ ] CodigoForoTJSP.json criada
- [ ] Índices criados

### ✅ Importadores
- [ ] JuizoCNJCSVImporter.jsx criada
- [ ] ServentiasCSVImporter.jsx criada
- [ ] CodigoFotoTJSPImporter.jsx criada
- [ ] Todos importadores integrados em DatajudAdminPanel

### ✅ Enriquecimento DataJud
- [ ] TPU integrado em sincronizarProcessoDataJud
- [ ] JuizoCNJ integrado
- [ ] CodigoForoTJSP integrado
- [ ] SyncLog registra enriquecimentos

### ✅ ProcessoCEJUSCForm
- [ ] Validação classe_judicial
- [ ] Autocomplete classes
- [ ] Enriquecimento assuntos automático
- [ ] Indicadores visuais

### ✅ Documentação
- [ ] EndpointsManager criada
- [ ] Testes integrados
- [ ] Documentação de fluxo

---

## 5️⃣ CRONOGRAMA REVISADO

```
26/fev (26-fev) — Fundação
├─ 08:00-10:00 Entidades (P-001)
├─ 10:00-14:00 Importadores CSV (P-002)
└─ 14:00-16:00 Índices (P-004)

27/fev (27-fev) — Enriquecimento DataJud
├─ 09:00-12:00 TPU sincronização (P-003)
├─ 12:00-14:00 Órgão julgador (P-005)
└─ 14:00-16:00 TJSP enriquecimento

28/fev (28-fev) — ProcessoCEJUSCForm
├─ 09:00-10:30 Validação classe (P-006)
├─ 10:30-12:00 Assuntos enriquecimento
├─ 13:00-14:00 Indicadores visuais
└─ 14:00-15:00 Testes

01/mar (01-mar) — Documentação
├─ 09:00-11:00 EndpointsManager
└─ 11:00-16:00 Testes integrados
```

**Total Estimado:** ~24.5 horas (Sprint 18 não é bloqueado, pois email/WhatsApp são independentes)

---

## 6️⃣ RECOMENDAÇÕES

### 🎯 Prioridade 1: INÍCIO HOJE (26/fev)
1. Criar entidades CNJ (JuizoCNJ, Serventia, CodigoForoTJSP)
2. Implementar importadores CSV
3. Integrar TPU em sincronizarProcessoDataJud

**Impacto:** Desbloqueador para Sprint 19, melhora Data enriquecimento sprint 18+

### 🎯 Prioridade 2: PARALELO COM SPRINT 18
- Validação ProcessoCEJUSCForm
- Testes integrados
- EndpointsManager

**Impacto:** Estabilização, melhor DevEx

### 🎯 Prioridade 3: PÓS SPRINT 18
- Cache Redis TPU
- Autocomplete avançado
- ML para matching órgãos

---

## 📊 RESUMO FINAL

| Categoria | Status | Ação |
|-----------|--------|------|
| **Enriquecimento TPU** | 🟡 Parcial | Implementar integração completa |
| **Tabelas Suporte** | 🔴 Faltando | Criar entidades + importadores |
| **ProcessoCEJUSCForm** | 🟡 Básico | Adicionar validação TPU |
| **Documentação** | 🔴 Ausente | Criar EndpointsManager |
| **Testes** | 🟡 Básico | Implementar integrados |

**Conclusão:** Arquitetura está 80% pronta. Faltam ~25h de implementação para completar enriquecimento TPU e integração CNJ. **NÃO bloqueia Sprint 18** (email/WhatsApp), mas **ESSENCIAL para Sprint 19**.

---

✅ **Próximo Passo:** Confirmar cronograma e iniciar Task 1.1 (Entidades) hoje.