// Copia o manual_slash_commands.md para a pasta public durante o build
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'manual_slash_commands.md');
const dest = path.join(__dirname, '..', 'public', 'manual_slash_commands.md');

if (fs.existsSync(src)) {
  fs.copyFileSync(src, dest);
  console.log('manual_slash_commands.md copiado para public/.');
} else {
  console.warn('manual_slash_commands.md não encontrado.');
}
