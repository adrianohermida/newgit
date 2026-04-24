async function logLGPDTratamentoMovimento(
  supabase: any,
  params: {
    tenant_id?: string | null
    titular_id?: string | null
    processo_id: string
    movimento_codigo: number
    movimento_descricao: string
  }
) {
  await supabase
    .schema("lgpd")
    .from("logs_tratamento")
    .insert({
      tenant_id: params.tenant_id ?? null,
      titular_id: params.titular_id ?? null,

      tipo_dado: "DADOS PROCESSUAIS",
      operacao: "SINCRONIZACAO_MOVIMENTO_PROCESSUAL",

      finalidade: "ACOMPANHAMENTO PROCESSUAL E ATUALIZACAO DE ANDAMENTOS",
      base_legal: "ART. 7º, II e V, LGPD – OBRIGAÇÃO LEGAL E EXECUÇÃO DE CONTRATO",

      origem: "CNJ – DATAJUD",
      usuario_id: null,

      ip_origem: null,
      user_agent: "SUPABASE_EDGE_FUNCTION:datajud-sync-processo",

      data_evento: new Date().toISOString()
    })
}
