# Como Testar Localmente

## Opção 1: Usando Query Parameter (Mais Simples)

### Landing Page (Domínio Principal)
```
http://localhost:3000/
```
ou
```
http://localhost:5001/
```

### App/Login (Subdomínio App)
```
http://localhost:3000/?subdomain=app
```
ou
```
http://localhost:5001/?subdomain=app
```

## Opção 2: Configurar Hosts Locais (Mais Realista)

### Windows (C:\Windows\System32\drivers\etc\hosts)
Adicione estas linhas ao arquivo `hosts`:
```
127.0.0.1 canaisdarks.com.br
127.0.0.1 app.canaisdarks.com.br
```

**Nota:** Você precisa de permissões de administrador para editar este arquivo.

### Depois de configurar hosts:
- **Landing Page:** `http://canaisdarks.com.br:3000/`
- **App/Login:** `http://app.canaisdarks.com.br:3000/`

## Opção 3: Usando Header Customizado

Se você estiver usando um cliente HTTP (Postman, curl, etc.):
```bash
curl -H "x-subdomain: app" http://localhost:3000/
```

## Verificar se está funcionando

1. **Landing Page** deve mostrar:
   - Hero section com "Escale seus Canais Dark com IA"
   - Cards de lifestyle
   - Seção de preços
   - Footer

2. **App/Login** deve mostrar:
   - Tela de login com campos de email e senha
   - Botão "Acessar o Core"
   - Link "Solicitar acesso ao Core"

## Debug

Se não estiver funcionando, verifique os logs do servidor. Você verá:
```
[Host Detection] host="...", hostname="...", isAppSubdomain=..., isLandingDomain=...
[Route /] Servindo página de login (app subdomain)
```
ou
```
[Route /] Servindo landing page (main domain)
```

## Porta do Servidor

A porta padrão é **3000** (ou **5001** se configurado no `.env`).

Verifique qual porta está sendo usada nos logs:
```
🚀 Servidor "La Casa Dark Core" a rodar na porta 3000 (HTTP)
```

