// Integração e sincronização de memória Dotobot com Obsidian Vault
// Salva cada memória em arquivo markdown estruturado

import fs from 'fs';
import path from 'path';

export async function saveMemoryToObsidian({
  vaultDir,
  sessionId,
  timestamp,
  query,
  response,
  metadata = {}
}) {
  if (!vaultDir || !sessionId || !timestamp) return;
  const dir = path.join(vaultDir, 'dotobot_memory', sessionId);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${timestamp}.md`);
  const content = [
    '# Query',
    query || '',
    '',
    '# Response',
    response || '',
    '',
    '# Metadata',
    '```json',
    JSON.stringify(metadata, null, 2),
    '```',
    ''
  ].join('\n');
  fs.writeFileSync(file, content, 'utf8');
  return file;
}

// TODO: Implementar leitura/ingestão de arquivos Obsidian para Supabase
