# Configuração SSL/HTTPS para La Casa Dark CORE

## Problema
O erro `NET::ERR_CERT_AUTHORITY_INVALID` ocorre quando você tenta acessar `https://app.canaisdarks.com.br` mas o servidor não tem certificado SSL configurado.

## Soluções

### Opção 1: Usar Proxy Reverso (Recomendado para Produção)

A melhor solução é usar um proxy reverso (Nginx, Caddy, ou Cloudflare) que lida com SSL:

#### Com Nginx:
```nginx
# /etc/nginx/sites-available/canaisdarks
server {
    listen 80;
    server_name canaisdarks.com.br app.canaisdarks.com.br;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name canaisdarks.com.br;
    
    ssl_certificate /etc/letsencrypt/live/canaisdarks.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/canaisdarks.com.br/privkey.pem;
    
    location / {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

server {
    listen 443 ssl http2;
    server_name app.canaisdarks.com.br;
    
    ssl_certificate /etc/letsencrypt/live/canaisdarks.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/canaisdarks.com.br/privkey.pem;
    
    location / {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

#### Com Caddy (Mais Simples):
```caddy
canaisdarks.com.br {
    reverse_proxy localhost:5001
}

app.canaisdarks.com.br {
    reverse_proxy localhost:5001
}
```

Caddy automaticamente obtém e renova certificados SSL gratuitos via Let's Encrypt!

### Opção 2: SSL Direto no Node.js

Se você quiser configurar SSL diretamente no servidor Node.js:

1. **Obter certificados SSL:**
   ```bash
   # Usando Let's Encrypt (Certbot)
   sudo certbot certonly --standalone -d canaisdarks.com.br -d app.canaisdarks.com.br
   ```

2. **Configurar variáveis de ambiente:**
   ```bash
   # No arquivo .env ou variáveis de ambiente
   USE_HTTPS=true
   SSL_CERT_PATH=/etc/letsencrypt/live/canaisdarks.com.br/fullchain.pem
   SSL_KEY_PATH=/etc/letsencrypt/live/canaisdarks.com.br/privkey.pem
   HTTPS_PORT=443
   ```

3. **Estrutura de pastas:**
   ```
   Backend/
   ├── ssl/
   │   ├── cert.pem    # Certificado SSL
   │   └── key.pem     # Chave privada SSL
   └── server.js
   ```

### Opção 3: Desenvolvimento Local (HTTP)

Para desenvolvimento local, acesse via HTTP:
- `http://localhost:5001/` → Landing page
- `http://localhost:5001/?subdomain=app` → Aplicação

Ou configure hosts locais:
```bash
# Windows: C:\Windows\System32\drivers\etc\hosts
# Linux/Mac: /etc/hosts

127.0.0.1 canaisdarks.com.br
127.0.0.1 app.canaisdarks.com.br
```

Depois acesse:
- `http://canaisdarks.com.br:5001/` → Landing page
- `http://app.canaisdarks.com.br:5001/` → Aplicação

## Recomendação

**Para produção, use a Opção 1 (Proxy Reverso com Nginx ou Caddy).**

Vantagens:
- ✅ SSL automático e renovação automática
- ✅ Melhor performance
- ✅ Mais seguro
- ✅ Fácil de configurar
- ✅ Suporta múltiplos domínios facilmente

## Verificação

Após configurar SSL, verifique:
```bash
# Testar certificado
openssl s_client -connect canaisdarks.com.br:443

# Verificar SSL online
https://www.ssllabs.com/ssltest/analyze.html?d=canaisdarks.com.br
```

