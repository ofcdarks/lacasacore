# 🚨 Troubleshooting - Deploy no EasyPanel

Este guia ajuda a resolver problemas comuns ao fazer deploy no EasyPanel.

## 📋 Checklist Pré-Deploy

Antes de fazer deploy, verifique:

- [ ] Dockerfile está na raiz do projeto
- [ ] Dockerfile está configurado corretamente
- [ ] package.json está na pasta Backend
- [ ] Todas as dependências estão no package.json
- [ ] Variáveis de ambiente necessárias estão configuradas no EasyPanel

## 🔧 Configuração do EasyPanel

### 1. Estrutura do Projeto

O EasyPanel precisa que o Dockerfile esteja na **raiz do repositório**:

```
LA CASA DARK CORE/
├── Dockerfile          ← Deve estar aqui (raiz)
├── Backend/
│   ├── server.js
│   ├── package.json
│   └── ...
└── ...
```

### 2. Configuração no EasyPanel

1. **Tipo de Aplicação**: Selecione "Docker" ou "Git Repository"
2. **Repositório**: Configure o repositório Git
3. **Branch**: `main` (ou sua branch principal)
4. **Dockerfile Path**: Deixe vazio (EasyPanel detecta automaticamente na raiz)
5. **Porta**: Configure como `5001` (ou a porta definida na variável PORT)

### 3. Variáveis de Ambiente Obrigatórias

Configure estas variáveis no EasyPanel:

#### Variáveis Básicas:
```
PORT=5001
NODE_ENV=production
```

#### Variáveis do Banco de Dados:
```
DB_PATH=/app/data/lacasadarkcore.db
```

#### Variáveis do YouTube (se usar):
```
YOUTUBE_CLIENT_ID=seu_client_id
YOUTUBE_CLIENT_SECRET=seu_client_secret
YOUTUBE_REDIRECT_URI=https://seu-dominio.com/api/youtube/oauth/callback
```

#### Variáveis de API (se usar):
```
OPENAI_API_KEY=sua_chave_openai
GOOGLE_GENAI_API_KEY=sua_chave_google
```

## 🐛 Erros Comuns e Soluções

### Erro 1: "Cannot find module"

**Sintomas:**
```
Error: Cannot find module 'express'
Error: Cannot find module './server.js'
```

**Causa:** 
- Dependências não instaladas
- package.json no lugar errado
- Dockerfile copiando arquivos incorretamente

**Solução:**
1. Verifique se o Dockerfile está copiando o `package.json` da pasta `Backend`
2. Verifique se o `npm install` está sendo executado
3. Verifique os logs do build no EasyPanel

### Erro 2: "Port already in use" ou "EADDRINUSE"

**Sintomas:**
```
Error: listen EADDRINUSE: address already in use :::5001
```

**Causa:**
- Porta já está em uso
- Porta não configurada corretamente no EasyPanel

**Solução:**
1. No EasyPanel, configure a porta como `5001` (ou a porta que você definiu)
2. Verifique se não há outro container usando a mesma porta
3. Reinicie o container

### Erro 3: "ENOENT: no such file or directory"

**Sintomas:**
```
Error: ENOENT: no such file or directory, open '/app/data/lacasadarkcore.db'
```

**Causa:**
- Diretório `data` não foi criado
- Permissões incorretas

**Solução:**
1. O Dockerfile deve criar o diretório `data`:
   ```dockerfile
   RUN mkdir -p data temp_audio
   ```
2. Verifique se as permissões estão corretas

### Erro 4: "Build failed" ou "Docker build error"

**Sintomas:**
- Build falha no EasyPanel
- Erro ao construir a imagem Docker

**Causa:**
- Dockerfile com sintaxe incorreta
- Dependências não encontradas
- Problemas de rede durante o build

**Solução:**
1. Teste o Dockerfile localmente:
   ```bash
   docker build -t test-app .
   ```
2. Verifique se todas as dependências estão no package.json
3. Verifique os logs completos do build no EasyPanel

### Erro 5: "Container exits immediately"

**Sintomas:**
- Container inicia e para imediatamente
- Status mostra "Exited"

**Causa:**
- Erro no código que faz o processo terminar
- Variáveis de ambiente faltando
- Erro ao iniciar o servidor

**Solução:**
1. Verifique os logs do container no EasyPanel
2. Verifique se todas as variáveis de ambiente estão configuradas
3. Teste o servidor localmente primeiro:
   ```bash
   node Backend/server.js
   ```

### Erro 6: "Permission denied"

**Sintomas:**
```
Error: EACCES: permission denied, mkdir '/app/data'
```

**Causa:**
- Permissões incorretas no container
- Usuário sem permissões

**Solução:**
1. O Dockerfile deve configurar o usuário correto:
   ```dockerfile
   RUN chown -R node:node /app
   USER node
   ```

### Erro 7: "Module not found" para módulos nativos

**Sintomas:**
```
Error: Cannot find module 'sqlite3'
Error: The module 'sharp' was compiled against a different Node.js version
```

**Causa:**
- Módulos nativos não compilados corretamente
- Versão do Node.js incompatível

**Solução:**
1. O Dockerfile deve instalar dependências de build:
   ```dockerfile
   RUN apt-get install -y build-essential python3
   ```
2. Rebuild módulos nativos após instalar:
   ```dockerfile
   RUN npm rebuild sqlite3 --build-from-source
   ```

## 🔍 Como Diagnosticar Problemas

### 1. Verificar Logs no EasyPanel

1. Acesse o EasyPanel
2. Vá para sua aplicação
3. Clique em **"Logs"** ou **"View Logs"**
4. Procure por erros em vermelho

### 2. Testar Dockerfile Localmente

```bash
# Construir a imagem
docker build -t la-casa-dark-core .

# Executar o container
docker run -p 5001:5001 \
  -e PORT=5001 \
  -e NODE_ENV=production \
  la-casa-dark-core
```

### 3. Verificar Estrutura de Arquivos

```bash
# Verificar se os arquivos estão no lugar certo
ls -la Backend/
ls -la Backend/package.json
ls -la Dockerfile
```

### 4. Verificar Variáveis de Ambiente

No EasyPanel, verifique se todas as variáveis estão configuradas:
- Clique em **"Environment Variables"** ou **"Variables"**
- Verifique se não há espaços extras nos nomes
- Verifique se os valores estão corretos

## 📝 Configuração Recomendada no EasyPanel

### Configurações Básicas:

- **Name**: La Casa Dark Core
- **Type**: Docker
- **Repository**: Seu repositório Git
- **Branch**: main
- **Dockerfile Path**: (deixe vazio - detecta automaticamente)
- **Port**: 5001
- **Auto Deploy**: Habilitado (opcional)

### Health Check (Recomendado):

Configure um health check no EasyPanel:
- **Path**: `/health` ou `/api/health`
- **Port**: 5001
- **Interval**: 30s

## ✅ Checklist de Deploy

Antes de fazer deploy, verifique:

- [ ] Dockerfile está na raiz do projeto
- [ ] Dockerfile está correto e testado localmente
- [ ] package.json está na pasta Backend
- [ ] Todas as dependências estão no package.json
- [ ] Variáveis de ambiente configuradas no EasyPanel
- [ ] Porta configurada corretamente (5001)
- [ ] Repositório Git está atualizado
- [ ] Build testado localmente
- [ ] Logs verificados após deploy

## 🚀 Passos para Deploy

1. **Commit e Push:**
   ```bash
   git add .
   git commit -m "Preparar para deploy"
   git push origin main
   ```

2. **No EasyPanel:**
   - Acesse sua aplicação
   - Clique em **"Deploy"** ou **"Redeploy"**
   - Aguarde o build completar

3. **Verificar:**
   - Verifique os logs
   - Teste a aplicação no navegador
   - Verifique se o health check está funcionando

## 📞 Ainda com Problemas?

Se ainda estiver com problemas:

1. **Copie os logs completos** do EasyPanel
2. **Verifique o Dockerfile** - compare com o exemplo correto
3. **Teste localmente** - execute `docker build` e `docker run` localmente
4. **Verifique a documentação** do EasyPanel

## 🔗 Links Úteis

- [Documentação EasyPanel](https://easypanel.io/docs)
- [Documentação Docker](https://docs.docker.com/)
- [Node.js Docker Best Practices](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md)

---

**Última atualização:** 2025-11-30

