# URLs de Produção - La Casa Dark CORE

## URLs Principais

### Landing Page (Domínio Principal)
```
https://canaisdarks.com.br/
```
ou
```
https://www.canaisdarks.com.br/
```

### Aplicação / Login (Subdomínio App)

#### Opção 1: Com Query Parameter (Funciona Imediatamente)
```
https://app.canaisdarks.com.br/?force=app
```

#### Opção 2: Direto (Após Configurar EasyPanel)
```
https://app.canaisdarks.com.br/
```

**Nota:** Para a Opção 2 funcionar, você precisa configurar no EasyPanel:
- Adicionar header `X-Subdomain: app` para o domínio `app.canaisdarks.com.br`
- OU configurar redirect: `https://app.canaisdarks.com.br/` → `http://lacasacore_lacasacore:3000/?force=app`

### Dashboard (Após Login)
```
https://app.canaisdarks.com.br/dashboard
```
ou
```
https://app.canaisdarks.com.br/dashboard.html
```

### Outras Rotas do App

Todas essas rotas são detectadas automaticamente como app:

```
https://app.canaisdarks.com.br/api/auth/login
https://app.canaisdarks.com.br/plans
https://app.canaisdarks.com.br/thank-you
https://app.canaisdarks.com.br/viral-agents
https://app.canaisdarks.com.br/politica-de-privacidade
https://app.canaisdarks.com.br/termos-de-uso
```

## Configuração no EasyPanel

### Domínios Configurados:
- `https://canaisdarks.com.br/` → `http://lacasacore_lacasacore:3000/`
- `https://www.canaisdarks.com.br/` → `http://lacasacore_lacasacore:3000/`
- `https://app.canaisdarks.com.br/` → `http://lacasacore_lacasacore:3000/`

### Porta do Servidor:
**3000** (ou a porta definida na variável de ambiente `PORT`)

## Como Funciona

### Landing Page
- Acessar `https://canaisdarks.com.br/` → Mostra landing page React
- Acessar `https://www.canaisdarks.com.br/` → Mostra landing page React

### App / Login
- Acessar `https://app.canaisdarks.com.br/?force=app` → Mostra página de login ✅ **FUNCIONA AGORA**
- Acessar `https://app.canaisdarks.com.br/` → Mostra landing page (até configurar EasyPanel)
- Acessar `https://app.canaisdarks.com.br/dashboard` → Mostra dashboard (detectado automaticamente)

## Solução Recomendada para Produção

### Opção 1: Redirect no EasyPanel (Mais Simples)
Configure no EasyPanel para `app.canaisdarks.com.br`:
- **Redirect:** `https://app.canaisdarks.com.br/` → `http://lacasacore_lacasacore:3000/?force=app`

### Opção 2: Header Customizado (Mais Elegante)
No EasyPanel, para o domínio `app.canaisdarks.com.br`, adicione:
- **Header:** `X-Subdomain`
- **Valor:** `app`

Depois disso, `https://app.canaisdarks.com.br/` funcionará sem precisar do query parameter.

## Teste

### Testar Landing Page:
```
https://canaisdarks.com.br/
```

### Testar Login (Com Query Parameter):
```
https://app.canaisdarks.com.br/?force=app
```

### Testar Dashboard:
```
https://app.canaisdarks.com.br/dashboard
```

## Debug

Se algo não funcionar, acesse:
```
https://app.canaisdarks.com.br/debug-headers
```

Isso mostrará todos os headers recebidos pelo servidor e ajudará a diagnosticar problemas.

