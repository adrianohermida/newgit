export type DataJudAdapterInput = {
  numeroProcesso: string;
  tribunal?: string | null;
  grau?: string | number | null;
  sistema?: string | null;
  payload: unknown;
};

export type CanonicalMovimento = {
  codigo?: number | null;
  descricao?: string | null;
  data_movimento?: string | null;
  complemento?: string | null;
  raw?: unknown;
};

export type CanonicalParte = {
  nome?: string | null;
  tipo?: string | null;
  polo?: string | null;
  raw?: unknown;
};

export type CanonicalProcesso = {
  numero_processo?: string | null;
  numero_cnj?: string | null;
  tribunal?: string | null;
  grau?: string | null;
  sistema?: string | null;
  area?: string | null;
  classe_codigo?: number | null;
  classe_nome?: string | null;
  assunto_principal_codigo?: number | null;
  assunto_principal_nome?: string | null;
  assuntos?: Array<{ codigo?: number | null; nome?: string | null }>;
  orgao_julgador_codigo?: number | null;
  orgao_julgador_nome?: string | null;
  data_ajuizamento?: string | null;
  data_distribuicao?: string | null;
  data_ultima_movimentacao?: string | null;
  valor_causa?: number | null;
  formato?: string | null;
  segredo_justica?: boolean | null;
  arquivado?: boolean | null;
  partes?: CanonicalParte[];
  movimentos?: CanonicalMovimento[];
  raw_origem: unknown;
  parser_tribunal_schema?: string | null;
  parser_grau?: string | null;
  parser_sistema?: string | null;
};

export type DataJudAdapter = {
  key: string;
  match: (meta: {
    tribunal?: string | null;
    grau?: string | number | null;
    sistema?: string | null;
    payload: unknown;
  }) => boolean;
  parse: (input: DataJudAdapterInput) => CanonicalProcesso;
};
