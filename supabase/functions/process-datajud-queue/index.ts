import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabase = createClient(
 Deno.env.get("SUPABASE_URL")!,
 Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

serve(async () => {

 const { data: fila } = await supabase
   .from("monitoramento_queue")
   .select("*")
   .eq("status","pendente")
   .limit(10)

 for(const item of fila ?? []){

   try{

     const numero = item.payload.numero_cnj

     await fetch(
       "https://sspvizogbcyigquqycsz.supabase.co/functions/v1/datajud-import-processo",
       {
         method:"POST",
         headers:{
           "Content-Type":"application/json"
         },
         body:JSON.stringify({
           numeroProcesso:numero
         })
       }
     )

     await supabase
       .from("monitoramento_queue")
       .update({
         status:"processado",
         executado_em:new Date()
       })
       .eq("id",item.id)

   }
   catch(err){

     await supabase
       .from("monitoramento_queue")
       .update({
         status:"erro",
         ultimo_erro:String(err)
       })
       .eq("id",item.id)

   }

 }

 return new Response("ok")

})