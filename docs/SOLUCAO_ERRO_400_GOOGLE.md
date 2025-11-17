# 🔧 Solução para Erro 400 do Google OAuth

## ❌ Problema: Erro 400 ao autorizar múltiplas contas Google

Se você está recebendo erro 400 ao tentar autorizar uma segunda conta Google (ou conta diferente), isso geralmente acontece por problemas de configuração.

## ✅ Soluções

### 1. Verificar Redirect URI no Google Cloud Console

O erro 400 geralmente acontece quando o `redirect_uri` não corresponde exatamente ao configurado.

**Passos:**

1. Acesse [Google Cloud Console](https://console.cloud.google.com/)
2. Vá em **APIs e Serviços** > **Credenciais**
3. Clique no seu **ID do cliente OAuth**
4. Verifique a seção **"URIs de redirecionamento autorizados"**
5. Certifique-se de que está configurado EXATAMENTE como:
   ```
   http://localhost:5001/api/youtube/oauth/callback
   ```
   - **SEM barra no final** (`/`)
   - **SEM espaços**
   - **Protocolo correto** (http:// ou https://)
   - **Porta correta** (5001 para desenvolvimento)

### 2. Verificar Arquivo .env

Abra o arquivo `Backend/.env` e verifique:

```env
YOUTUBE_REDIRECT_URI=http://localhost:5001/api/youtube/oauth/callback
```

**Certifique-se de que:**
- Não há barra no final
- Não há espaços antes ou depois
- A porta está correta (5001)
- O protocolo está correto (http:// para localhost)

### 3. Para Produção

Se estiver em produção, configure:

**No Google Cloud Console:**
```
https://seu-dominio.com/api/youtube/oauth/callback
```

**No arquivo .env:**
```env
YOUTUBE_REDIRECT_URI=https://seu-dominio.com/api/youtube/oauth/callback
```

### 4. Múltiplas Contas Google

**É normal e esperado** que você precise autorizar cada conta Google separadamente se:
- Você tem canais em contas Gmail diferentes
- Você gerencia canais de clientes diferentes

**Como funciona:**
1. Primeira conta: Clique em "Adicionar Canal" → Autorize conta 1 → Selecione canais
2. Segunda conta: Clique em "Adicionar Canal" novamente → Autorize conta 2 → Selecione canais
3. E assim por diante...

Cada autorização OAuth é independente e permite conectar os canais daquela conta específica.

## 🔍 Verificação Rápida

Execute este comando no terminal para verificar se há problemas:

```bash
# Verificar se o servidor está rodando na porta correta
netstat -an | findstr :5001

# Verificar variáveis de ambiente (se configuradas)
echo %YOUTUBE_REDIRECT_URI%
```

## 🚨 Erros Comuns

### Erro: "redirect_uri_mismatch"
- **Causa**: O redirect_uri não corresponde ao configurado
- **Solução**: Verifique ambos os lugares (Google Cloud Console e .env)

### Erro: "invalid_client"
- **Causa**: CLIENT_ID incorreto ou não configurado
- **Solução**: Verifique o YOUTUBE_CLIENT_ID no .env

### Erro: "400 Bad Request" genérico
- **Causa**: URL malformada ou parâmetros incorretos
- **Solução**: Verifique se não há espaços ou caracteres especiais na URL

## 📝 Checklist

- [ ] Redirect URI no Google Cloud Console está correto (sem barra final)
- [ ] YOUTUBE_REDIRECT_URI no .env está correto (sem barra final)
- [ ] Ambos correspondem EXATAMENTE (caractere por caractere)
- [ ] Servidor está rodando na porta correta (5001)
- [ ] YOUTUBE_CLIENT_ID está configurado corretamente
- [ ] YOUTUBE_CLIENT_SECRET está configurado corretamente
- [ ] Reiniciou o servidor após alterar o .env

## 💡 Dica

Se continuar com erro após verificar tudo:
1. Pare o servidor
2. Verifique o arquivo .env novamente
3. Reinicie o servidor
4. Tente autorizar novamente

O sistema agora limpa automaticamente a URL (remove barras finais), mas é importante que esteja configurado corretamente desde o início.

