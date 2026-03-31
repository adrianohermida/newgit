-- Table: sgt_consulta.assuntos

-- DROP TABLE sgt_consulta.assuntos;

CREATE TABLE sgt_consulta.assuntos
(
  cod_assunto numeric(10,0) NOT NULL,
  dispositivo_legal character varying(500),
  artigo character varying(500),
  glossario text,
  sigiloso character(1),
  assunto_secundario character(1),
  crime_antecedente character(1),
  just_es_1grau character(1),
  just_es_2grau character(1),
  just_es_juizado_es character(1),
  just_es_turmas character(1),
  just_es_1grau_mil character(1),
  just_es_2grau_mil character(1),
  just_es_juizado_es_fp character(1),
  just_tu_es_un character(1),
  just_fed_1grau character(1),
  just_fed_2grau character(1),
  just_fed_juizado_es character(1),
  just_fed_turmas character(1),
  just_fed_nacional character(1),
  just_fed_regional character(1),
  just_trab_1grau character(1),
  just_trab_2grau character(1),
  just_trab_tst character(1),
  just_trab_csjt character(1),
  stf character(1),
  stj character(1),
  cjf character(1),
  cnj character(1),
  just_mil_uniao_1grau character(1),
  just_mil_uniao_stm character(1),
  just_mil_est_1grau character(1),
  just_mil_est_tjm character(1),
  just_elei_1grau character(1),
  just_elei_2grau character(1),
  just_elei_tse character(1),
  tipo_item character(1) NOT NULL,
  usu_inclusao character varying(30),
  dat_inclusao date,
  dsc_ip_usu_inclusao character varying(15),
  usu_alteracao character varying(30)
)
WITH (
  OIDS=FALSE
);
ALTER TABLE sgt_consulta.assuntos
  OWNER TO postgres;

  -- Table: sgt_consulta.classes

-- DROP TABLE sgt_consulta.classes;

CREATE TABLE sgt_consulta.classes
(
  cod_classe numeric(10,0) NOT NULL,
  natureza character varying(100),
  dispositivo_legal character varying(500),
  artigo character varying(500),
  sigla character varying(20) NOT NULL,
  sigla_antiga character varying(20),
  polo_ativo character varying(30) NOT NULL,
  polo_passivo character varying(30) NOT NULL,
  glossario text,
  numeracao_propria character(1) NOT NULL,
  just_es_1grau character(1),
  just_es_2grau character(1),
  just_es_juizado_es character(1),
  just_es_turmas character(1),
  just_es_1grau_mil character(1),
  just_es_2grau_mil character(1),
  just_es_juizado_es_fp character(1),
  just_tu_es_un character(1),
  just_fed_1grau character(1),
  just_fed_2grau character(1),
  just_fed_juizado_es character(1),
  just_fed_turmas character(1),
  just_fed_nacional character(1),
  just_fed_regional character(1),
  just_trab_1grau character(1),
  just_trab_2grau character(1),
  just_trab_tst character(1),
  just_trab_csjt character(1),
  stf character(1),
  stj character(1),
  cjf character(1),
  cnj character(1),
  just_mil_uniao_1grau character(1),
  just_mil_uniao_stm character(1),
  just_mil_est_1grau character(1),
  just_mil_est_tjm character(1),
  just_elei_1grau character(1),
  just_elei_2grau character(1),
  just_elei_tse character(1),
  tipo_item character(1) NOT NULL,
  usu_inclusao character varying(30),
  dat_inclusao date,
  dsc_ip_usu_inclusao character varying(15),
  usu_alteracao character varying(30)
)
WITH (
  OIDS=FALSE
);
ALTER TABLE sgt_consulta.classes
  OWNER TO postgres;

  
  -- Table: sgt_consulta.complemento

-- DROP TABLE sgt_consulta.complemento;

CREATE TABLE sgt_consulta.complemento
(
  seq_complemento numeric(10,0) NOT NULL,
  seq_tipo_complemento numeric(10,0) NOT NULL,
  dsc_complemento character varying(255) NOT NULL,
  dsc_observacao text
)
WITH (
  OIDS=FALSE
);
ALTER TABLE sgt_consulta.complemento
  OWNER TO postgres;

-- Index: sgt_consulta.fk_complemento

-- DROP INDEX sgt_consulta.fk_complemento;

CREATE INDEX fk_complemento
  ON sgt_consulta.complemento
  USING btree
  (seq_tipo_complemento);

-- Index: sgt_consulta.primary_3

-- DROP INDEX sgt_consulta.primary_3;

CREATE UNIQUE INDEX primary_3
  ON sgt_consulta.complemento
  USING btree
  (seq_complemento);


  -- Table: sgt_consulta.complemento_movimento

-- DROP TABLE sgt_consulta.complemento_movimento;

CREATE TABLE sgt_consulta.complemento_movimento
(
  seq_compl_mov numeric(10,0) NOT NULL,
  seq_complemento numeric(10,0) NOT NULL,
  cod_movimento numeric(10,0) NOT NULL,
  data_inclusao date NOT NULL,
  usu_inclusao character varying(30)
)
WITH (
  OIDS=FALSE
);
ALTER TABLE sgt_consulta.complemento_movimento
  OWNER TO postgres;

-- Index: sgt_consulta.fk_complemento_movimento

-- DROP INDEX sgt_consulta.fk_complemento_movimento;

CREATE INDEX fk_complemento_movimento
  ON sgt_consulta.complemento_movimento
  USING btree
  (seq_complemento);

-- Index: sgt_consulta.primary_6

-- DROP INDEX sgt_consulta.primary_6;

CREATE UNIQUE INDEX primary_6
  ON sgt_consulta.complemento_movimento
  USING btree
  (seq_compl_mov);

-- Index: sgt_consulta.sfk2_complemento_movimento

-- DROP INDEX sgt_consulta.sfk2_complemento_movimento;

CREATE INDEX sfk2_complemento_movimento
  ON sgt_consulta.complemento_movimento
  USING btree
  (cod_movimento);


  -- Table: sgt_consulta.complemento_tabelado

-- DROP TABLE sgt_consulta.complemento_tabelado;

CREATE TABLE sgt_consulta.complemento_tabelado
(
  seq_compl_tabelado numeric(10,0) NOT NULL,
  seq_complemento numeric(10,0) NOT NULL,
  dsc_valor_tabelado character varying(250) NOT NULL
)
WITH (
  OIDS=FALSE
);
ALTER TABLE sgt_consulta.complemento_tabelado
  OWNER TO postgres;

-- Index: sgt_consulta.fk_complemento_tabelado

-- DROP INDEX sgt_consulta.fk_complemento_tabelado;

CREATE INDEX fk_complemento_tabelado
  ON sgt_consulta.complemento_tabelado
  USING btree
  (seq_complemento);

-- Index: sgt_consulta.primary_7

-- DROP INDEX sgt_consulta.primary_7;

CREATE UNIQUE INDEX primary_7
  ON sgt_consulta.complemento_tabelado
  USING btree
  (seq_compl_tabelado);

-- Table: sgt_consulta.documento_processual

-- DROP TABLE sgt_consulta.documento_processual;

CREATE TABLE sgt_consulta.documento_processual
(
cod_documento_processual numeric(10,0) NOT NULL,
txt_glossario text,
usu_inclusao varchar(30) NOT NULL,
dat_inclusao date NOT NULL,
dsc_ip_usu_inclusao varchar(60) NOT NULL,
usu_alteracao varchar(30) NOT NULL
)
WITH (
OIDS=FALSE
);
ALTER TABLE sgt_consulta.documento_processual
    OWNER TO postgres;

-- Table: sgt_consulta.itens

-- DROP TABLE sgt_consulta.itens;

CREATE TABLE sgt_consulta.itens
(
  cod_item numeric(10,0) NOT NULL,
  cod_item_pai numeric(10,0),
  tipo_item character(1) NOT NULL,
  nome character varying(255) NOT NULL,
  situacao character(1) NOT NULL DEFAULT 'A'::bpchar,
  dat_inclusao date,
  usu_inclusao character varying(30),
  dat_alteracao date,
  usu_alteracao character varying(30),
    dat_versao date,
    num_versao_lancado numeric(10,0),
    dat_inativacao date,
    dat_reativacao date,
    dat_inicio_vigencia date,
    dat_fim_vigencia date,
    tip_hierarquia_item character(1),
    dsc_caminho_completo character varying(1000)
)
WITH (
  OIDS=FALSE
);
ALTER TABLE sgt_consulta.itens
  OWNER TO postgres;

-- Index: sgt_consulta.cod_item

-- DROP INDEX sgt_consulta.cod_item;

CREATE INDEX cod_item
  ON sgt_consulta.itens
  USING btree
  (cod_item);

-- Index: sgt_consulta.cod_item_pai

-- DROP INDEX sgt_consulta.cod_item_pai;

CREATE INDEX cod_item_pai
  ON sgt_consulta.itens
  USING btree
  (cod_item_pai, tipo_item COLLATE pg_catalog."default");

-- Index: sgt_consulta.pk_itens

-- DROP INDEX sgt_consulta.pk_itens;

CREATE UNIQUE INDEX pk_itens
  ON sgt_consulta.itens
  USING btree
  (cod_item, tipo_item COLLATE pg_catalog."default");

  -- Table: sgt_consulta.movimentos

-- DROP TABLE sgt_consulta.movimentos;

CREATE TABLE sgt_consulta.movimentos
(
  cod_movimento numeric(10,0) NOT NULL,
  movimento character varying(250),
  visibilidade_externa character(1),
  monocratico character(1),
  colegiado character(1),
  presidente_vice character(1),
  flg_papel character(1),
  flg_eletronico character(1) DEFAULT 'N'::bpchar,
  dispositivo_legal character varying(250),
  artigo character varying(250),
  glossario text,
  just_es_1grau character(1) DEFAULT 'N'::bpchar,
  just_es_2grau character(1) DEFAULT 'N'::bpchar,
  just_es_juizado_es character(1) DEFAULT 'N'::bpchar,
  just_es_turmas character(1) DEFAULT 'N'::bpchar,
  just_es_1grau_mil character(1) DEFAULT 'N'::bpchar,
  just_es_2grau_mil character(1) DEFAULT 'N'::bpchar,
  just_es_juizado_es_fp character(1) DEFAULT 'N'::bpchar,
  just_tu_es_un character(1) DEFAULT 'N'::bpchar,
  just_fed_1grau character(1) DEFAULT 'N'::bpchar,
  just_fed_2grau character(1) DEFAULT 'N'::bpchar,
  just_fed_juizado_es character(1) DEFAULT 'N'::bpchar,
  just_fed_turmas character(1) DEFAULT 'N'::bpchar,
  just_fed_nacional character(1) DEFAULT 'N'::bpchar,
  just_fed_regional character(1) DEFAULT 'N'::bpchar,
  just_trab_1grau character(1) DEFAULT 'N'::bpchar,
  just_trab_2grau character(1) DEFAULT 'N'::bpchar,
  just_trab_tst character(1) DEFAULT 'N'::bpchar,
  just_trab_csjt character(1) DEFAULT 'N'::bpchar,
  stf character(1) DEFAULT 'N'::bpchar,
  stj character(1) DEFAULT 'N'::bpchar,
  cjf character(1) DEFAULT 'N'::bpchar,
  cnj character(1) DEFAULT 'N'::bpchar,
  just_mil_uniao_1grau character(1) DEFAULT 'N'::bpchar,
  just_mil_uniao_stm character(1) DEFAULT 'N'::bpchar,
  just_mil_est_1grau character(1) DEFAULT 'N'::bpchar,
  just_mil_est_tjm character(1) DEFAULT 'N'::bpchar,
  just_elei_1grau character(1) DEFAULT 'N'::bpchar,
  just_elei_2grau character(1) DEFAULT 'N'::bpchar,
  just_elei_tse character(1) DEFAULT 'N'::bpchar,
  tipo_item character(1) NOT NULL DEFAULT 'M'::bpchar,
  usu_inclusao character varying(30),
  dat_inclusao date,
  dsc_ip_usu_inclusao character varying(15),
  usu_alteracao character varying(30)
)
WITH (
  OIDS=FALSE
);
ALTER TABLE sgt_consulta.movimentos
  OWNER TO postgres;

-- Index: sgt_consulta.cod_movimento_1

-- DROP INDEX sgt_consulta.cod_movimento_1;

CREATE INDEX cod_movimento_1
  ON sgt_consulta.movimentos
  USING btree
  (cod_movimento, tipo_item COLLATE pg_catalog."default");

  -- Table: sgt_consulta.procedimento_complementos

-- DROP TABLE sgt_consulta.procedimento_complementos;

CREATE TABLE sgt_consulta.procedimento_complementos
(
  id numeric(10,0) NOT NULL,
  cod_movimento numeric(10,0) NOT NULL,
  seq_tipo_complemento numeric(10,0) NOT NULL,
  valor character varying(750) NOT NULL,
  dat_inclusao date,
  usu_inclusao character varying(90)
)
WITH (
  OIDS=FALSE
);
ALTER TABLE sgt_consulta.procedimento_complementos
  OWNER TO postgres;

-- Index: sgt_consulta.primary_2

-- DROP INDEX sgt_consulta.primary_2;

CREATE UNIQUE INDEX primary_2
  ON sgt_consulta.procedimento_complementos
  USING btree
  (id);

-- Index: sgt_consulta.seq_item

-- DROP INDEX sgt_consulta.seq_item;

CREATE INDEX seq_item
  ON sgt_consulta.procedimento_complementos
  USING btree
  (cod_movimento);

-- Index: sgt_consulta.seq_tipo_complemento

-- DROP INDEX sgt_consulta.seq_tipo_complemento;

CREATE INDEX seq_tipo_complemento
  ON sgt_consulta.procedimento_complementos
  USING btree
  (seq_tipo_complemento);


  -- Table: sgt_consulta.temp_item

-- DROP TABLE sgt_consulta.temp_item;

CREATE TABLE sgt_consulta.temp_item
(
  seq_temp_item numeric NOT NULL,
  seq_item numeric NOT NULL,
  seq_temp numeric NOT NULL,
  tipo_item character varying NOT NULL,
  temp_observacao text,
  seq_tipo_ramo_justica numeric,
  usu_inclusao character varying,
  dat_inclusao date
)
WITH (
  OIDS=FALSE
);
ALTER TABLE sgt_consulta.temp_item
  OWNER TO postgres;

  
  -- Table: sgt_consulta.temporariedade

-- DROP TABLE sgt_consulta.temporariedade;

CREATE TABLE sgt_consulta.temporariedade
(
  seq_temp numeric NOT NULL,
  temporariedade character varying NOT NULL,
  txt_temp character varying NOT NULL,
  tipo_justica character(1) NOT NULL,
  txt_tipo_justica character varying NOT NULL,
  ordem numeric NOT NULL,
  status character(1) NOT NULL
)
WITH (
  OIDS=FALSE
);
ALTER TABLE sgt_consulta.temporariedade
  OWNER TO postgres;

  -- Table: sgt_consulta.tipo_complemento

-- DROP TABLE sgt_consulta.tipo_complemento;

CREATE TABLE sgt_consulta.tipo_complemento
(
  seq_tipo_complemento numeric(10,0) NOT NULL,
  desc_tipo_complemento character varying(250) NOT NULL,
  dsc_observacao text
)
WITH (
  OIDS=FALSE
);
ALTER TABLE sgt_consulta.tipo_complemento
  OWNER TO postgres;

-- Index: sgt_consulta.primary_5

-- DROP INDEX sgt_consulta.primary_5;

CREATE UNIQUE INDEX primary_5
  ON sgt_consulta.tipo_complemento
  USING btree
  (seq_tipo_complemento);


  
  -- Table: sgt_consulta.tipo_ramo_justica

-- DROP TABLE sgt_consulta.tipo_ramo_justica;

CREATE TABLE sgt_consulta.tipo_ramo_justica
(
  seq_tipo_ramo_justica numeric(5,0) NOT NULL,
  dsc_ramo_justica character varying(255),
  nom_ramo_justica character varying(100),
  CONSTRAINT tipo_ramo_complemento PRIMARY KEY (seq_tipo_ramo_justica)
)
WITH (
  OIDS=FALSE
);
ALTER TABLE sgt_consulta.tipo_ramo_justica
  OWNER TO postgres;

CREATE TABLE sgt_consulta.objetivo_desenvolvimento_sustentavel
(
    cod_objetivo numeric NOT NULL,
    nom_objetivo character varying(200) NOT NULL,
    dsc_objetivo text,
    flg_ativo boolean NOT NULL DEFAULT TRUE,
    PRIMARY KEY (cod_objetivo)
)
    WITH (
        OIDS=FALSE
        );
ALTER TABLE sgt_consulta.objetivo_desenvolvimento_sustentavel
    OWNER TO postgres;


CREATE TABLE sgt_consulta.assunto_ods
(
    seq_assunto_ods numeric NOT NULL,
    cod_objetivo numeric NOT NULL,
    cod_assunto numeric NOT NULL,
    PRIMARY KEY (seq_assunto_ods)
)
    WITH (
        OIDS=FALSE
        );
ALTER TABLE sgt_consulta.assunto_ods
    OWNER TO postgres;
  
  
  
