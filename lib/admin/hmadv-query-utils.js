export function buildProcessSearchPath({ cleanQuery, cnj, safeLimit }) {
  if (cnj) {
    const likePattern = encodeURIComponent(`*${cnj}*`);
    return `processos?select=id,numero_cnj,titulo,account_id_freshsales,status_atual_processo,polo_ativo,polo_passivo&numero_cnj=ilike.${likePattern}&order=updated_at.desc.nullslast&limit=${safeLimit}`;
  }
  const pattern = encodeURIComponent(`*${cleanQuery}*`);
  return `processos?select=id,numero_cnj,titulo,account_id_freshsales,status_atual_processo,polo_ativo,polo_passivo&or=(titulo.ilike.${pattern},polo_ativo.ilike.${pattern},polo_passivo.ilike.${pattern},numero_cnj.ilike.${pattern})&order=updated_at.desc.nullslast&limit=${safeLimit}`;
}

export function buildRelationListPath({ offset, safePageSize, cleanQuery }) {
  const basePath = `processo_relacoes?select=id,processo_pai_id,processo_filho_id,numero_cnj_pai,numero_cnj_filho,tipo_relacao,status,observacoes,created_at,updated_at&order=updated_at.desc.nullslast&offset=${offset}&limit=${safePageSize}`;
  if (!cleanQuery) return basePath;
  const pattern = encodeURIComponent(`*${cleanQuery}*`);
  return `${basePath}&or=(numero_cnj_pai.ilike.${pattern},numero_cnj_filho.ilike.${pattern},tipo_relacao.ilike.${pattern},status.ilike.${pattern},observacoes.ilike.${pattern})`;
}

export function buildProcessNumberLookupPath(digits) {
  return `processos?numero_cnj=eq.${digits}&select=id,numero_cnj,titulo,account_id_freshsales&limit=1`;
}

export function buildProcessTitleLookupPath(value) {
  const pattern = encodeURIComponent(`*${value}*`);
  return `processos?titulo=ilike.${pattern}&select=id,numero_cnj,titulo,account_id_freshsales&limit=1`;
}
