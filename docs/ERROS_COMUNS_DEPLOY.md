# 🚨 Erros Comuns no Deploy - Solução Rápida

## ⚡ Soluções Rápidas

### ❌ Erro: "Cannot find module 'express'"
**Solução:**
- Verifique se o Dockerfile está copiando `Backend/package.json` corretamente
- Verifique se `npm install` está sendo executado
- Verifique os logs do build no EasyPanel

### ❌ Erro: "Port 5001 already in use"
**Solução:**
- No EasyPanel, configure a porta como `5001` nas configurações do container
- Verifique se não há outro container usando a mesma porta

### ❌ Erro: "ENOENT: no such file or directory, open '/app/data/lacasadarkcore.db'"
**Solução:**
- O Dockerfile já cria o diretório `data` automaticamente
- Verifique se as permissões estão corretas (já configurado no Dockerfile)

### ❌ Erro: "Container exits immediately"
**Solução:**
1. Verifique os logs do container no EasyPanel
2. Verifique se todas as variáveis de ambiente estão configuradas
3. Teste localmente: `docker build -t test . && docker run -p 5001:5001 test`

### ❌ Erro: "Build failed"
**Solução:**
1. Teste o Dockerfile localmente:
   ```bash
   docker build -t la-casa-dark-core .
   ```
2. Verifique se todas as dependências estão no `Backend/package.json`
3. Verifique os logs completos do build no EasyPanel

## 📋 Checklist Rápido

- [ ] Dockerfile está na raiz do projeto ✅
- [ ] Dockerfile está correto (já corrigido) ✅
- [ ] Porta configurada como 5001 no EasyPanel
- [ ] Variáveis de ambiente configuradas no EasyPanel
- [ ] Repositório Git está atualizado

## 🔧 Configuração no EasyPanel

### Variáveis de Ambiente Mínimas:
```
PORT=5001
NODE_ENV=production
```

### Porta:
Configure a porta como **5001** nas configurações do container no EasyPanel.

## 📞 Precisa de Mais Ajuda?

Consulte o guia completo: `docs/TROUBLESHOOTING_DEPLOY_EASYPANEL.md`

