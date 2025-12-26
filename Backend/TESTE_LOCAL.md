# Como Testar Localmente

## 📋 Pré-requisitos

1. **Node.js** instalado (versão 16 ou superior)
2. **Dependências** instaladas:
   ```bash
   cd Backend
   npm install
   ```

## 🚀 Iniciar o Servidor

1. **Navegue até a pasta Backend:**
   ```bash
   cd Backend
   ```

2. **Inicie o servidor:**
   ```bash
   node server.js
   ```

3. **Verifique se está rodando:**
   Você deve ver uma mensagem como:
   ```
   🚀 Servidor "La Casa Dark Core" a rodar na porta 3000 (HTTP)
   ✅ Banco de dados inicializado e pronto
   ```

## 🌐 Acessar a Aplicação

### Opção 1: Usando Query Parameter (Mais Simples) ⭐ RECOMENDADO

#### Landing Page (Domínio Principal)
```
http://localhost:3000/
```
ou explicitamente:
```
http://localhost:3000/?force=landing
```

#### App/Login (Subdomínio App)
```
http://localhost:3000/?force=app
```
ou (alternativa):
```
http://localhost:3000/?subdomain=app
```

### Opção 2: Configurar Hosts Locais (Mais Realista)

#### Windows (C:\Windows\System32\drivers\etc\hosts)
1. Abra o Bloco de Notas como **Administrador**
2. Abra o arquivo: `C:\Windows\System32\drivers\etc\hosts`
3. Adicione estas linhas no final:
   ```
   127.0.0.1 canaisdarks.com.br
   127.0.0.1 app.canaisdarks.com.br
   ```
4. Salve o arquivo

#### Depois de configurar hosts:
- **Landing Page:** `http://canaisdarks.com.br:3000/`
- **App/Login:** `http://app.canaisdarks.com.br:3000/`

### Opção 3: Usando Header Customizado (Para testes de API)

Se você estiver usando um cliente HTTP (Postman, curl, etc.):
```bash
curl -H "x-subdomain: app" http://localhost:3000/
```

## ✅ Verificar se está funcionando

### Landing Page deve mostrar:
- ✅ Hero section com "Escale seus Canais Dark com IA"
- ✅ Cards de lifestyle
- ✅ Seção de preços
- ✅ Footer com logo correto

### App/Login deve mostrar:
- ✅ Tela de login com campos de email e senha
- ✅ Botão "Acessar o Core" com efeito pulsante
- ✅ Link "Solicitar acesso ao Core"

## 🧪 Testar Funcionalidades Específicas

### 1. Testar Análise de Vídeo

1. **Faça login** na aplicação (`http://localhost:3000/?force=app`)
2. **Navegue até "Analisador de Vídeos"**
3. **Cole uma URL do YouTube** (ex: `https://www.youtube.com/watch?v=VIDEO_ID`)
4. **Clique em "Analisar"**
5. **Verifique se os dados aparecem:**
   - ✅ **Nicho Detetado** (não deve ser "N/A")
   - ✅ **Subnicho Detetado** (não deve ser "N/A")
   - ✅ **Análise do Título Original:**
     - Motivo do Sucesso (não deve ser "N/A")
     - Fórmula (não deve ser "N/A")
   - ✅ **Títulos Gerados** (pelo menos 5 títulos)

### 2. Testar Carregamento do Histórico

1. **Após fazer uma análise**, vá para **"Pastas e Histórico"**
2. **Clique no botão de carregar** (ícone de upload) de uma análise antiga
3. **Verifique se os dados aparecem corretamente:**
   - ✅ Nicho e Subnicho
   - ✅ Análise do Título Original completa
   - ✅ Títulos gerados

### 3. Testar Dashboard

1. **Acesse o Dashboard** (ícone "Início")
2. **Verifique se os dados aparecem:**
   - ✅ Total de Vídeos
   - ✅ Total de Views
   - ✅ Receita Total
   - ✅ Créditos Disponíveis
   - ✅ Armazenamento

## 🐛 Debug

### Verificar Logs do Servidor

Se algo não estiver funcionando, verifique os logs do servidor. Você verá:

**Para Landing Page:**
```
[Host Detection] host="localhost", hostname="localhost", isAppSubdomain=false, isLandingDomain=true
[Route /] Servindo landing page (main domain)
```

**Para App/Login:**
```
[Host Detection] host="localhost", hostname="localhost", isAppSubdomain=true, isLandingDomain=false
[Route /] Servindo página de login (app subdomain)
```

**Para Análise de Vídeo:**
```
[Análise] Salvando dados de análise: { motivoSucesso: "...", formulaTitulo: "...", niche: "...", subniche: "..." }
[Histórico] Dados de análise para {analysisId}: { motivoSucesso: "...", formulaTitulo: "...", niche: "...", subniche: "..." }
```

### Problemas Comuns

#### 1. Porta já em uso
**Erro:** `EADDRINUSE: address already in use :::3000`

**Solução:**
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:3000 | xargs kill -9
```

#### 2. Banco de dados não inicializado
**Erro:** `Banco de dados não está disponível`

**Solução:**
- Verifique se o arquivo `Backend/data/lacasacorebd.db` existe
- Se não existir, o servidor deve criá-lo automaticamente na primeira execução
- Verifique as permissões da pasta `Backend/data/`

#### 3. Dados não aparecem na análise
**Sintoma:** Campos mostrando "N/A"

**Solução:**
- Verifique os logs do servidor para ver se há erros
- Os dados devem ser gerados automaticamente mesmo se a IA não retornar
- Verifique se `deriveTitleAnalysis` está sendo chamado corretamente

## 🔧 Configuração Avançada

### Variáveis de Ambiente (.env)

Crie um arquivo `.env` na pasta `Backend` com:

```env
PORT=3000
JWT_SECRET=sua_chave_secreta_aqui
DB_PATH=./data/lacasacorebd.db
```

### Porta Personalizada

Por padrão, o servidor usa a porta **3000**. Para mudar:

1. **Via variável de ambiente:**
   ```bash
   PORT=5001 node server.js
   ```

2. **Via arquivo .env:**
   ```env
   PORT=5001
   ```

## 📝 Checklist de Testes

- [ ] Servidor inicia sem erros
- [ ] Landing page carrega corretamente
- [ ] App/Login carrega corretamente
- [ ] Login funciona
- [ ] Dashboard carrega dados
- [ ] Análise de vídeo funciona
- [ ] Dados de análise aparecem (nícho, subnicho, fórmula)
- [ ] Histórico carrega análises antigas
- [ ] Dados do histórico aparecem corretamente
- [ ] Títulos gerados aparecem
- [ ] Botões e links funcionam

## 🆘 Suporte

Se encontrar problemas:
1. Verifique os logs do servidor
2. Verifique o console do navegador (F12)
3. Verifique se todas as dependências estão instaladas
4. Verifique se o banco de dados está acessível

