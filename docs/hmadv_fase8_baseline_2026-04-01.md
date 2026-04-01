# HMADV - Baseline da Fase 8 em 2026-04-01

## Achado principal

Há processos já vinculados ao Freshsales cujo reflexo no `Sales Account` está correto, mas os campos estruturais no Supabase ainda aparecem nulos em `judiciario.processos`.

Campos observados nulos em amostra real:

- `polo_ativo`
- `polo_passivo`
- `status_atual_processo`

## Amostra real

Casos retornados por:

- `processos?account_id_freshsales=not.is.null&or=(polo_ativo.is.null,polo_passivo.is.null,status_atual_processo.is.null)`

Exemplos:

- `0000204-50.2021.8.26.0441`
  - `titulo = 0000204-50.2021.8.26.0441 (EVA MARIA GUIMARÃES CARDOSO x ANTÔNIO PELO IRMÃO)`
  - `polo_ativo = null`
  - `polo_passivo = null`
  - `status_atual_processo = null`

- `0028390-70.2012.8.26.0224`
  - `titulo = 0028390-70.2012.8.26.0224 (ANTONIO PEREIRA MARINHO x JOSE ADOLFO RICCA GRUNHO)`
  - `polo_ativo = null`
  - `polo_passivo = null`
  - `status_atual_processo = null`

- `0000430-74.2023.8.26.0606`
  - `titulo = 0000430-74.2023.8.26.0606 (ASSOCIAÇÃO DOS PROPRIETÁRIOS EM RESERVA IBIRAPITANGA x ROBERTO DE LIMA)`
  - `polo_ativo = null`
  - `polo_passivo = null`
  - `status_atual_processo = null`

## Interpretação

O pipeline atual já consegue:

- montar o título corretamente para o Freshsales
- preencher `cf_polo_ativo`, `cf_parte_adversa` e `cf_status` em parte dos accounts

Mas a persistência canônica no Supabase ainda não está consistente para todos os processos.

## Implicação para a Fase 8

A implementação de `Contacts + Polos + Status` precisa garantir:

1. persistência em `judiciario.processos`, não apenas no payload enviado ao Freshsales
2. reconciliação retroativa dos processos já vinculados
3. uso de `judiciario.partes` como fonte persistida para polos e cliente principal
4. inferência de `status_atual_processo` por movimento/publicação com fallback `Ativo`

## Ordem

Sem pular etapas:

1. aplicar grant de `audiencias`
2. homologar `Audiências + Consulta + Appointment`
3. executar a Fase 8 atacando também essa lacuna de persistência
