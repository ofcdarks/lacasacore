# Configuração EasyPanel para La Casa Dark CORE

## Configuração Atual

No EasyPanel, você tem 3 domínios apontando para o mesmo serviço:
- `https://canaisdarks.com.br/` → `http://lacasacore_lacasacore:3000/`
- `https://www.canaisdarks.com.br/` → `http://lacasacore_lacasacore:3000/`
- `https://app.canaisdarks.com.br/` → `http://lacasacore_lacasacore:3000/`

## Como Funciona

O Express precisa detectar qual domínio foi acessado para servir:
- **Landing Page** em `canaisdarks.com.br` e `www.canaisdarks.com.br`
- **App/Login** em `app.canaisdarks.com.br`

## Verificação no EasyPanel

O EasyPanel precisa passar o header `Host` ou `X-Forwarded-Host` corretamente.

### Verificar Headers

1. Acesse o serviço no EasyPanel
2. Vá em **Configurações** ou **Variáveis de Ambiente**
3. Verifique se há configurações de proxy/headers

### Headers Necessários

O EasyPanel deve passar:
- `Host: app.canaisdarks.com.br` (quando acessar app.canaisdarks.com.br)
- `Host: canaisdarks.com.br` (quando acessar canaisdarks.com.br)
- `X-Forwarded-Host` (alternativa)

## Teste

Após reiniciar o servidor, acesse:
1. `https://canaisdarks.com.br/` → Deve mostrar **Landing Page**
2. `https://app.canaisdarks.com.br/` → Deve mostrar **Página de Login**

## Logs de Debug

Os logs mostrarão:
```
[Host Detection] host="app.canaisdarks.com.br", xForwardedHost="..."
[Host Detection Result] isAppSubdomain=true, isLandingDomain=false
[Route /] Servindo página de login (app subdomain)
```

ou

```
[Host Detection] host="canaisdarks.com.br", xForwardedHost="..."
[Host Detection Result] isAppSubdomain=false, isLandingDomain=true
[Route /] Servindo landing page (main domain)
```

## Se Não Funcionar

1. **Verifique os logs** - veja qual host está sendo detectado
2. **Verifique configuração do EasyPanel** - pode precisar habilitar "Preserve Host Header"
3. **Teste com curl**:
   ```bash
   curl -H "Host: app.canaisdarks.com.br" https://app.canaisdarks.com.br/
   ```

## Configuração Trust Proxy

O código já está configurado com `app.set('trust proxy', true)` para funcionar com proxy reverso.

