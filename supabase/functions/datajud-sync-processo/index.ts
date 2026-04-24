import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { db: { schema: 'judiciario' } }
);

// -----------------------------
// HASH DETERMINÍSTICO
// -----------------------------
function simpleHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  }
  return String(Math.abs(h));
}

Deno.serve(async (req: Request) => {
  try {
    const body = await req.json();

    const numeroProcesso = String(body.numero_processo ?? '').trim();
    const processoId = String(body.processo_id ?? '').trim();

    if (!numeroProcesso || !processoId) {
      return new Response(JSON.stringify({
        error: 'numero_processo e processo_id são obrigatórios',
        recebido: body
      }), { status: 400 });
    }

    console.log("SYNC INICIADO:", numeroProcesso);

    // -----------------------------
    // BUSCAR PROCESSO LOCAL
    // -----------------------------
    const { data: processo, error } = await supabase
      .from('processos')
      .select('*')
      .eq('id', processoId)
      .single();

    if (error || !processo) {
      throw new Error('Processo não encontrado no banco');
    }

    // -----------------------------
    // CHAMAR DATAJUD-SEARCH
    // -----------------------------
    const response = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/datajud-search`,
      {
        method: "POST",
        headers: {
          "Authorization": req.headers.get("Authorization") ?? "",
          "apikey": req.headers.get("apikey") ?? "",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          numeroProcesso
        })
      }
    );

    const data = await response.json();

    if (!data?.resultado?.hits?.hits) {
      throw new Error("Resposta inválida do datajud-search");
    }

    const hits = data.resultado.hits.hits;

    if (!hits.length) {
      return new Response(JSON.stringify({
        error: "Processo não encontrado no DataJud"
      }), { status: 404 });
    }

    let processoAtualizado = false;
    let movimentosInseridos = 0;

    // -----------------------------
    // PROCESSAR TODOS OS HITS
    // -----------------------------
    for (const hit of hits) {

      const proc = hit._source;

      // -------------------------
      // ATUALIZA PROCESSO (1x)
      // -------------------------
      if (!processoAtualizado) {

        const updateData: any = {
          updated_at: new Date().toISOString(),
          data_ultima_atualizacao_externa: proc.dataHoraUltimaAtualizacao
        };

        if (proc.classe?.nome) updateData.classe = proc.classe.nome;
        if (proc.orgaoJulgador?.nome) updateData.orgao_julgador = proc.orgaoJulgador.nome;
        if (proc.dataAjuizamento) updateData.data_ajuizamento = proc.dataAjuizamento;
        if (proc.movimentos?.[0]?.dataHora) {
          updateData.data_ultima_movimentacao = proc.movimentos[0].dataHora;
        }

        if (Array.isArray(proc.assuntos)) {
          updateData.assunto = proc.assuntos.map((a: any) => a.nome).join('; ');
          updateData.assunto_principal = proc.assuntos[0]?.nome;
        }

        await supabase.from('processos')
          .update(updateData)
          .eq('id', processoId);

        processoAtualizado = true;
      }

      // -------------------------
      // PARTES
      // -------------------------
      if (Array.isArray(proc.partes)) {

        for (const parte of proc.partes) {

          const nome = parte.nome?.trim();
          if (!nome) continue;

          const polo =
            parte.polo === 'ATIVO' || parte.polo === 'AT' ? 'ativo' :
            parte.polo === 'PASSIVO' || parte.polo === 'PA' ? 'passivo' :
            parte.polo;

          await supabase.from('partes').upsert({
            processo_id: processoId,
            nome,
            tipo: parte.tipo ?? '',
            polo,
            documento: parte.cpf ?? parte.cnpj ?? '',
            tenant_id: processo.tenant_id
          }, {
            onConflict: 'processo_id,nome,polo',
            ignoreDuplicates: true
          });
        }
      }

      // -------------------------
      // MOVIMENTOS
      // -------------------------
      if (Array.isArray(proc.movimentos)) {

        for (const mov of proc.movimentos) {

          const complemento = (mov.complementosTabelados ?? [])
            .map((c: any) => c.descricao)
            .join(' ');

          const conteudo = `[${mov.codigo}] ${mov.nome} ${complemento}`;

          const hash = simpleHash(
            `${processoId}${mov.dataHora}${conteudo}`
          );

          // movimentações (texto)
          const { error: movErr } = await supabase
            .from('movimentacoes')
            .upsert({
              processo_id: processoId,
              data_movimentacao: mov.dataHora,
              conteudo,
              fonte: 'DATAJUD',
              hash_integridade: hash
            }, {
              onConflict: 'hash_integridade',
              ignoreDuplicates: true
            });

          if (!movErr) movimentosInseridos++;

          // movimentos estruturados
          await supabase
            .from('movimentos')
            .upsert({
              processo_id: processoId,
              tenant_id: processo.tenant_id,
              codigo: Number(mov.codigo ?? 0),
              descricao: mov.nome,
              data_movimento: mov.dataHora
            }, {
              onConflict: 'processo_id,codigo,data_movimento',
              ignoreDuplicates: true
            });
        }
      }
    }

    // -----------------------------
    // STATUS SYNC
    // -----------------------------
    await supabase.from('datajud_sync_status').upsert({
      numero_processo: numeroProcesso,
      status: 'sincronizado',
      ultima_execucao: new Date().toISOString(),
      erro: null,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'numero_processo'
    });

    return new Response(JSON.stringify({
      sucesso: true,
      movimentosInseridos,
      processoAtualizado
    }));

  } catch (err) {

    const msg = err instanceof Error ? err.message : String(err);

    console.error("ERRO SYNC:", msg);

    return new Response(JSON.stringify({
      error: msg
    }), { status: 500 });
  }
});