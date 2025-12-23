# La Casa Dark Core - PWA (Progressive Web App)

## 📱 Sobre o PWA

A aplicação La Casa Dark Core agora é uma Progressive Web App (PWA) instalável! Isso significa que os usuários podem instalar a aplicação em seus dispositivos (desktop, tablet, mobile) e usá-la como um aplicativo nativo.

## ✨ Funcionalidades PWA

- ✅ **Instalável**: Os usuários podem instalar a aplicação em seus dispositivos
- ✅ **Offline**: Funcionalidade básica funciona mesmo sem conexão à internet
- ✅ **Cache Inteligente**: Arquivos estáticos são cacheados para melhor performance
- ✅ **Ícones Personalizados**: Ícones em diferentes tamanhos para todos os dispositivos
- ✅ **Tema Escuro**: Interface moderna com tema dark e design futurista

## 🚀 Como Instalar

### No Desktop (Chrome/Edge):
1. Acesse a aplicação no navegador
2. Clique no ícone de instalação na barra de endereços (ou menu)
3. Clique em "Instalar" quando solicitado

### No Mobile (Android):
1. Acesse a aplicação no Chrome
2. Toque no menu (3 pontos)
3. Selecione "Adicionar à tela inicial" ou "Instalar app"

### No iOS (Safari):
1. Acesse a aplicação no Safari
2. Toque no botão de compartilhar
3. Selecione "Adicionar à Tela de Início"

## 📁 Arquivos PWA

- `manifest.json` - Configurações do PWA (nome, ícones, tema, etc.)
- `sw.js` - Service Worker para cache e funcionalidade offline
- `icons/` - Diretório com ícones em diferentes tamanhos (72x72 até 512x512)

## 🔧 Desenvolvimento

### Gerar Ícones Novamente

Se você precisar regenerar os ícones PWA:

```bash
cd Backend
node generate-icons.js
```

### Testar PWA Localmente

1. Inicie o servidor:
   ```bash
   cd Backend
   node server.js
   ```

2. Acesse `http://localhost:5001`

3. Abra as DevTools (F12) e vá para a aba "Application" > "Service Workers" para verificar o registro

4. Teste a instalação usando o botão de instalação do navegador

## 🎨 Design

A nova tela de login apresenta:
- Background com imagem de carro de corrida (tema dark/futurista)
- Formulário semi-transparente com blur effect
- Cores verde (#10b981) como destaque principal
- Design responsivo para todos os dispositivos
- Animações suaves e transições modernas

## 📝 Notas Técnicas

- O Service Worker usa estratégia "Network First" para APIs
- Arquivos estáticos são cacheados automaticamente
- Requisições de API sempre vão para o servidor (não são cacheadas)
- O PWA funciona melhor em HTTPS (necessário para produção)

## 🔒 Segurança

- Service Worker registrado apenas em contexto seguro (HTTPS ou localhost)
- Cache não armazena dados sensíveis
- Tokens de autenticação sempre armazenados no localStorage (não no cache)

