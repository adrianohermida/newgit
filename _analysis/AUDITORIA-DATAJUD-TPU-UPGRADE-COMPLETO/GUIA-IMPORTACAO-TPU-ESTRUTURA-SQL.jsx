## 📋 GUIA: ESTRUTURA SQL PARA IMPORTAÇÃO TPU

### Visão Geral

O importador TPU SQL suporta 4 tabelas principais. Cada uma tem um schema específico que deve ser respeitado.

---

## 1️⃣ TPUClasses - Classes Judiciais

**Entidade:** `TPUClasses`

**Schema (Entity JSON):**
```json
{
  "cod_classe": "integer (OBRIGATÓRIO - chave primária)",
  "nome": "string (OBRIGATÓRIO)",
  "sigla": "string",
  "natureza": "string",
  "polo_ativo": "string",
  "polo_passivo": "string",
  "glossario": "string (texto longo)",
  "numeracao_propria": "enum [S, N]",
  "just_es_1grau": "enum [S, N]",
  "just_es_2grau": "enum [S, N]",
  "just_fed_1grau": "enum [S, N]",
  "just_fed_2grau": "enum [S, N]",
  "just_trab_1grau": "enum [S, N]",
  "just_trab_2grau": "enum [S, N]",
  "stf": "enum [S, N]",
  "stj": "enum [S, N]",
  "tipo_item": "string (padrão: 'C')",
  "usu_inclusao": "string (padrão: 'IMPORT_SQL')",
  "dat_inclusao": "date-time (padrão: agora)",
  "situacao": "enum [A, I] (padrão: 'A')"
}
```

**Exemplo SQL Válido:**
```sql
INSERT INTO tpu_classe 
  (cod_classe, nome, sigla, natureza, polo_ativo, polo_passivo, glossario, 
   numeracao_propria, just_es_1grau, just_es_2grau, just_fed_1grau, 
   just_fed_2grau, just_trab_1grau, just_trab_2grau, stf, stj, 
   tipo_item, usu_inclusao, dat_inclusao, situacao)
VALUES
  (1, 'Petição', 'PET', 'Ação ordinária', 'Autor', 'Réu', 
   'Petição inicial para ação ordinária', 'S', 'S', 'S', 'S', 'S', 
   'N', 'N', 'N', 'N', 'C', 'CNJ', '2024-01-01 00:00:00', 'A'),
  (2, 'Ação Rescisória', 'AResc', 'Ação rescisória', 'Autor', 'Réu',
   'Ação rescisória conforme CPC', 'S', 'N', 'S', 'N', 'S',
   'N', 'N', 'N', 'S', 'C', 'CNJ', '2024-01-01 00:00:00', 'A');
```

**Alternativas de nome de tabela (todas funcionam):**
- `tpu_classe`
- `tpu_classes`
- `classe`
- `classes`
- Suporta aspas duplas ou backticks: `"tpu_classe"` ou `` `tpu_classe` ``

---

## 2️⃣ TPUAssuntos - Assuntos/Temas Processuais

**Entidade:** `TPUAssuntos`

**Schema (Entity JSON):**
```json
{
  "cod_assunto": "integer (OBRIGATÓRIO - chave primária)",
  "nome": "string (OBRIGATÓRIO)",
  "ramo_direito": "string (OBRIGATÓRIO)",
  "glossario": "string (texto longo)",
  "dispositivo_legal": "string",
  "artigo": "string",
  "sigiloso": "enum [S, N]",
  "assunto_secundario": "enum [S, N]",
  "crime_antecedente": "enum [S, N] (padrão: 'N')",
  "just_es_1grau": "enum [S, N] (padrão: 'N')",
  "just_fed_1grau": "enum [S, N] (padrão: 'N')",
  "just_trab_1grau": "enum [S, N] (padrão: 'N')",
  "stf": "enum [S, N] (padrão: 'N')",
  "stj": "enum [S, N] (padrão: 'N')",
  "tipo_item": "string (padrão: 'A')",
  "usu_inclusao": "string (padrão: 'IMPORT_SQL')",
  "dat_inclusao": "date-time (padrão: agora)",
  "situacao": "enum [A, I] (padrão: 'A')"
}
```

**Exemplo SQL Válido:**
```sql
INSERT INTO tpu_assunto 
  (cod_assunto, nome, ramo_direito, glossario, dispositivo_legal, 
   artigo, sigiloso, assunto_secundario, crime_antecedente,
   just_es_1grau, just_fed_1grau, just_trab_1grau, stf, stj,
   tipo_item, usu_inclusao, dat_inclusao, situacao)
VALUES
  (1001, 'Ação de Alimentos', 'Direito de Família', 
   'Ação para fixação ou majoração de alimentos', 'CPC', 'Art. 540',
   'N', 'N', 'N', 'S', 'N', 'N', 'N', 'N', 'A', 'CNJ', '2024-01-01 00:00:00', 'A'),
  (1002, 'Adoção', 'Direito de Família',
   'Processo de adoção de menor', 'ECA', 'Art. 39',
   'S', 'N', 'N', 'S', 'N', 'N', 'N', 'N', 'A', 'CNJ', '2024-01-01 00:00:00', 'A');
```

**Alternativas de nome de tabela:**
- `tpu_assunto`
- `tpu_assuntos`
- `assunto`
- `assuntos`

---

## 3️⃣ TPUMovimentos - Movimentações Processuais

**Entidade:** `TPUMovimentos`

**Schema (Entity JSON):**
```json
{
  "cod_movimento": "integer (OBRIGATÓRIO - chave primária)",
  "nome": "string (OBRIGATÓRIO)",
  "movimento": "string (OBRIGATÓRIO)",
  "categoria": "enum [Magistrado, Serventh​​uário] (padrão: 'Magistrado')",
  "subcategoria": "enum [Decisão, Despacho, Julgamento, Arquivista, Contador, Distribuidor, Escrivão, Oficial de Justiça]",
  "glossario": "string (texto longo)",
  "visibilidade_externa": "enum [S, N]",
  "dispositivo_legal": "string",
  "artigo": "string",
  "flg_eletronico": "enum [S, N] (padrão: 'N')",
  "flg_papel": "enum [S, N]",
  "just_es_1grau": "enum [S, N] (padrão: 'N')",
  "just_fed_1grau": "enum [S, N] (padrão: 'N')",
  "just_trab_1grau": "enum [S, N] (padrão: 'N')",
  "stf": "enum [S, N] (padrão: 'N')",
  "stj": "enum [S, N] (padrão: 'N')",
  "tipo_item": "string (padrão: 'M')",
  "usu_inclusao": "string (padrão: 'IMPORT_SQL')",
  "dat_inclusao": "date-time (padrão: agora)",
  "situacao": "enum [A, I] (padrão: 'A')"
}
```

**Exemplo SQL Válido:**
```sql
INSERT INTO tpu_movimento 
  (cod_movimento, nome, movimento, categoria, subcategoria, glossario,
   visibilidade_externa, dispositivo_legal, artigo, flg_eletronico, flg_papel,
   just_es_1grau, just_fed_1grau, just_trab_1grau, stf, stj,
   tipo_item, usu_inclusao, dat_inclusao, situacao)
VALUES
  (1, 'Petição', 'Petição de partes', 'Serventh​​uário', 'Escrivão',
   'Petição protocolizada', 'S', 'CPC', 'Art. 188', 'S', 'S',
   'S', 'S', 'S', 'N', 'N', 'M', 'CNJ', '2024-01-01 00:00:00', 'A'),
  (2, 'Sentença', 'Sentença de mérito', 'Magistrado', 'Julgamento',
   'Pronunciamento decisório do juiz', 'S', 'CPC', 'Art. 203', 'S', 'S',
   'S', 'S', 'S', 'N', 'S', 'M', 'CNJ', '2024-01-01 00:00:00', 'A');
```

**Alternativas de nome de tabela:**
- `tpu_movimento`
- `tpu_movimentos`
- `movimento`
- `movimentos`

---

## 4️⃣ TPUDocumentos - Tipos de Documentos

**Entidade:** `TPUDocumentos`

**Schema (Entity JSON):**
```json
{
  "cod_documento_processual": "integer (OBRIGATÓRIO - chave primária)",
  "txt_glossario": "string (OBRIGATÓRIO - descrição)",
  "usu_inclusao": "string (OBRIGATÓRIO, padrão: 'IMPORT_SQL')",
  "dat_inclusao": "date-time (OBRIGATÓRIO, padrão: agora)",
  "dsc_ip_usu_inclusao": "string (opcional - IP do usuário)",
  "usu_alteracao": "string (opcional)",
  "dat_alteracao": "date-time (opcional)",
  "situacao": "enum [A, I] (padrão: 'A')",
  "cod_documento_pai": "integer (opcional - para hierarquias)",
  "dsc_caminho_completo": "string (opcional - caminho hierárquico)",
  "dat_inicio_vigencia": "date (opcional)",
  "dat_fim_vigencia": "date (opcional)",
  "dat_versao": "date-time (opcional)",
  "num_versao_lancado": "integer (opcional)"
}
```

**Exemplo SQL Válido:**
```sql
INSERT INTO tpu_documento 
  (cod_documento_processual, txt_glossario, usu_inclusao, dat_inclusao,
   dsc_ip_usu_inclusao, situacao, cod_documento_pai, dsc_caminho_completo,
   dat_inicio_vigencia, dat_fim_vigencia)
VALUES
  (1, 'Petição Inicial', 'CNJ', '2024-01-01 00:00:00',
   '192.168.1.1', 'A', NULL, 'Documentos/Petição', '2024-01-01', NULL),
  (2, 'Parecer do MP', 'CNJ', '2024-01-01 00:00:00',
   '192.168.1.1', 'A', NULL, 'Documentos/Parecer', '2024-01-01', NULL);
```

**Alternativas de nome de tabela:**
- `tpu_documento`
- `tpu_documentos`
- `documento`
- `documentos`

---

## 🎯 BOAS PRÁTICAS

### 1. Antes de Importar

✅ **Validações obrigatórias:**
- Chave primária nunca é NULL (cod_classe, cod_assunto, cod_movimento, cod_documento_processual)
- Campos obrigatórios preenchidos (nome, ramo_direito, etc)
- Datas em formato válido: `YYYY-MM-DD HH:MM:SS` ou `YYYY-MM-DD`
- ENUMs com valores corretos (S/N, A/I, etc)

### 2. Tratamento de Duplicatas

```
Se durante importação encontrar registro com mesma chave primária:
  ✅ IGNORADO (automático)
  → Mensagem: "X duplicatas ignoradas"
  → Não bloqueia importação dos demais
```

### 3. Se SQL Não Informar Tabela

O importador terá 2 estratégias:

**Opção 1: Detecção Automática (recomendado)**
- Análisa nome da tabela no SQL
- Se encontrar `INSERT INTO tpu_classe` → importa para TPUClasses
- Se encontrar `INSERT INTO assunto` → importa para TPUAssuntos
- Se não encontrar → erro (precisa especificar)

**Opção 2: Seleção Manual (seu novo recurso)**
- Você seleciona tabela de destino no dropdown
- Importador força envio para aquela tabela
- Sobrescreve detecção automática

### 4. Exemplo Completo (misto)

```sql
-- Classes
INSERT INTO tpu_classe (cod_classe, nome, sigla, glossario, numeracao_propria, just_es_1grau, situacao)
VALUES (1, 'Petição', 'PET', 'Petição inicial', 'S', 'S', 'A');

-- Assuntos
INSERT INTO tpu_assunto (cod_assunto, nome, ramo_direito, just_es_1grau, situacao)
VALUES (1001, 'Alimentos', 'Direito de Família', 'S', 'A');

-- Movimentos
INSERT INTO tpu_movimento (cod_movimento, nome, movimento, categoria, just_es_1grau, situacao)
VALUES (1, 'Petição', 'Petição de partes', 'Serventh​​uário', 'S', 'A');
```

Se SQL contiver INSERT de múltiplas tabelas → importador processa TODAS

---

## ⚠️ ERROS COMUNS

| Erro | Causa | Solução |
|------|-------|--------|
| "Nenhuma tabela TPU encontrada" | Nome da tabela não reconhecido | Use `tpu_classe` ou selecione manualmente |
| "X registros com erro" | Valores inválidos | Validar tipos e ENUMs |
| "Duplicate key" | Registro já existe | Normal, ignorado automaticamente |
| "Campos obrigatórios vazios" | cod_classe, nome, etc NULL | Preencher campos obrigatórios |

---

## 📊 RESUMO CAMPOS POR TABELA

| Tabela | Chave Primária | Obrigatórios | Total Campos |
|--------|---|---|---|
| TPUClasses | cod_classe (int) | nome | 20 |
| TPUAssuntos | cod_assunto (int) | nome, ramo_direito | 16 |
| TPUMovimentos | cod_movimento (int) | nome, movimento, categoria | 19 |
| TPUDocumentos | cod_documento_processual (int) | txt_glossario, usu_inclusao, dat_inclusao | 13 |

---

## 🚀 PRÓXIMOS PASSOS

1. ✅ Preparar SQL com estrutura correta
2. ✅ Opcional: Selecionar tabela manualmente se SQL ambíguo
3. ✅ Clicar "Importar SQL"
4. ✅ Verificar resultado (registros importados, duplicatas, erros)
5. ✅ Consultar dados via `djeBuscarPublicacoes`, `enriquecerProcessoComTPU`, etc

---

**Documentação última atualização:** 27/fev/2026
**Versão do importador:** 2.0 (com direcionamento manual de tabelas)