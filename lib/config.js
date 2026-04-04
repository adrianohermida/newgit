// Centralização de variáveis de ambiente e endpoints para todo o projeto
// Utilize este arquivo para importar/configurar variáveis em workers, funções e libs JS

export const config = {
  // --- SUPABASE ---
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "",

  // --- DOTOBOT / AI ---
  DOTOBOT_SUPABASE_EMBED_SECRET: process.env.DOTOBOT_SUPABASE_EMBED_SECRET || "",
  DOTOBOT_SUPABASE_EMBED_FUNCTION: process.env.DOTOBOT_SUPABASE_EMBED_FUNCTION || "dotobot-embed",
  DOTOBOT_SUPABASE_EMBEDDING_MODEL: process.env.DOTOBOT_SUPABASE_EMBEDDING_MODEL || "gte-small",
  DOTOBOT_SUPABASE_MEMORY_TABLE: process.env.DOTOBOT_SUPABASE_MEMORY_TABLE || "dotobot_memory_embeddings",

  // --- OUTROS EXEMPLOS ---
  RESEND_API_KEY: process.env.RESEND_API_KEY || "",
  FRESHCHAT_API_KEY: process.env.FRESHCHAT_API_KEY || "",
  // ...adicione outros conforme necessário
};
