-- Tabela de cursor para drenagem reversa da API Advise
-- Usada pela edge function advise-drain-reverse

CREATE TABLE IF NOT EXISTS judiciario.advise_drain_cursor (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pagina_atual    INTEGER NOT NULL DEFAULT 1,
  total_paginas   INTEGER,
  total_registros INTEGER,
  status          TEXT NOT NULL DEFAULT 'idle',
  ultima_execucao TIMESTAMPTZ,
  novas_total     INTEGER NOT NULL DEFAULT 0,
  duplicadas_total INTEGER NOT NULL DEFAULT 0,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger para atualizar atualizado_em
CREATE OR REPLACE FUNCTION judiciario.set_atualizado_em()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_advise_drain_cursor_atualizado_em ON judiciario.advise_drain_cursor;
CREATE TRIGGER trg_advise_drain_cursor_atualizado_em
  BEFORE UPDATE ON judiciario.advise_drain_cursor
  FOR EACH ROW EXECUTE FUNCTION judiciario.set_atualizado_em();

-- Comentário
COMMENT ON TABLE judiciario.advise_drain_cursor IS 
  'Cursor de estado para drenagem reversa da API Advise (publicações mais recentes primeiro)';
