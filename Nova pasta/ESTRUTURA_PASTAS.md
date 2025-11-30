# 📁 Estrutura de Pastas - La Casa Dark Core

## ✅ Estrutura Atual (Correta)

```
LA CASA DARK CORE/
│
├── Backend/                          # Servidor Node.js/Express
│   ├── server.js                     # Servidor principal (porta 5001)
│   ├── package.json                 # Dependências Node.js
│   ├── package-lock.json            
│   ├── imagefx.js                   # Integração ImageFX
│   ├── health-check.js              
│   │
│   ├── data/                        # Banco de dados
│   │   └── lacasadarkcore.db        
│   │
│   ├── temp_audio/                  # Arquivos temporários (gitignored)
│   │
│   ├── node_modules/                # Dependências (gitignored)
│   │
│   ├── dashboard.html               # ✅ Dashboard principal
│   ├── la-casa-dark-core-auth.html  # ✅ Página de autenticação
│   └── favicon.svg                  
│
├── docs/                             # Documentação
│   ├── MELHORIAS_ESTRATEGICAS.md
│   ├── COMO_USAR_AGENTES_ROTEIRO.md
│   └── ...
│
├── .gitignore                        
└── README.md                         

```

## 🌐 Como Acessar a Aplicação

### ✅ Método Correto (Recomendado)
**Use o Express na porta 5001:**
```
http://127.0.0.1:5001/dashboard.html
http://127.0.0.1:5001/la-casa-dark-core-auth.html
```

### ⚠️ Método Alternativo (Desenvolvimento)
**Live-server na porta 5500 (apenas para desenvolvimento frontend):**
```
http://127.0.0.1:5500/dashboard.html
http://127.0.0.1:5500/la-casa-dark-core-auth.html
```

## 🚀 Como Iniciar o Servidor

### Opção 1: Apenas Backend (Recomendado)
```powershell
cd Backend
node server.js
```
Acesse: `http://127.0.0.1:5001/dashboard.html`

### Opção 2: Backend + Live-server (Desenvolvimento)
```powershell
cd Backend
npm run dev
```
- Backend: `http://127.0.0.1:5001`
- Live-server: `http://127.0.0.1:5500`

## 📝 Notas Importantes

1. **Arquivos HTML estão no Backend/** ✅
   - `dashboard.html` → `Backend/dashboard.html`
   - `la-casa-dark-core-auth.html` → `Backend/la-casa-dark-core-auth.html`

2. **Express serve arquivos estáticos do Backend/**
   - Configurado em `server.js` com `express.static(__dirname)`
   - Porta padrão: **5001**

3. **Live-server serve para desenvolvimento frontend**
   - Configurado para servir `Backend/`
   - Porta: **5500**
   - Use apenas se precisar de hot-reload para HTML/CSS/JS

## ⚠️ Erro Comum

**"Cannot GET /dashboard.html" na porta 5500**
- **Causa:** Live-server tentando servir da raiz
- **Solução:** Use `http://127.0.0.1:5001/dashboard.html` (Express)
- **Ou:** Reinicie o live-server após a correção no `package.json`
