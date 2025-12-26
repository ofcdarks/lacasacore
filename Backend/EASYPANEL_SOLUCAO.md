# Solução para EasyPanel - Detecção de Subdomínio

## Problema Identificado

Os logs mostram que o EasyPanel está normalizando todos os domínios para `canaisdarks.com.br`:
```
[Host Detection] host="canaisdarks.com.br", hostHeader="canaisdarks.com.br", ...
```

Isso significa que quando você acessa `app.canaisdarks.com.br`, o EasyPanel está passando `host="canaisdarks.com.br"` em vez de `host="app.canaisdarks.com.br"`.

## Soluções Implementadas

O servidor agora aceita **3 formas** de detectar o subdomínio app:

### 1. Query Parameter (Funciona Imediatamente)
- `https://app.canaisdarks.com.br/?force=app` → Força página de login
- `https://canaisdarks.com.br/?force=landing` → Força landing page

### 2. Header X-Subdomain (Recomendado)
O EasyPanel pode passar o header `X-Subdomain: app` para `app.canaisdarks.com.br`

### 3. Header X-Original-Host (Alternativa)
O EasyPanel pode passar o header `X-Original-Host: app.canaisdarks.com.br` para `app.canaisdarks.com.br`

## Como Configurar no EasyPanel

### Opção A: Configurar Header X-Subdomain (Mais Simples)

No EasyPanel, para o domínio `app.canaisdarks.com.br`:

1. Acesse as configurações do domínio `app.canaisdarks.com.br`
2. Procure por "Headers" ou "Custom Headers" ou "Proxy Headers"
3. Adicione um header customizado:
   - **Nome do Header:** `X-Subdomain`
   - **Valor:** `app`

### Opção B: Configurar Header X-Original-Host

No EasyPanel, para o domínio `app.canaisdarks.com.br`:

1. Acesse as configurações do domínio `app.canaisdarks.com.br`
2. Procure por "Headers" ou "Custom Headers" ou "Proxy Headers"
3. Adicione um header customizado:
   - **Nome do Header:** `X-Original-Host`
   - **Valor:** `app.canaisdarks.com.br`

### Opção C: Redirect com Query Parameter (Solução Temporária)

Se o EasyPanel não suportar headers customizados, configure um redirect:

1. No EasyPanel, para o domínio `app.canaisdarks.com.br`
2. Configure um redirect que adicione `?force=app`:
   - `https://app.canaisdarks.com.br/` → `http://lacasacore_lacasacore:3000/?force=app`

## Teste

Após configurar, teste:

1. **Acesse:** `https://app.canaisdarks.com.br/debug-headers`
2. **Verifique** se o header `x-subdomain` ou `x-original-host` está presente
3. **Acesse:** `https://app.canaisdarks.com.br/` → Deve mostrar a página de login

## Logs Esperados

Após configurar corretamente, você verá nos logs:

```
[Host Detection] ⚡ Header X-Subdomain=app detectado - FORÇANDO app subdomain
```

ou

```
[Host Detection] ⚡ Header X-Original-Host="app.canaisdarks.com.br" detectado - FORÇANDO app subdomain
```

## Solução Temporária (Sem Mudanças no EasyPanel)

Enquanto não configura o EasyPanel, use:
- `https://app.canaisdarks.com.br/?force=app` → Página de login
- `https://canaisdarks.com.br/` → Landing page

## Verificação

Acesse `/debug-headers` para ver todos os headers recebidos e verificar se a configuração está funcionando.

