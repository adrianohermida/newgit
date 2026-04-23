-- ============================================================
-- Migration 058: Tabela canônica contacts_freshsales
-- O Supabase é a única fonte da verdade para contatos.
-- Esta tabela espelha o módulo Contacts do Freshsales e serve
-- como base para deduplicação, higienização, enriquecimento,
-- identificação de partes e promoção de lifecycle.
-- ============================================================

-- Tabela principal
CREATE TABLE IF NOT EXISTS judiciario.contacts_freshsales (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  fs_id               text        NOT NULL UNIQUE,          -- ID no Freshsales (imutável)
  first_name          text,
  last_name           text,
  display_name        text,
  nome_normalizado    text,                                  -- nome sem acentos/pontuação, uppercase
  email               text,
  mobile              text,                                  -- apenas dígitos
  phone               text,                                  -- apenas dígitos
  job_title           text,
  external_id         text,
  owner_id            text,
  fs_account_id       text,                                  -- account vinculado no Freshsales
  tag_list            jsonb       NOT NULL DEFAULT '[]',
  lifecycle_stage_id  text,
  contact_status_id   text,
  cf_cpf              text,                                  -- apenas dígitos (11)
  cf_cnpj             text,                                  -- apenas dígitos (14)
  cf_tipo             text,                                  -- ex: "Cliente", "Parte Adversa"
  cf_fase_ciclo_vida  text,                                  -- ex: "Cliente", "Triagem"
  cf_oab              text,
  is_deleted          boolean     NOT NULL DEFAULT false,
  raw_payload         jsonb,                                 -- payload completo do Freshsales
  fs_created_at       timestamptz,
  fs_updated_at       timestamptz,
  synced_at           timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- Campos de controle de deduplicação
  is_duplicate        boolean     NOT NULL DEFAULT false,
  master_contact_id   uuid        REFERENCES judiciario.contacts_freshsales(id) ON DELETE SET NULL,
  merge_status        text,                                  -- 'pending' | 'merged' | 'kept' | 'discarded'
  merge_notes         text,

  -- Campos de enriquecimento
  representada_pelo_escritorio boolean NOT NULL DEFAULT false,
  lifecycle_promovido_em  timestamptz,                       -- quando o lifecycle foi promovido para Cliente
  lifecycle_motivo        text                               -- motivo da promoção (ex: "advogado_identificado")
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS contacts_fs_fs_id_idx           ON judiciario.contacts_freshsales (fs_id);
CREATE INDEX IF NOT EXISTS contacts_fs_email_idx           ON judiciario.contacts_freshsales (email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS contacts_fs_cpf_idx             ON judiciario.contacts_freshsales (cf_cpf) WHERE cf_cpf IS NOT NULL;
CREATE INDEX IF NOT EXISTS contacts_fs_cnpj_idx            ON judiciario.contacts_freshsales (cf_cnpj) WHERE cf_cnpj IS NOT NULL;
CREATE INDEX IF NOT EXISTS contacts_fs_nome_norm_idx       ON judiciario.contacts_freshsales (nome_normalizado) WHERE nome_normalizado IS NOT NULL;
CREATE INDEX IF NOT EXISTS contacts_fs_account_idx         ON judiciario.contacts_freshsales (fs_account_id) WHERE fs_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS contacts_fs_tipo_idx            ON judiciario.contacts_freshsales (cf_tipo) WHERE cf_tipo IS NOT NULL;
CREATE INDEX IF NOT EXISTS contacts_fs_lifecycle_idx       ON judiciario.contacts_freshsales (cf_fase_ciclo_vida) WHERE cf_fase_ciclo_vida IS NOT NULL;
CREATE INDEX IF NOT EXISTS contacts_fs_representado_idx    ON judiciario.contacts_freshsales (representada_pelo_escritorio) WHERE representada_pelo_escritorio IS TRUE;
CREATE INDEX IF NOT EXISTS contacts_fs_duplicate_idx       ON judiciario.contacts_freshsales (is_duplicate) WHERE is_duplicate IS TRUE;
CREATE INDEX IF NOT EXISTS contacts_fs_master_idx          ON judiciario.contacts_freshsales (master_contact_id) WHERE master_contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS contacts_fs_updated_idx         ON judiciario.contacts_freshsales (fs_updated_at DESC NULLS LAST);

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION judiciario.set_contacts_fs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contacts_fs_updated_at_trigger ON judiciario.contacts_freshsales;
CREATE TRIGGER contacts_fs_updated_at_trigger
  BEFORE UPDATE ON judiciario.contacts_freshsales
  FOR EACH ROW EXECUTE FUNCTION judiciario.set_contacts_fs_updated_at();

-- View: duplicatas por CPF
CREATE OR REPLACE VIEW judiciario.v_contact_duplicates_cpf AS
SELECT
  cf_cpf,
  COUNT(*)                                          AS total,
  array_agg(fs_id ORDER BY fs_created_at)           AS fs_ids,
  array_agg(display_name ORDER BY fs_created_at)    AS nomes,
  array_agg(cf_tipo ORDER BY fs_created_at)         AS tipos,
  MIN(fs_created_at)                                AS mais_antigo,
  MAX(fs_updated_at)                                AS mais_recente
FROM judiciario.contacts_freshsales
WHERE cf_cpf IS NOT NULL
  AND is_deleted = false
GROUP BY cf_cpf
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;

-- View: duplicatas por email
CREATE OR REPLACE VIEW judiciario.v_contact_duplicates_email AS
SELECT
  email,
  COUNT(*)                                          AS total,
  array_agg(fs_id ORDER BY fs_created_at)           AS fs_ids,
  array_agg(display_name ORDER BY fs_created_at)    AS nomes,
  array_agg(cf_tipo ORDER BY fs_created_at)         AS tipos
FROM judiciario.contacts_freshsales
WHERE email IS NOT NULL
  AND is_deleted = false
GROUP BY email
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;

-- View: duplicatas por nome normalizado
CREATE OR REPLACE VIEW judiciario.v_contact_duplicates_nome AS
SELECT
  nome_normalizado,
  COUNT(*)                                          AS total,
  array_agg(fs_id ORDER BY fs_created_at)           AS fs_ids,
  array_agg(display_name ORDER BY fs_created_at)    AS nomes,
  array_agg(cf_cpf ORDER BY fs_created_at)          AS cpfs,
  array_agg(cf_tipo ORDER BY fs_created_at)         AS tipos
FROM judiciario.contacts_freshsales
WHERE nome_normalizado IS NOT NULL
  AND length(nome_normalizado) >= 5
  AND is_deleted = false
GROUP BY nome_normalizado
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;

-- View: painel de higienização (resumo executivo)
CREATE OR REPLACE VIEW judiciario.v_contacts_hygiene_dashboard AS
SELECT
  (SELECT COUNT(*) FROM judiciario.contacts_freshsales WHERE is_deleted = false)                          AS total_ativos,
  (SELECT COUNT(*) FROM judiciario.contacts_freshsales WHERE is_deleted = true)                           AS total_deletados,
  (SELECT COUNT(*) FROM judiciario.contacts_freshsales WHERE cf_cpf IS NOT NULL AND is_deleted = false)   AS com_cpf,
  (SELECT COUNT(*) FROM judiciario.contacts_freshsales WHERE cf_cnpj IS NOT NULL AND is_deleted = false)  AS com_cnpj,
  (SELECT COUNT(*) FROM judiciario.contacts_freshsales WHERE email IS NOT NULL AND is_deleted = false)     AS com_email,
  (SELECT COUNT(*) FROM judiciario.contacts_freshsales WHERE cf_tipo = 'Cliente' AND is_deleted = false)  AS clientes,
  (SELECT COUNT(*) FROM judiciario.contacts_freshsales WHERE representada_pelo_escritorio = true)         AS representados_escritorio,
  (SELECT COUNT(*) FROM judiciario.v_contact_duplicates_cpf)                                              AS grupos_dup_cpf,
  (SELECT COUNT(*) FROM judiciario.v_contact_duplicates_email)                                            AS grupos_dup_email,
  (SELECT COUNT(*) FROM judiciario.v_contact_duplicates_nome)                                             AS grupos_dup_nome,
  (SELECT MAX(synced_at) FROM judiciario.contacts_freshsales)                                             AS ultima_sync;

-- Função SQL para encontrar duplicatas por CPF (usada pela edge function)
CREATE OR REPLACE FUNCTION judiciario.find_contact_duplicates_by_cpf()
RETURNS TABLE (
  cpf          text,
  total        bigint,
  fs_ids       text[],
  nomes        text[],
  tipos        text[]
) LANGUAGE sql STABLE AS $$
  SELECT cf_cpf, COUNT(*), array_agg(fs_id), array_agg(display_name), array_agg(cf_tipo)
  FROM judiciario.contacts_freshsales
  WHERE cf_cpf IS NOT NULL AND is_deleted = false
  GROUP BY cf_cpf
  HAVING COUNT(*) > 1
  ORDER BY COUNT(*) DESC
  LIMIT 100;
$$;

-- Grant de acesso para service_role
GRANT ALL ON judiciario.contacts_freshsales TO service_role;
GRANT ALL ON judiciario.v_contact_duplicates_cpf TO service_role;
GRANT ALL ON judiciario.v_contact_duplicates_email TO service_role;
GRANT ALL ON judiciario.v_contact_duplicates_nome TO service_role;
GRANT ALL ON judiciario.v_contacts_hygiene_dashboard TO service_role;
GRANT EXECUTE ON FUNCTION judiciario.find_contact_duplicates_by_cpf() TO service_role;

COMMENT ON TABLE judiciario.contacts_freshsales IS
  'Espelho canônico do módulo Contacts do Freshsales. '
  'O Supabase é a única fonte da verdade. '
  'Sincronizado via edge function fs-contacts-sync. '
  'Usado para deduplicação, higienização, enriquecimento e identificação de partes.';
