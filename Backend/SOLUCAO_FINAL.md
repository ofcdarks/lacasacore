# Solução Final - Detecção Automática de Rotas do App

## Problema

O EasyPanel está normalizando todos os domínios (`canaisdarks.com.br`, `www.canaisdarks.com.br`, `app.canaisdarks.com.br`) para o mesmo host: `canaisdarks.com.br`. Isso faz com que o servidor não consiga diferenciar entre landing page e app.

## Solução Implementada

O servidor agora detecta automaticamente quando uma requisição é para uma rota do app, mesmo quando o host está normalizado.

### Rotas do App Detectadas Automaticamente:
- `/dashboard`
- `/la-casa-dark-core-auth`
- `/api/*` (todas as rotas de API)
- `/plans`
- `/thank-you`
- `/viral-agents`
- `/politica-de-privacidade`
- `/termos-de-uso`

### Como Funciona:

1. **Prioridade 1:** Query parameter `?force=app` ou `?force=landing`
2. **Prioridade 2:** Headers customizados `X-Subdomain: app` ou `X-Original-Host: app.canaisdarks.com.br`
3. **Prioridade 3:** Detecção automática por rota - se a rota for do app, assume que veio de `app.canaisdarks.com.br`
4. **Prioridade 4:** Detecção padrão por host (não funciona quando EasyPanel normaliza)

## Resultado

Agora, quando você acessar:
- `https://app.canaisdarks.com.br/dashboard` → Servirá o dashboard (mesmo que o host seja normalizado)
- `https://app.canaisdarks.com.br/` → Servirá a landing page (rota raiz não é detectada como app)
- `https://app.canaisdarks.com.br/?force=app` → Forçará página de login
- `https://canaisdarks.com.br/` → Servirá landing page

## Solução para Rota Raiz (`/`)

Para a rota raiz (`/`), você tem duas opções:

### Opção 1: Usar Query Parameter (Recomendado)
Configure no EasyPanel um redirect para `app.canaisdarks.com.br` que adicione `?force=app`:
- `https://app.canaisdarks.com.br/` → `http://lacasacore_lacasacore:3000/?force=app`

### Opção 2: Configurar Header no EasyPanel
No EasyPanel, para o domínio `app.canaisdarks.com.br`, adicione:
- Header: `X-Subdomain`
- Valor: `app`

## Teste

1. **Acesse:** `https://app.canaisdarks.com.br/dashboard` → Deve funcionar automaticamente
2. **Acesse:** `https://app.canaisdarks.com.br/?force=app` → Deve mostrar login
3. **Acesse:** `https://canaisdarks.com.br/` → Deve mostrar landing page

## Logs Esperados

Para rotas do app:
```
[Host Detection] ⚡ Rota do app detectada (/dashboard) mas host normalizado - ASSUMINDO app subdomain
```

Para query parameter:
```
[Host Detection] ⚡ Query parameter force=app detectado - FORÇANDO app subdomain
```

## Próximos Passos

1. **Teste as rotas do app** - devem funcionar automaticamente agora
2. **Para a rota raiz (`/`)**, use `?force=app` ou configure o header no EasyPanel
3. **Verifique os logs** para confirmar que está funcionando

