# 🎬 Guia de Configuração - Integração com YouTube

Este guia explica como configurar a integração com YouTube usando OAuth 2.0 do Google.

## 📋 Pré-requisitos

1. Conta Google com acesso ao YouTube
2. Acesso ao [Google Cloud Console](https://console.cloud.google.com/)
3. Projeto criado no Google Cloud Console

## 🔧 Passo a Passo

### 1. Criar um Projeto no Google Cloud Console

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/)
2. Clique em **"Selecionar um projeto"** no topo
3. Clique em **"Novo Projeto"**
4. Digite um nome para o projeto (ex: "La Casa Dark Core")
5. Clique em **"Criar"**

### 2. Habilitar a API do YouTube

1. No menu lateral, vá em **"APIs e Serviços"** > **"Biblioteca"**
2. Procure por **"YouTube Data API v3"**
3. Clique na API e depois em **"Habilitar"**
4. Aguarde alguns segundos para a API ser habilitada

### 3. Configurar a Tela de Consentimento OAuth

1. No menu lateral, vá em **"APIs e Serviços"** > **"Tela de consentimento OAuth"**
2. Selecione **"Externo"** (ou "Interno" se você tiver Workspace)
3. Preencha os campos obrigatórios:
   - **Nome do aplicativo**: La Casa Dark Core
   - **Email de suporte do usuário**: Seu email
   - **Email de contato do desenvolvedor**: Seu email
4. Clique em **"Salvar e continuar"**
5. Nas **"Escopos"**, clique em **"Adicionar ou remover escopos"**
6. Selecione os seguintes escopos:
   - `https://www.googleapis.com/auth/youtube.upload`
   - `https://www.googleapis.com/auth/youtube`
7. Clique em **"Atualizar"** e depois **"Salvar e continuar"**
8. Adicione usuários de teste (se necessário) e continue
9. Revise e **"Voltar ao painel"**

### 4. Criar Credenciais OAuth 2.0

1. No menu lateral, vá em **"APIs e Serviços"** > **"Credenciais"**
2. Clique em **"+ Criar credenciais"** > **"ID do cliente OAuth"**
3. Selecione o tipo de aplicativo: **"Aplicativo da Web"**
4. Preencha:
   - **Nome**: La Casa Dark Core - YouTube Integration
   - **URIs de redirecionamento autorizados**: 
     - `http://localhost:5001/api/youtube/oauth/callback` (para desenvolvimento)
     - `https://seu-dominio.com/api/youtube/oauth/callback` (para produção)
     - **IMPORTANTE**: A URL deve ser EXATAMENTE igual (sem barra no final, sem espaços)
5. Clique em **"Criar"**
6. **IMPORTANTE**: Copie o **ID do cliente** e o **Segredo do cliente**
   - Você verá uma tela com essas informações
   - **Salve o Segredo do cliente agora**, pois você só verá ele uma vez!

### 4.1. Configuração para Múltiplas Contas Google

Se você tem canais em contas Google diferentes:

1. **Cada conta Google precisa autorizar separadamente** - isso é normal e esperado
2. Quando autorizar uma conta diferente, o Google pode mostrar um erro 400 se:
   - O `redirect_uri` não estiver configurado corretamente no Google Cloud Console
   - A URL tiver espaços ou caracteres especiais
   - O `redirect_uri` no `.env` não corresponder exatamente ao configurado

3. **Solução**: Certifique-se de que o `YOUTUBE_REDIRECT_URI` no `.env` está EXATAMENTE igual ao configurado no Google Cloud Console:
   - Sem barra no final
   - Sem espaços
   - Protocolo correto (http:// ou https://)
   - Porta correta (se aplicável)

### 5. Configurar as Variáveis de Ambiente

1. No diretório `Backend/`, copie o arquivo `.env.example` para `.env`:
   ```bash
   cp .env.example .env
   ```

2. Abra o arquivo `.env` e preencha com suas credenciais:
   ```env
   YOUTUBE_CLIENT_ID=seu-client-id-aqui.apps.googleusercontent.com
   YOUTUBE_CLIENT_SECRET=seu-client-secret-aqui
   YOUTUBE_REDIRECT_URI=http://localhost:5001/api/youtube/oauth/callback
   ```

3. **Substitua os valores** pelos que você copiou do Google Cloud Console

### 6. Reiniciar o Servidor

1. Pare o servidor (Ctrl+C)
2. Inicie novamente:
   ```bash
   npm run dev:backend
   ```

### 7. Testar a Integração

1. Acesse o dashboard
2. Vá em **"Integração com YouTube"**
3. Clique em **"Conectar Canal do YouTube"**
4. Você será redirecionado para o Google para autorizar
5. Autorize o acesso
6. Você será redirecionado de volta para a aplicação

## 🔒 Segurança

- **NUNCA** commite o arquivo `.env` no Git
- O arquivo `.env` já está no `.gitignore`
- Use variáveis de ambiente no servidor de produção
- Mantenha suas credenciais seguras

## 🌐 Configuração para Produção

Para produção, você precisará:

1. **Adicionar o URI de redirecionamento de produção** nas credenciais OAuth:
   - No Google Cloud Console, edite suas credenciais
   - Adicione: `https://seu-dominio.com/api/youtube/oauth/callback`

2. **Configurar as variáveis de ambiente no servidor**:
   ```env
   YOUTUBE_CLIENT_ID=seu-client-id-producao.apps.googleusercontent.com
   YOUTUBE_CLIENT_SECRET=seu-client-secret-producao
   YOUTUBE_REDIRECT_URI=https://seu-dominio.com/api/youtube/oauth/callback
   ```

3. **Configurar HTTPS**: O OAuth do Google requer HTTPS em produção

## ❓ Problemas Comuns

### Erro: "invalid_client"
- Verifique se o `YOUTUBE_CLIENT_ID` está correto no `.env`
- Verifique se o servidor foi reiniciado após adicionar as variáveis

### Erro: "redirect_uri_mismatch"
- Verifique se o `YOUTUBE_REDIRECT_URI` no `.env` corresponde exatamente ao configurado no Google Cloud Console
- O URI deve ser idêntico, incluindo `http://` vs `https://` e barras no final

### Erro: "access_denied"
- Verifique se você autorizou os escopos corretos
- Verifique se a tela de consentimento OAuth está configurada corretamente

### Credenciais não funcionam
- Verifique se a API do YouTube Data API v3 está habilitada
- Verifique se as credenciais OAuth estão ativas no Google Cloud Console
- Verifique se o arquivo `.env` está no diretório `Backend/`

## 📚 Recursos Adicionais

- [Documentação do YouTube Data API](https://developers.google.com/youtube/v3)
- [Guia OAuth 2.0 do Google](https://developers.google.com/identity/protocols/oauth2)
- [Google Cloud Console](https://console.cloud.google.com/)

## ✅ Checklist

- [ ] Projeto criado no Google Cloud Console
- [ ] YouTube Data API v3 habilitada
- [ ] Tela de consentimento OAuth configurada
- [ ] Credenciais OAuth 2.0 criadas
- [ ] ID do cliente e Segredo do cliente copiados
- [ ] Arquivo `.env` criado e configurado
- [ ] Servidor reiniciado
- [ ] Integração testada com sucesso

---

**Pronto!** Após seguir estes passos, sua integração com YouTube estará configurada e funcionando. 🎉

