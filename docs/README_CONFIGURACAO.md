# 🚀 Guia Rápido de Configuração - YouTube Integration

## ⚡ Configuração Rápida (5 minutos)

### 1. Criar Credenciais no Google Cloud Console

1. Acesse: https://console.cloud.google.com/
2. Crie um novo projeto ou selecione um existente
3. Vá em **APIs e Serviços** > **Biblioteca**
4. Procure e habilite **YouTube Data API v3**
5. Vá em **APIs e Serviços** > **Credenciais**
6. Clique em **+ Criar credenciais** > **ID do cliente OAuth**
7. Selecione **Aplicativo da Web**
8. Adicione o URI de redirecionamento:
   - `http://localhost:5001/api/youtube/oauth/callback` (desenvolvimento)
9. **Copie o ID do Cliente e o Segredo do Cliente**

### 2. Configurar Arquivo .env

No diretório `Backend/`, crie um arquivo `.env` com:

```env
YOUTUBE_CLIENT_ID=seu-client-id-aqui.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=seu-client-secret-aqui
YOUTUBE_REDIRECT_URI=http://localhost:5001/api/youtube/oauth/callback
```

### 3. Reiniciar o Servidor

```bash
npm run dev:backend
```

### 4. Testar

1. Acesse o dashboard
2. Vá em **Integração com YouTube**
3. Clique em **Conectar Canal do YouTube**
4. Autorize o acesso

## 📚 Guia Completo

Para instruções detalhadas, consulte: `CONFIGURACAO_YOUTUBE.md`

## ❓ Problemas?

- **Erro "invalid_client"**: Verifique se o `YOUTUBE_CLIENT_ID` está correto
- **Erro "redirect_uri_mismatch"**: O URI no `.env` deve corresponder exatamente ao configurado no Google Cloud Console
- **Token não funciona**: Verifique se a API do YouTube Data API v3 está habilitada

