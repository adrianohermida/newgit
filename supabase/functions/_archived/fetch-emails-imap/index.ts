/**
 * Edge Function: fetch-emails-imap (V12.0 - ULTRA-RESILIENCE MASTER)
 * SOLUÇÃO PARA: net::ERR_FAILED e BLOQUEIO DE CORS PRE-FLIGHT
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Imap from "npm:imap"
import { simpleParser } from "npm:mailparser"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

serve(async (req) => {
  // 1. TRATAMENTO AGRESSIVO DE CORS (204 No Content para Pre-flight)
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 204, 
      headers: corsHeaders 
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const imap = new Imap({
      user: 'contato@hermidamaia.adv.br',
      password: 'oshassoijtdahgnh',
      host: 'imap.yandex.com',
      port: 993,
      tls: true,
      connTimeout: 10000,
      authTimeout: 5000,
      tlsOptions: { rejectUnauthorized: false }
    });

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        imap.destroy();
        resolve(new Response(JSON.stringify({ error: "Yandex Timeout" }), { 
          status: 504, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }));
      }, 25000);

      imap.once('ready', () => {
        imap.openBox('INBOX', false, (err) => {
          if (err) {
            clearTimeout(timer); imap.end();
            return resolve(new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders }));
          }

          imap.search(['UNSEEN'], (err, uids) => {
            if (err || !uids?.length) {
              clearTimeout(timer); imap.end();
              return resolve(new Response(JSON.stringify({ success: true, count: 0 }), { headers: corsHeaders }));
            }

            const f = imap.fetch(uids, { bodies: '', markSeen: true });
            f.on('message', (msg) => {
              msg.on('body', async (stream) => {
                const parsed = await simpleParser(stream);
                const match = (parsed.subject || "").match(/\[Ticket #([a-f0-9-]+)\]/i);
                if (match) {
                  const tid = match[1];
                  const { data: lead } = await supabase.from('leads').select('*').eq('id', tid).maybeSingle();
                  if (lead) {
                    const newMsg = { role: 'user', text: parsed.text || "", time: new Date().toLocaleString('pt-BR'), senderName: parsed.from?.text, via: 'yandex-v12' };
                    const updated = [...(lead.data?.messages || []), newMsg];
                    await supabase.from('leads').update({ data: { ...lead.data, messages: updated }, status: 'Respondido pelo Cliente', updated_at: new Date().toISOString() }).eq('id', tid);
                  }
                }
              });
            });

            f.once('end', () => {
              clearTimeout(timer); imap.end();
              resolve(new Response(JSON.stringify({ success: true, processed: uids.length }), { headers: corsHeaders }));
            });
          });
        });
      });

      imap.once('error', (err) => {
        clearTimeout(timer);
        resolve(new Response(JSON.stringify({ error: "IMAP Fail", details: err.message }), { status: 500, headers: corsHeaders }));
      });

      imap.connect();
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: "Global Error", msg: err.message }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
})