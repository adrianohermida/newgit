import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/* =============================
   PARSE DO CNJ1
============================= */

function parseCNJ(numero:string){

  const clean = numero.replace(/\D/g,"");

  if(clean.length !== 20){
    throw new Error("Número CNJ inválido");
  }

  return {
    numeroLimpo: clean,
    ramo: clean.substring(13,14),
    tribunal: clean.substring(14,16)
  }

}

/* =============================
   RESOLVER ENDPOINT DATAJUD
============================= */

function resolveEndpoint(ramo:string, tribunal:string){

  const base = "https://api-publica.datajud.cnj.jus.br";

  /* Justiça Estadual */

  if(ramo === "8"){

    const map:any = {

      "01":"tjac","02":"tjal","03":"tjam","04":"tjap","05":"tjba",
      "06":"tjce","07":"tjdft","08":"tjes","09":"tjgo","10":"tjma",
      "11":"tjmg","12":"tjms","13":"tjmt","14":"tjpa","15":"tjpb",
      "16":"tjpe","17":"tjpi","18":"tjpr","19":"tjrj","20":"tjrn",
      "21":"tjro","22":"tjrr","23":"tjrs","24":"tjsc","25":"tjse",
      "26":"tjsp","27":"tjto"

    };

    const sigla = map[tribunal];

    if(!sigla){
      throw new Error("Tribunal estadual não mapeado");
    }

    return `${base}/api_publica_${sigla}/_search`;
  }

  /* Justiça Federal */

  if(ramo === "4"){
    return `${base}/api_publica_trf${parseInt(tribunal)}/_search`;
  }

  /* Justiça do Trabalho */

  if(ramo === "3"){
    return `${base}/api_publica_trt${parseInt(tribunal)}/_search`;
  }

  /* Justiça Eleitoral */

  if(ramo === "5"){

    const ufMap:any = {

      "01":"ac","02":"al","03":"am","04":"ap","05":"ba","06":"ce",
      "07":"dft","08":"es","09":"go","10":"ma","11":"mg","12":"ms",
      "13":"mt","14":"pa","15":"pb","16":"pe","17":"pi","18":"pr",
      "19":"rj","20":"rn","21":"ro","22":"rr","23":"rs","24":"sc",
      "25":"se","26":"sp","27":"to"

    };

    const uf = ufMap[tribunal];

    if(!uf){
      throw new Error("TRE não mapeado");
    }

    return `${base}/api_publica_tre-${uf}/_search`;
  }

  /* Justiça Militar */

  if(ramo === "6"){

    const map:any = {

      "13":"tjmmg",
      "23":"tjmrs",
      "26":"tjmsp"

    };

    const sigla = map[tribunal];

    if(!sigla){
      throw new Error("Justiça militar não mapeada");
    }

    return `${base}/api_publica_${sigla}/_search`;
  }

  /* Tribunais superiores */

  if(ramo === "1") return `${base}/api_publica_stf/_search`;
  if(ramo === "2") return `${base}/api_publica_stj/_search`;

  throw new Error("Ramo CNJ não suportado");

}

/* =============================
   EDGE FUNCTION
============================= */

serve(async (req) => {

  try{

    const body = await req.json();

    const numeroProcesso = body.numeroProcesso;

    if(!numeroProcesso){
      throw new Error("numeroProcesso não informado");
    }

    const parsed = parseCNJ(numeroProcesso);

    const endpoint = resolveEndpoint(parsed.ramo, parsed.tribunal);

    const apiKey = Deno.env.get("DATAJUD_API_KEY");

    if(!apiKey){
      throw new Error("DATAJUD_API_KEY não configurada");
    }

    const payload = {
      query:{
        match:{
          numeroProcesso: parsed.numeroLimpo
        }
      }
    };

    const response = await fetch(endpoint,{
      method:"POST",
      headers:{
        "Authorization":`ApiKey ${apiKey}`,
        "Content-Type":"application/json"
      },
      body:JSON.stringify(payload)
    });

    const data = await response.json();

    return new Response(JSON.stringify({
      endpoint,
      payload,
      resultado:data
    }),{
      headers:{ "Content-Type":"application/json" },
      status:200
    });

  }
  catch(err){

    return new Response(JSON.stringify({
      erro:String(err)
    }),{
      headers:{ "Content-Type":"application/json" },
      status:500
    });

  }

});