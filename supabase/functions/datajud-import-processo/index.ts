import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { db: { schema: "judiciario" } }
)

function limparCNJ(numero: string) {
  return numero.replace(/\D/g, "")
}

function simpleHash(str: string) {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0
  }
  return String(Math.abs(h))
}

serve(async (req) => {

  try {

    const body = await req.json()

    if (!body.numeroProcesso) {
      return new Response(JSON.stringify({
        erro: "numeroProcesso é obrigatório"
      }), { status: 400 })
    }

    const numero = limparCNJ(body.numeroProcesso)

    console.log("CNJ recebido:", numero)

    // -------------------------
    // CHAMAR DATAJUD-SEARCH
    // -------------------------
    const response = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/datajud-search`,
      {
        method: "POST",
        headers: {
          "Authorization": req.headers.get("Authorization") ?? "",
          "apikey": req.headers.get("apikey") ?? "",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ numeroProcesso: numero })
      }
    )

    const data = await response.json()

    const hits = data?.resultado?.hits?.hits

    if (!hits || hits.length === 0) {
      return new Response(JSON.stringify({
        erro: "Processo não encontrado no DATAJUD",
        numeroProcesso: numero
      }), { status: 404 })
    }

    let processoId: string | null = null

    // -------------------------
    // PROCESSAR TODOS OS HITS
    // -------------------------
    for (const hit of hits) {

      const proc = hit._source

      const assuntos = proc.assuntos ?? []

      const poloAtivo = proc.partes
        ?.filter(p => p.polo === "ATIVO" || p.polo === "AT")
        .map(p => p.nome)
        .join(", ")

      const poloPassivo = proc.partes
        ?.filter(p => p.polo === "PASSIVO" || p.polo === "PA")
        .map(p => p.nome)
        .join(", ")

      // -------------------------
      // UPSERT PROCESSO (1x)
      // -------------------------
      if (!processoId) {

        const { data: processo } = await supabase
          .from("processos")
          .upsert({

            numero_cnj: numero,
            numero_processo: numero,

            titulo: proc.classe?.nome,
            classe: proc.classe?.nome,

            assunto: assuntos.map(a => a.nome).join(", "),
            assunto_principal: assuntos?.[0]?.nome,

            tribunal: typeof proc.tribunal === "string"
              ? proc.tribunal
              : proc.tribunal?.sigla,

            ramo: (typeof proc.tribunal === "string"
              ? proc.tribunal
              : proc.tribunal?.sigla)?.substring(0, 2),

            orgao_julgador: proc.orgaoJulgador?.nome,
            sistema: proc.sistema?.nome,

            grau: proc.grau === "G1" ? 1 :
              proc.grau === "G2" ? 2 :
                proc.grau === "JE" ? 1 : null,

            instancia: proc.grau,

            segredo_justica: proc.nivelSigilo > 0,

            polo_ativo: poloAtivo,
            polo_passivo: poloPassivo,

            data_ajuizamento: proc.dataAjuizamento,
            data_ultima_movimentacao: proc.movimentos?.[0]?.dataHora,

            data_ultima_atualizacao_externa: proc.dataHoraUltimaAtualizacao,

            status: "ativo",
            status_atual_processo: "monitorado",

            observacoes: "Importado via DATAJUD",
            updated_at: new Date().toISOString()

          }, {
            onConflict: "numero_cnj"
          })
          .select()
          .single()

        processoId = processo.id
      }

      // -------------------------
      // MOVIMENTOS
      // -------------------------
      for (const mov of proc.movimentos ?? []) {

        const complemento = (mov.complementosTabelados ?? [])
          .map((c: any) => c.descricao)
          .join(" ")

        const conteudo = `[${mov.codigo}] ${mov.nome} ${complemento}`

        const hash = simpleHash(
          `${processoId}${mov.dataHora}${conteudo}`
        )

        // movimentacoes
        await supabase.from("movimentacoes").upsert({
          processo_id: processoId,
          data_movimentacao: mov.dataHora,
          conteudo,
          fonte: "DATAJUD",
          hash_integridade: hash
        }, {
          onConflict: "hash_integridade",
          ignoreDuplicates: true
        })

        // movimentos estruturados
        await supabase.from("movimentos").upsert({
          processo_id: processoId,
          codigo: mov.codigo,
          descricao: mov.nome,
          data_movimento: mov.dataHora
        }, {
          onConflict: "processo_id,codigo,data_movimento",
          ignoreDuplicates: true
        })
      }

      // -------------------------
      // PARTES
      // -------------------------
      for (const parte of proc.partes ?? []) {

        const nome = parte.nome?.trim()
        if (!nome) continue

        const polo =
          parte.polo === "AT" ? "ativo" :
            parte.polo === "PA" ? "passivo" :
              parte.polo

        await supabase.from("partes").upsert({
          processo_id: processoId,
          nome,
          tipo: parte.tipo,
          polo
        }, {
          onConflict: "processo_id,nome,polo",
          ignoreDuplicates: true
        })
      }
    }

    // -------------------------
    // STATUS
    // -------------------------
    await supabase.from("datajud_sync_status").upsert({
      numero_processo: numero,
      ultima_execucao: new Date().toISOString(),
      status: "sincronizado"
    }, {
      onConflict: "numero_processo"
    })

    return new Response(JSON.stringify({
      sucesso: true,
      processoId
    }))

  } catch (err) {

    console.error("ERRO:", err)

    return new Response(JSON.stringify({
      erro: err.message
    }), { status: 500 })
  }
console.log("RETORNO DATAJUD:", JSON.stringify(data))
})