# Debug de Detecção de Host

## Problema
O EasyPanel pode não estar passando o header `Host` correto, fazendo com que `app.canaisdarks.com.br` seja detectado como `canaisdarks.com.br`.

## Soluções Implementadas

### 1. Verificação em Múltiplas Fontes
O servidor agora verifica o host em:
- `Host` header
- `X-Forwarded-Host` header
- `hostname` do Express
- `Referer` header
- `Origin` header

### 2. Query Parameter como Fallback
Se o proxy não passar os headers corretos, você pode forçar:
- `https://app.canaisdarks.com.br/?force=app` → Força página de login
- `https://canaisdarks.com.br/?force=landing` → Força landing page

### 3. Rota de Debug
Acesse `https://app.canaisdarks.com.br/debug-headers` para ver todos os headers recebidos.

## Como Diagnosticar

### Passo 1: Verificar Headers Recebidos
1. Acesse: `https://app.canaisdarks.com.br/debug-headers`
2. Veja qual valor está em cada header
3. Procure por `host`, `x-forwarded-host`, `referer`, `origin`

### Passo 2: Verificar Logs do Servidor
Os logs mostrarão:
```
[Host Detection] host="...", hostHeader="...", xForwardedHost="...", referer="...", origin="..."
[Host Detection Result] isAppSubdomain=..., isLandingDomain=...
[Route /] shouldServeApp=...
```

### Passo 3: Configurar EasyPanel

No EasyPanel, você precisa garantir que o proxy passe o header `Host` correto:

#### Opção A: Configuração de Proxy no EasyPanel
1. Acesse as configurações do serviço
2. Procure por "Proxy Settings" ou "Headers"
3. Adicione/configure:
   - `X-Forwarded-Host: $host` (ou similar)
   - `Host: $host` (preservar header original)

#### Opção B: Usar Query Parameter Temporariamente
Enquanto o EasyPanel não está configurado corretamente, você pode:
1. Acessar `https://app.canaisdarks.com.br/?force=app`
2. Ou configurar um redirect no EasyPanel que adicione `?force=app`

## Teste Rápido

### Teste 1: Verificar Headers
```bash
curl -H "Host: app.canaisdarks.com.br" https://app.canaisdarks.com.br/debug-headers
```

### Teste 2: Forçar App via Query
Acesse: `https://app.canaisdarks.com.br/?force=app`

### Teste 3: Verificar Logs
Reinicie o servidor e acesse `https://app.canaisdarks.com.br/`
Verifique os logs para ver qual host está sendo detectado.

## Solução Temporária

Se o EasyPanel não conseguir passar os headers corretos, você pode:

1. **Criar um redirect no EasyPanel:**
   - `app.canaisdarks.com.br` → `http://lacasacore_lacasacore:3000/?force=app`

2. **Ou modificar o código para usar uma variável de ambiente:**
   ```javascript
   // Forçar app subdomain se variável de ambiente estiver definida
   if (process.env.FORCE_APP_SUBDOMAIN === 'true') {
       req.isAppSubdomain = true;
   }
   ```

## Próximos Passos

1. Acesse `/debug-headers` e veja quais headers estão chegando
2. Compartilhe os resultados para ajustarmos a detecção
3. Configure o EasyPanel para passar o header `Host` correto
4. Teste novamente sem o query parameter

