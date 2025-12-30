const { spawn } = require('child_process');
const path = require('path');

// Mudar para o diretório Backend
process.chdir(path.join(__dirname, 'Backend'));

// Executar server.js
const server = spawn('node', ['server.js'], {
  stdio: 'inherit',
  shell: true
});

server.on('error', (err) => {
  console.error('Erro ao iniciar servidor:', err);
  process.exit(1);
});

server.on('exit', (code) => {
  process.exit(code);
});

