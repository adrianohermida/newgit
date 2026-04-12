import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface Advogado { nome:string; oab:string; oab_uf:string; cpf?:string; }
export interface ParteCanonica {
  nome:string; polo:'ativo'|'passivo'; tipo_pessoa:'FISICA'|'JURIDICA'|'DESCONHECIDA';
  documento?:string; tipo?:string; advogados:Advogado[]; fonte:'datajud'|'publicacao';
}

export function parsePartiesFromText(texto:string): ParteCanonica[] {
  if (!texto) return [];
  const advBlocoMatch = texto.match(/Advogado\(s\):\s*([^\n]+(?:\n(?!Processo)[^\n]+)*)/);
  const advogados:Advogado[] = [];
  if (advBlocoMatch) {
    for (const entry of advBlocoMatch[1].split(',').map(s=>s.trim()).filter(Boolean)) {
      const m = entry.match(/^(.+?)\s*[-–]\s*OAB\s*(?:\/)?([A-Z]{2})[-\s](\d+)/i);
      if (m) advogados.push({nome:m[1].trim(),oab:m[3].trim(),oab_uf:m[2].trim().toUpperCase()});
      else { const n=entry.replace(/\s*-\s*OAB.*$/i,'').trim(); if(n) advogados.push({nome:n,oab:'',oab_uf:''}); }
    }
  }
  const partesMatch = texto.match(/Parte\(s\):\s*([^\n]+(?:\n(?!Advogado|Processo)[^\n]+)*)/);
  if (!partesMatch) return [];
  const partes:ParteCanonica[] = [];
  const parteRegex = /([A-ZÁÉÍÓÚÀÂÊÔÃÕÇŒ][A-ZÁÉÍÓÚÀÂÊÔÃÕÇŒa-záéíóúàâêôãõç0-9\s\.\-\']+?)\s*\(([AP])\)/g;
  let m;
  while ((m=parteRegex.exec(partesMatch[1]))!==null) {
    const nome=m[1].trim(); if (!nome||nome.length<3) continue;
    const siglasJuridicas = /\b(LTDA|S\.A\.|S\.A|ME|EPP|EIRELI|SA|S\/A|BANCO|FUND|ASSOC|SIND|CORP|GRUPO|EMPRESA|CONSTRUTORA|COMERCIAL|SERV[IÇ]|INCORPORA)/i;
    partes.push({
      nome, polo:m[2]==='A'?'ativo':'passivo',
      tipo_pessoa: siglasJuridicas.test(nome)?'JURIDICA':'FISICA',
      advogados, fonte:'publicacao',
    });
  }
  return partes;
}

export function partesFromDatajud(partes:Record<string,unknown>[]): ParteCanonica[] {
  return partes.map(p => {
    const polo=String(p.polo??'').toUpperCase();
    const doc=String(p.cpf??p.cnpj??p.documento??'').replace(/[^\d]/g,'');
    const tipo_pessoa:ParteCanonica['tipo_pessoa']=p.cnpj||(p.tipo_pessoa==='JURIDICA')?'JURIDICA':p.cpf?'FISICA':'DESCONHECIDA';
    const advs:Advogado[]=((p.advogados as Record<string,unknown>[]??[])).map(a=>({
      nome:String(a.nome??''),
      oab:String((a.oabs as Record<string,unknown>[])?.[0]?.numero??a.oab??''),
      oab_uf:String((a.oabs as Record<string,unknown>[])?.[0]?.uf??a.oab_uf??''),
      cpf:a.cpf?String(a.cpf).replace(/[^\d]/g,''):undefined,
    }));
    return {nome:String(p.nome??'').trim(),polo:polo==='AT'?'ativo':'passivo',tipo_pessoa,
            documento:doc||undefined,tipo:String(p.tipo??''),advogados:advs,fonte:'datajud'} as ParteCanonica;
  }).filter(p=>p.nome.length>0);
}

export async function persistirPartes(
  db:SupabaseClient, processoId:string, partes:ParteCanonica[], logFn:(msg:string)=>void=console.log,
): Promise<{inseridas:number;ignoradas:number}> {
  let inseridas=0,ignoradas=0;
  for (const parte of partes) {
    if (!parte.nome){ignoradas++;continue;}
    const {error}=await db.from('partes').upsert(
      {processo_id:processoId,nome:parte.nome,polo:parte.polo,tipo:parte.tipo??null,
       tipo_pessoa:parte.tipo_pessoa,documento:parte.documento??null,advogados:parte.advogados,fonte:parte.fonte},
      {onConflict:'processo_id,nome,polo',ignoreDuplicates:false},
    );
    if (error){logFn(`[partes] upsert falhou: ${error.message}`);ignoradas++;}else inseridas++;
  }
  return {inseridas,ignoradas};
}

export async function invocarExtractor(
  supabaseUrl:string, serviceKey:string, processoId:string, numeroCnj:string,
  polo_ativo:ParteCanonica[], polo_passivo:ParteCanonica[],
  origem:'datajud'|'publicacao', workspaceId?:string,
): Promise<Record<string,unknown>> {
  const toFmt=(p:ParteCanonica)=>({nome:p.nome,tipo_pessoa:p.tipo_pessoa,documento:p.documento,
    tipo_normalizado:p.tipo,advogados:p.advogados.map(a=>({...a,oabs:a.oab?[{numero:a.oab,uf:a.oab_uf}]:[]}))
  });
  try {
    const r=await fetch(`${supabaseUrl}/functions/v1/extractPartiesFromProcess`,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${serviceKey}`},
      body:JSON.stringify({case_id:processoId,workspace_id:workspaceId??'default',
        numero_cnj:numeroCnj,origem,polo_ativo:polo_ativo.map(toFmt),polo_passivo:polo_passivo.map(toFmt)}),
    });
    if (!r.ok){const t=await r.text();return{ok:false,erro:`HTTP ${r.status}: ${t}`};}
    return {ok:true,...await r.json()};
  } catch(e){return{ok:false,erro:String(e)};}
}
