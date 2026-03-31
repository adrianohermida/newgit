# HMADV - Importadores institucionais CNJ

## Objetivo

Transformar o material dos anexos em importadores oficiais para:

- `judiciario.serventia_cnj`
- `judiciario.juizo_cnj`
- `judiciario.codigo_foro_tjsp`

## Base encontrada nos anexos

Arquivos de referencia:

- `D:\Github\newgit\_analysis\ServentiasTable\JuizoCNJSchema.ts`
- `D:\Github\newgit\_analysis\ServentiasTable\ServentiasCSVImporter.jsx`
- `D:\Github\newgit\_analysis\ServentiasTable\CodigoForoTJSPImporter.jsx`
- `D:\Github\newgit\_analysis\cnjparse\cnjparse\cnjParse.ts`

## Tabelas destino no HMADV

Ja previstas em:

- `D:\Github\newgit\docs\hmadv_p1_tpu_schema.sql`

## 1. Importador de serventias

### Tabela destino

- `judiciario.serventia_cnj`

### Campos minimos esperados

- `tribunal`
- `uf`
- `municipio`
- `numero_serventia`
- `nome_serventia`
- `tipo_orgao`
- `competencia`
- `telefone`
- `email`
- `endereco`
- `cep`

### Chave sugerida de upsert

- `tribunal + numero_serventia + nome_serventia`

### Arquivo/base de referencia

- `D:\Github\newgit\_analysis\ServentiasTable\ServentiasCSVImporter.jsx`

## 2. Importador de juizos

### Tabela destino

- `judiciario.juizo_cnj`

### Campos minimos esperados

- `tribunal`
- `grau`
- `orgao_julgador`
- `competencia`
- `codigo_cnj`
- `serventia_id`

### Campos auxiliares uteis do anexo

- `uf`
- `numero_serventia`
- `nome_serventia`
- `juizo_100_digital`
- `tipo_unidade`
- `classificacao`
- `unidade`
- `permite_peticionamento_eletronico`
- `sistema_processual`

Esses campos podem entrar em `metadata` na primeira fase.

### Chave sugerida de upsert

- `tribunal + codigo_cnj + orgao_julgador`

### Arquivo/base de referencia

- `D:\Github\newgit\_analysis\ServentiasTable\JuizoCNJSchema.ts`

## 3. Importador de foro TJSP

### Tabela destino

- `judiciario.codigo_foro_tjsp`

### Campos minimos esperados

- `codigo_foro`
- `nome_foro`
- `comarca`
- `municipio`
- `uf`
- `tribunal`

### Chave sugerida de upsert

- `codigo_foro`

### Arquivo/base de referencia

- `D:\Github\newgit\_analysis\ServentiasTable\CodigoForoTJSPImporter.jsx`

## 4. Estrategia de implementacao

### Fase 1

- criar scripts de importacao offline em PowerShell ou Node
- aceitar CSV padrao
- persistir via REST no schema `judiciario`

### Fase 2

- criar Edge Function `cnj-institutional-import`
- aceitar payload normalizado em JSON
- fazer upsert em lote por tipo:
  - `serventias`
  - `juizos`
  - `foro_tjsp`

### Fase 3

- ligar `datajud-search` a:
  - `juizo_cnj`
  - `serventia_cnj`
  - `codigo_foro_tjsp`

## 5. Modulos reaproveitaveis

Ja deixei uma base compartilhada em:

- `D:\Github\newgit\_hmadv_review\supabase\functions\_shared\datajud\cnjParse.ts`

Esse modulo concentra:

- parse do numero CNJ
- validacao do DV
- ramo judicial
- alias do tribunal
- serventia extraida do numero CNJ

## 6. Proximo passo recomendado

1. aplicar `hmadv_p1_tpu_schema.sql`
2. importar `serventia_cnj` com:
   - `D:\Github\newgit\docs\hmadv_import_serventia_cnj.ps1`
3. importar `juizo_cnj` com:
   - `D:\Github\newgit\docs\hmadv_import_juizo_cnj.ps1`
4. popular `codigo_foro_tjsp` com:
   - `D:\Github\newgit\docs\hmadv_import_codigo_foro_tjsp.ps1`
5. ligar enriquecimento institucional dentro da `datajud-search`

## 7. Scripts prontos

- `D:\Github\newgit\docs\hmadv_import_serventia_cnj.ps1`
- `D:\Github\newgit\docs\hmadv_import_juizo_cnj.ps1`
- `D:\Github\newgit\docs\hmadv_import_codigo_foro_tjsp.ps1`
