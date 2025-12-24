const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'server.js');
const src = fs.readFileSync(file, 'utf8');
if (!/languageMap\s*=\s*\{[\s\S]*'es-ES'[\s\S]*'en-US'[\s\S]*'pt-BR'[\s\S]*\}/.test(src)) {
  throw new Error('languageMap não contém códigos regionais esperados');
}
if (!/Adicione o seguinte texto na parte inferior|RENDERIZE APENAS O TEXTO DA HEADLINE/.test(src)) {
  throw new Error('Prompt de overlay não contém instruções reforçadas');
}
console.log('OK: languageMap e prompt overlay validados');
